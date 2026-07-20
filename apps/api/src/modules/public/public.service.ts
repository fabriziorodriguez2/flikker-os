import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  Benefit,
  BenefitType,
  MessageChannel,
  MessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { ReviewRequestQueue } from '../../jobs/review-request.queue';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { normalizeToE164 } from '../../common/utils/phone.util';

const QR_REVIEW_DELAY_MS = 2 * 60 * 1000; // 2 minutos

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsApp: WhatsAppBspService,
    private readonly reviewRequestQueue: ReviewRequestQueue,
    private readonly benefits: BenefitsRepository,
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

    const benefit = await this.resolveActiveBenefit(businessId);
    const fallbackOffer = business.campaigns[0]?.offerText ?? null;

    return {
      businessName: business.name,
      logoUrl: business.logoUrl ?? null,
      primaryColor: business.primaryColor ?? null,
      googleBusinessProfileUrl: business.googleBusinessProfileUrl ?? null,
      // Hook text: active benefit title takes precedence over the legacy offer.
      benefitText: benefit?.title ?? fallbackOffer,
      benefit: benefit
        ? {
            type: benefit.type,
            title: benefit.title,
            description: benefit.description,
            terms: benefit.terms,
          }
        : null,
    };
  }

  async captureContact(
    businessId: string,
    name: string,
    rawPhone: string,
    rawBirthdate?: string,
  ) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId, isActive: true },
      select: {
        id: true,
        name: true,
        phone: true,
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

    let phoneE164: string;
    try {
      phoneE164 = normalizeToE164(rawPhone);
    } catch {
      throw new BadRequestException('Número de teléfono inválido');
    }

    // Parse optional birthday — silently ignore if malformed (it's an optional
    // capture field, we don't want to fail the whole registration over it).
    let birthday: Date | undefined;
    if (rawBirthdate) {
      const parsed = new Date(rawBirthdate);
      if (!Number.isNaN(parsed.getTime())) {
        birthday = parsed;
      }
    }

    const existing = await this.prisma.customer.findFirst({
      where: { businessId, phoneE164, isActive: true },
    });

    let customerId: string;

    if (existing) {
      await this.prisma.customer.update({
        where: { id: existing.id },
        data: {
          name,
          // Only overwrite birthday if a new one is provided and none stored.
          ...(birthday && !existing.birthday ? { birthday } : {}),
        },
      });
      customerId = existing.id;
    } else {
      const created = await this.prisma.customer.create({
        data: {
          businessId,
          name,
          phoneE164,
          origin: 'qr',
          ...(birthday ? { birthday } : {}),
        },
      });
      customerId = created.id;
    }

    const benefit = await this.resolveActiveBenefit(businessId);

    // If the active benefit is a raffle, record this customer as a participant.
    if (benefit && benefit.type === BenefitType.raffle) {
      void this.tryRegisterRaffleParticipation(
        businessId,
        benefit.id,
        customerId,
      );
    }

    // Send WhatsApp welcome — never throw
    void this.trySendWelcome(
      phoneE164,
      name,
      business.name,
      benefit?.title ?? business.campaigns[0]?.offerText ?? null,
    );

    void this.trySendOwnerNotification(business.id, business.name, business.phone ?? null, name);

    // Enqueue review request with 2-minute delay — never throw
    void this.tryEnqueueQrReviewRequest(
      businessId,
      customerId,
      business.campaigns[0]?.id ?? null,
    );

    return { ok: true };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Returns the business's active benefit, but only when it is currently valid:
   * type is not `none` and (if set) the current date is within its window.
   * Falls back to null so callers use the legacy offer text.
   */
  private async resolveActiveBenefit(
    businessId: string,
    now = new Date(),
  ): Promise<Benefit | null> {
    const benefit = await this.benefits.findActive(businessId);
    if (!benefit) return null;
    if (benefit.type === BenefitType.none) return null;
    if (benefit.startDate && benefit.startDate > now) return null;
    if (benefit.endDate && benefit.endDate < now) return null;
    return benefit;
  }

  private async tryRegisterRaffleParticipation(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    try {
      await this.benefits.registerParticipation(
        businessId,
        benefitId,
        customerId,
      );
    } catch (error) {
      this.logger.warn(
        `Raffle participation failed for customer ${customerId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

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

  private async trySendOwnerNotification(
    businessId: string,
    businessName: string,
    phone: string | null,
    customerName: string,
  ) {
    if (!phone) return;
    try {
      const baseUrl =
        process.env.APP_PUBLIC_URL ??
        process.env.WEB_BASE_URL ??
        'https://app.flikker.com';
      const contactsUrl = `${baseUrl.replace(/\/$/, '')}/dashboard/customers`;
      const text = [
        `📱 *Nuevo contacto en ${businessName}*`,
        '',
        `${customerName} escaneó tu QR y quedó en tu base.`,
        'Ya le enviamos el pedido de reseña por WhatsApp.',
        '',
        `👉 Ver contactos: ${contactsUrl}`,
      ].join('\n');
      await this.whatsApp.sendText({ phone, text });
    } catch (error) {
      this.logger.warn(
        `Owner QR notification failed for business ${businessId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async tryEnqueueQrReviewRequest(
    businessId: string,
    customerId: string,
    campaignId: string | null,
  ) {
    try {
      const trackingToken = randomBytes(8).toString('base64url');
      const message = await this.prisma.message.create({
        data: {
          businessId,
          customerId,
          campaignId: campaignId ?? undefined,
          channel: MessageChannel.whatsapp,
          trackingToken,
          status: MessageStatus.queued,
        },
        select: { id: true },
      });
      await this.reviewRequestQueue.enqueue(
        { messageId: message.id, customerId, businessId },
        QR_REVIEW_DELAY_MS,
      );
    } catch (error) {
      this.logger.warn(
        `QR review request enqueue failed for customer ${customerId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
