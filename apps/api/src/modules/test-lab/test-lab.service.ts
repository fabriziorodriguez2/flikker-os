import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';

@Injectable()
export class TestLabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppBspService: WhatsAppBspService,
  ) {}

  async getOverview(businessId: string) {
    const [business, campaigns, reviewCount, widget] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          googleBusinessProfileUrl: true,
          whatsappUrl: true,
          status: true,
          messageQuotaMonthly: true,
          messageCountCurrentMonth: true,
        },
      }),
      this.prisma.campaign.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          channel: true,
          templateKind: true,
          messageBody: true,
          offerText: true,
          destinationType: true,
          destinationUrl: true,
          description: true,
          _count: { select: { executions: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.googleReview.count({ where: { businessId } }),
      this.prisma.widget.findFirst({
        where: { businessId, enabled: true },
        select: {
          id: true,
          mode: true,
          status: true,
          minStars: true,
          maxReviewsShown: true,
          primaryColor: true,
          position: true,
          enabled: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    if (!business) throw new NotFoundException('Business not found');

    const activeCampaigns = campaigns.filter(
      (c) => c.status === 'ACTIVE',
    ).length;
    const baseUrl = process.env.APP_PUBLIC_URL ?? 'https://app.flikker.com';

    return {
      business: {
        ...business,
        reviewLandingUrl: `${baseUrl}/l/${business.slug}`,
      },
      campaigns,
      reviewCount,
      activeCampaigns,
      widget,
    };
  }

  async renderMessage(
    businessId: string,
    campaignId: string,
    input: { customerName?: string; clinicName?: string; offerText?: string },
  ) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      select: {
        id: true,
        name: true,
        messageBody: true,
        offerText: true,
        templateKind: true,
      },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true },
    });

    const customerName = input.customerName ?? 'Nombre de prueba';
    const clinicName = input.clinicName ?? business?.name ?? 'Tu negocio';
    const offerText = input.offerText ?? campaign.offerText ?? '';

    const raw = campaign.messageBody ?? '';
    const rendered = raw
      .replaceAll('{nombre}', customerName)
      .replaceAll('{clinica}', clinicName)
      .replaceAll('{oferta}', offerText)
      .replace(/\s+/g, ' ')
      .trim();

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      templateKind: campaign.templateKind,
      raw,
      rendered,
      variables: { customerName, clinicName, offerText },
    };
  }

  async sendTest(
    businessId: string,
    campaignId: string,
    input: {
      phone: string;
      customerName?: string;
      clinicName?: string;
      offerText?: string;
    },
  ) {
    const renderResult = await this.renderMessage(
      businessId,
      campaignId,
      input,
    );

    const normalizedPhone = input.phone.replace(/\D/g, '');

    const result = await this.whatsAppBspService.sendText({
      phone: normalizedPhone,
      text: renderResult.rendered,
    });

    return {
      success: true,
      isTest: true,
      whatsappMessageId: result.whatsappMessageId,
      phone: normalizedPhone,
      message: renderResult.rendered,
      campaignName: renderResult.campaignName,
      sentAt: new Date().toISOString(),
      note: 'Envío de prueba — no queda registrado en historial ni afecta métricas.',
    };
  }
}
