import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { EmailService } from '../../jobs/email.service';
import { renderWeeklySummaryEmail } from '../../jobs/workers/owner-notifications.worker';

@Injectable()
export class TestLabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppBspService: WhatsAppBspService,
    private readonly emailService: EmailService,
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

  async sendWeeklySummaryPreview(businessId: string, email: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [current, previous] = await Promise.all([
      this.calcWeeklyKpis(businessId, weekStart, now),
      this.calcWeeklyKpis(businessId, prevWeekStart, weekStart),
    ]);

    const panelUrl = `${(process.env.APP_PUBLIC_URL ?? 'https://flikker.site').replace(/\/$/, '')}/dashboard`;

    await this.emailService.send({
      to: [email],
      subject: `Resumen semanal de ${business.name} (prueba)`,
      html: renderWeeklySummaryEmail({ businessName: business.name, current, previous, panelUrl }),
    });

    return { ok: true, sentTo: email };
  }

  private async calcWeeklyKpis(businessId: string, from: Date, to: Date) {
    const [reviewsGenerated, ratingSample, reactivated] = await Promise.all([
      this.prisma.googleReview.count({
        where: { businessId, postedAt: { gte: from, lt: to } },
      }),
      this.prisma.googleReview.findMany({
        where: { businessId, postedAt: { gte: from, lt: to } },
        select: { stars: true },
      }),
      this.prisma.campaignExecution.count({
        where: { businessId, status: 'responded', respondedAt: { gte: from, lt: to } },
      }),
    ]);

    const averageRating =
      ratingSample.length > 0
        ? Number(
            (ratingSample.reduce((sum, r) => sum + r.stars, 0) / ratingSample.length).toFixed(1),
          )
        : 0;

    return { reviewsGenerated, averageRating, reactivatedCustomers: reactivated };
  }
}
