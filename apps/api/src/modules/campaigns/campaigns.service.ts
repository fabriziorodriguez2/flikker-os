import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { CampaignsRepository } from './campaigns.repository';
import { BranchesRepository } from '../branches/branches.repository';
import { PlansService } from '../plans/plans.service';
import { AuditService } from '../../common/services/audit.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { UpdateRepeatCampaignDto } from './dto/update-repeat-campaign.dto';
import { UpdateCampaignStatusDto } from './dto/update-campaign-status.dto';
import { SendManualCampaignDto } from './dto/send-manual-campaign.dto';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { WhatsAppProviderError } from '../../jobs/whatsapp-provider';

/**
 * WaSenderAPI rechaza más de 1 mensaje cada 5 segundos por cuenta (auditoría
 * de caso real — 2 de 3 destinatarios de una promoción fallaron porque
 * `sendManual` los mandaba todos en paralelo con `Promise.all`). Este es el
 * piso real del proveedor, no un valor arbitrario.
 */
const MANUAL_CAMPAIGN_MIN_SEND_INTERVAL_MS = 5000;
/** 1 intento inicial + 2 reintentos — solo para rate limit, nunca para errores definitivos. */
const MANUAL_CAMPAIGN_MAX_SEND_ATTEMPTS = 3;
const RATE_LIMIT_MESSAGE_PATTERN =
  /rate.?limit|account protection|too many (requests|messages)|every \d+ seconds/i;

/**
 * Distingue "el proveedor rechazó esto por volumen, reintentar tiene sentido"
 * de un error definitivo (número inválido, sesión caída, auth, payload) que
 * reintentar nunca arregla. `statusCode === 429` es la señal HTTP estándar de
 * rate limit; el patrón de mensaje cubre proveedores (como WaSenderAPI) que
 * devuelven este error con otro status HTTP.
 */
export function isRetryableRateLimitError(error: unknown): boolean {
  if (error instanceof WhatsAppProviderError && error.statusCode === 429) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return RATE_LIMIT_MESSAGE_PATTERN.test(message);
}

