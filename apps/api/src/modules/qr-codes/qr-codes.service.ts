import { randomBytes } from 'crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { QrCodesRepository } from './qr-codes.repository';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import { BranchesRepository } from '../branches/branches.repository';
import { CreateQrCodeDto } from './dto/create-qr-code.dto';
import { UpdateQrCodeDto } from './dto/update-qr-code.dto';

const MAX_SLUG_RETRIES = 3;

@Injectable()
export class QrCodesService {
  constructor(
    private readonly qrCodesRepository: QrCodesRepository,
    private readonly campaignsRepository: CampaignsRepository,
    private readonly branchesRepository: BranchesRepository,
  ) {}

  async listForCampaign(businessId: string, campaignId: string) {
    // Verify campaign belongs to this business
    const campaign = await this.campaignsRepository.findOne(
      businessId,
      campaignId,
    );
    if (!campaign) throw new NotFoundException('Campaign not found');

    return this.qrCodesRepository.findManyByCampaign(businessId, campaignId);
  }

  async findOneScoped(businessId: string, qrCodeId: string) {
    const qrCode = await this.qrCodesRepository.findOne(businessId, qrCodeId);
    if (!qrCode) throw new NotFoundException('QR code not found');
    return qrCode;
  }

  async create(businessId: string, dto: CreateQrCodeDto) {
    // Validate campaign belongs to this business
    const campaign = await this.campaignsRepository.findOne(
      businessId,
      dto.campaignId,
    );
    if (!campaign) {
      throw new BadRequestException('Campaign not found in this business');
    }

    // Cannot add QR codes to archived campaigns
    if (campaign.status === CampaignStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot add QR codes to an archived campaign',
      );
    }

    // Validate branchId if provided
    if (dto.branchId) {
      const branch = await this.branchesRepository.findOne(
        businessId,
        dto.branchId,
      );
      if (!branch) {
        throw new BadRequestException(
          'Branch does not belong to this business',
        );
      }
    }

    // Resolve branchId: explicit > inherited from campaign > null
    const effectiveBranchId = dto.branchId  campaign.branchId  undefined;

    // Generate unique slug with retry
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
      const slug = QrCodesService.generateSlug();
      const result = await this.qrCodesRepository.createAtomic(businessId, {
        campaignId: dto.campaignId,
        slug,
        branchId: effectiveBranchId,
        label: dto.label,
        destinationUrl: dto.destinationUrl,
      });

      if (result !== 'SLUG_TAKEN') return result;
    }

    // All retries exhausted (virtually impossible)
    throw new Error('Failed to generate unique QR slug after retries');
  }

  async update(businessId: string, qrCodeId: string, dto: UpdateQrCodeDto) {
    await this.findOneScoped(businessId, qrCodeId);
    return this.qrCodesRepository.update(businessId, qrCodeId, dto);
  }

  /**
   * Generates an 8-character URL-safe slug using native crypto.
   * ~48 bits of entropy → ~2.8×10¹⁴ possible values.
   */
  static generateSlug(): string {
    return randomBytes(6).toString('base64url');
  }
}
