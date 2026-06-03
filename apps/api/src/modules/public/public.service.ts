import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { normalizeToE164 } from '../../common/utils/phone.util';

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsApp: WhatsAppBspService,
  ) {}

  async getQrInfo(businessId: string, userAgent?: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId, isActive: true },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        googleBusinessProfileUrl: true,
        campaigns: {
          where: { status: 'ACTIVE', templateKind: 'qr_capture' },
          select: { id: true, offerText: true },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!business) throw new NotFoundException('Business not found');

    // Record scan in background — never throw
    void this.tryRecordScan(
      businessId,
      business.campaigns[0]?.id ?? null,
      userAgent,
    );

    return {
      businessName: business.name,
      logoUrl: business.logoUrl ?? null,
      primaryColor: business.primaryColor ?? null,
      googleBusinessProfileUrl: business.googleBusinessProfileUrl ?? null,
      benefitText: business.campaigns[0]?.offerText ?? null,
    };
  }

  async captureContact(businessId: string, name: string, rawPhone: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId, isActive: true },
      select: {
        id: true,
        name: true,
        googleBusinessProfileUrl: true,
        campaigns: {
          where: { status: 'ACTIVE', templateKind: 'qr_capture' },
          select: { offerText: true },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!business) throw new NotFoundException('Business not found');

    let phoneE164: string;
    try {
      phoneE164 = normalizeToE164(rawPhone);
    } catch {
      throw new BadRequestException('Número de teléfono inválido');
    }

    const existing = await this.prisma.customer.findFirst({
      where: { businessId, phoneE164, isActive: true },
    });

    if (existing) {
      await this.prisma.customer.update({
        where: { id: existing.id },
        data: { name },
      });
    } else {
      await this.prisma.customer.create({
        data: { businessId, name, phoneE164, origin: 'qr' },
      });
    }

    // Send WhatsApp welcome — never throw
    void this.trySendWelcome(
      phoneE164,
      name,
      business.name,
      business.campaigns[0]?.offerText ?? null,
    );

    return { ok: true };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async tryRecordScan(
    businessId: string,
    campaignId: string | null,
    userAgent?: string,
  ) {
    if (!campaignId) return; // No active campaign → skip tracking

    try {
      const slugSuffix = businessId.slice(0, 8);
      const defaultSlug = `flikker-qr-${slugSuffix}`;

      let qrCode = await this.prisma.qrCode.findFirst({
        where: { businessId, slug: defaultSlug },
        select: { id: true },
      });

      if (!qrCode) {
        try {
          qrCode = await this.prisma.qrCode.create({
            data: {
              businessId,
              campaignId,
              slug: defaultSlug,
              label: 'QR Captación',
            },
            select: { id: true },
          });
        } catch {
          // Race: another request created it simultaneously
          qrCode = await this.prisma.qrCode.findFirst({
            where: { businessId, slug: defaultSlug },
            select: { id: true },
          });
          if (!qrCode) return;
        }
      }

      await this.prisma.$transaction([
        this.prisma.scanEvent.create({
          data: {
            qrCodeId: qrCode.id,
            campaignId,
            businessId,
            userAgent: userAgent ?? null,
            landingShown: true,
            scannedAt: new Date(),
          },
        }),
        this.prisma.qrCode.update({
          where: { id: qrCode.id },
          data: {
            scannedCount: { increment: 1 },
            lastScannedAt: new Date(),
          },
        }),
      ]);
    } catch (error) {
      this.logger.warn(
        `Scan tracking failed for business ${businessId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async trySendWelcome(
    phoneE164: string,
    customerName: string,
    businessName: string,
    benefitText: string | null,
  ) {
    try {
      const body = benefitText
        ? `Hola ${customerName}! 🎉 Quedaste registrado en *${businessName}*.\nTu beneficio: ${benefitText}\nPróximamente nos ponemos en contacto.`
        : `Hola ${customerName}! 👋 Gracias por registrarte en *${businessName}*. Te avisamos cuando haya novedades para vos.`;

      await this.whatsApp.sendText({ phone: phoneE164, text: body });
    } catch (error) {
      this.logger.warn(
        `WhatsApp welcome failed for ${phoneE164}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