/** Allowed status transitions: from → [to, to, ...] */
const STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.ACTIVE, CampaignStatus.ARCHIVED],
  [CampaignStatus.ACTIVE]: [
    CampaignStatus.PAUSED,
    CampaignStatus.COMPLETED,
    CampaignStatus.ARCHIVED,
  ],
  [CampaignStatus.PAUSED]: [CampaignStatus.ACTIVE, CampaignStatus.ARCHIVED],
  [CampaignStatus.COMPLETED]: [CampaignStatus.ACTIVE, CampaignStatus.ARCHIVED],
  [CampaignStatus.ARCHIVED]: [CampaignStatus.DRAFT],
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly campaignsRepository: CampaignsRepository,
    private readonly branchesRepository: BranchesRepository,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
    private readonly whatsApp: WhatsAppBspService,
  ) {}

  async listForBusiness(
    businessId: string,
    status: CampaignStatus | undefined,
    userId: string,
  ) {
    await this.campaignsRepository.ensureRepeatTemplates(businessId, userId);
    return this.campaignsRepository.findManyByBusiness(businessId, status);
  }

  async findOneScoped(businessId: string, campaignId: string) {
    const campaign = await this.campaignsRepository.findOne(
      businessId,
      campaignId,
    );
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  /**
   * Creates a campaign atomically: limit check + slug uniqueness + insert
   * all happen inside a single transaction to prevent TOCTOU races.
   */
  async create(
    businessId: string,
    dto: CreateCampaignDto,
    createdByUserId: string,
  ) {
    // Validate branchId belongs to this business
    if (dto.branchId) {
      await this.assertBranchBelongsToBusiness(businessId, dto.branchId);
    }

    // Validate date range
    if (dto.startsAt && dto.endsAt) {
      if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
        throw new BadRequestException('endsAt must be after startsAt');
      }
    }

    // Validate destinationUrl required for certain types
    if (
      (dto.destinationType === 'GOOGLE_REVIEW' ||
        dto.destinationType === 'CUSTOM_URL') &&
      !dto.destinationUrl
    ) {
      throw new BadRequestException(
        `destinationUrl is required when destinationType is ${dto.destinationType}`,
      );
    }

    const limits = await this.plansService.getLimits(businessId);

    const result = await this.campaignsRepository.createAtomic(
      businessId,
      { ...dto, createdByUserId },
      limits.maxCampaigns,
    );

    if (result === 'LIMIT_REACHED') {
      throw new ForbiddenException(
        `Campaign limit reached (${limits.maxCampaigns}). Upgrade your plan.`,
      );
    }
    if (result === 'SLUG_TAKEN') {
      throw new ConflictException(
        'Campaign slug already taken in this business',
      );
    }
    return result;
  }

  async update(
    businessId: string,
    campaignId: string,
    dto: UpdateCampaignDto,
    actorUserId?: string,
  ) {
    const campaign = await this.findOneScoped(businessId, campaignId);

    if (campaign.status === CampaignStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot edit an archived campaign. Unarchive it first.',
      );
    }

    // Validate branchId belongs to this business
    if (dto.branchId) {
      await this.assertBranchBelongsToBusiness(businessId, dto.branchId);
    }

    // Validate date range (consider existing values)
    const effectiveStartsAt = dto.startsAt ?? campaign.startsAt?.toISOString();
    const effectiveEndsAt = dto.endsAt ?? campaign.endsAt?.toISOString();
    if (effectiveStartsAt && effectiveEndsAt) {
      if (new Date(effectiveEndsAt) <= new Date(effectiveStartsAt)) {
        throw new BadRequestException('endsAt must be after startsAt');
      }
    }

    const updated = await this.campaignsRepository.update(
      businessId,
      campaignId,
      dto,
    );

    if (actorUserId) {
      void this.auditService.log({
        action: 'CAMPAIGN_UPDATED',
        entityType: 'Campaign',
        entityId: campaignId,
        userId: actorUserId,
        businessId,
        metadata: {
          before: {
            name: campaign.name,
            description: campaign.description,
            destinationType: campaign.destinationType,
            destinationUrl: campaign.destinationUrl,
            enableLanding: campaign.enableLanding,
            branchId: campaign.branchId,
            startsAt: campaign.startsAt,
            endsAt: campaign.endsAt,
          },
          after: {
            name: updated.name,
            description: updated.description,
            destinationType: updated.destinationType,
            destinationUrl: updated.destinationUrl,
            enableLanding: updated.enableLanding,
            branchId: updated.branchId,
            startsAt: updated.startsAt,
            endsAt: updated.endsAt,
          },
        },
      });
    }

    return updated;
  }

  async updateRepeatSettings(
    businessId: string,
    campaignId: string,
    dto: UpdateRepeatCampaignDto,
    actorUserId?: string,
  ) {
    const campaign = await this.findOneScoped(businessId, campaignId);
    if (!campaign.templateKind) {
      throw new BadRequestException('Campaign is not a Repeat template');
    }

    const updated = await this.campaignsRepository.updateRepeatSettings(
      businessId,
      campaignId,
      {
        ...(dto.messageBody !== undefined
          ? { messageBody: dto.messageBody.trim() }
          : {}),
        ...(dto.triggerOffsetDays !== undefined
          ? { triggerOffsetDays: dto.triggerOffsetDays }
          : {}),
        ...(dto.reviewRequestDelayHours !== undefined
          ? { reviewRequestDelayHours: dto.reviewRequestDelayHours }
          : {}),
        ...(dto.offerText !== undefined
          ? { offerText: dto.offerText.trim() || null }
          : {}),
      },
    );

    if (!updated) throw new NotFoundException('Campaign not found');

    if (actorUserId) {
      void this.auditService.log({
        action: 'TEMPLATE_UPDATED',
        entityType: 'Campaign',
        entityId: campaignId,
        userId: actorUserId,
        businessId,
        metadata: {
          before: {
            messageBody: campaign.messageBody,
            triggerOffsetDays: campaign.triggerOffsetDays,
            offerText: campaign.offerText,
          },
          after: {
            messageBody: updated.messageBody,
            triggerOffsetDays: updated.triggerOffsetDays,
            offerText: updated.offerText,
          },
        },
      });
    }

    return updated;
  }

  getRecentActivity(businessId: string) {
    return this.campaignsRepository.findRecentActivity(businessId, 20);
  }

  async updateStatus(
    businessId: string,
    campaignId: string,
    dto: UpdateCampaignStatusDto,
  ) {
    const campaign = await this.findOneScoped(businessId, campaignId);

    const allowed = STATUS_TRANSITIONS[campaign.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${campaign.status} to ${dto.status}`,
      );
    }

    return this.campaignsRepository.updateStatus(
      businessId,
      campaignId,
      dto.status,
    );
  }

  async sendManual(
    businessId: string,
    userId: string,
    dto: SendManualCampaignDto,
  ) {
    if (!dto.recipients || dto.recipients.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }

    const businessName =
      await this.campaignsRepository.getBusinessName(businessId);
    const campaign = await this.campaignsRepository.createManualCampaign(
      businessId,
      userId,
      { messageBody: dto.messageBody, recipients: dto.recipients },
    );

    const contacts = await this.campaignsRepository.findManualCampaignContacts(
      campaign.id,
    );

    let sent = 0;
    let failed = 0;
    // WaSenderAPI acepta como máximo 1 mensaje cada 5 segundos por cuenta —
    // el envío es SECUENCIAL, nunca en paralelo (bug real corregido: antes
    // `Promise.all` mandaba hasta 10 a la vez). `lastAttemptStartedAt` mide
    // el piso real desde el INICIO del intento anterior, sea de este
    // contacto o del anterior — así un reintento con backoff también cuenta
    // como el "último intento" para el siguiente contacto.
    let lastAttemptStartedAt: number | null = null;

    for (const contact of contacts) {
      // Idempotencia: un contacto ya `sent` nunca se vuelve a enviar, sin
      // importar por qué este loop lo esté viendo de nuevo.
      if (contact.status === 'sent') continue;

      const text = dto.messageBody
        .replace(/{nombre}/g, contact.name)
        .replace(/{negocio}/g, businessName)
        .replace(/{link}/g, contact.link ?? '');

      let lastError: unknown;
      let delivered = false;

      for (
        let attempt = 1;
        attempt <= MANUAL_CAMPAIGN_MAX_SEND_ATTEMPTS;
        attempt++
      ) {
        if (lastAttemptStartedAt !== null) {
          const elapsed = Date.now() - lastAttemptStartedAt;
          const waitMs = MANUAL_CAMPAIGN_MIN_SEND_INTERVAL_MS - elapsed;
          if (waitMs > 0) await this.sleep(waitMs);
        }
        lastAttemptStartedAt = Date.now();

        try {
          await this.whatsApp.sendText({ phone: contact.phoneE164, text });
          delivered = true;
          break;
        } catch (err) {
          lastError = err;
          const isLastAttempt = attempt >= MANUAL_CAMPAIGN_MAX_SEND_ATTEMPTS;
          if (!isRetryableRateLimitError(err) || isLastAttempt) break;
          // Backoff creciente (5s, 10s, ...) — también deja pasado el piso
          // mínimo entre intentos, así que no hace falta esperar de nuevo.
          await this.sleep(MANUAL_CAMPAIGN_MIN_SEND_INTERVAL_MS * attempt);
          lastAttemptStartedAt = Date.now();
        }
      }

      if (delivered) {
        await this.campaignsRepository.updateManualCampaignContact(
          contact.id,
          true,
        );
        sent++;
      } else {
        const reason =
          lastError instanceof Error ? lastError.message : 'Error al enviar';
        await this.campaignsRepository.updateManualCampaignContact(
          contact.id,
          false,
          reason,
        );
        failed++;
      }
    }

    await this.campaignsRepository.updateManualCampaignStats(
      campaign.id,
      sent,
      failed,
    );
    return { campaignId: campaign.id, sent, failed };
  }

  private async assertBranchBelongsToBusiness(
    businessId: string,
    branchId: string,
  ) {
    const branch = await this.branchesRepository.findOne(businessId, branchId);
    if (!branch) {
      throw new BadRequestException('Branch does not belong to this business');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
