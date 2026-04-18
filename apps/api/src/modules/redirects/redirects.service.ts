import { createHash } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedirectsRepository } from './redirects.repository';

/** Window (in minutes) used to detect duplicate scans from the same IP. */
const DUPLICATE_WINDOW_MINUTES = 5;

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3001';

export interface ResolveResult {
  /** The URL the controller should redirect to (landing page or final destination). */
  redirectUrl: string;
}

export interface LandingData {
  businessName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  destinationUrl: string;
  campaignName: string;
}

@Injectable()
export class RedirectsService {
  private readonly logger = new Logger(RedirectsService.name);

  constructor(private readonly redirectsRepository: RedirectsRepository) {}

  /**
   * Resolves a QR slug to a redirect URL and records the scan event.
   * When the campaign has `enableLanding`, returns the landing page URL;
   * otherwise returns the final destination directly.
   */
  async resolve(
    slug: string,
    meta: {
      ip?: string;
      userAgent?: string;
      referer?: string;
      requestId?: string;
    },
  ): Promise<ResolveResult> {
    const start = Date.now();

    // 1. Lookup QR (active + campaign ACTIVE)
    const qr = await this.redirectsRepository.findActiveQrBySlug(slug);
    if (!qr) {
      this.logger.warn(`Slug not found or inactive: ${slug}`);
      throw new NotFoundException();
    }

    // 2. Resolve destination via cascade
    const destinationUrl = this.resolveDestination(qr);
    if (!destinationUrl) {
      this.logger.warn(`No destination resolved for slug=${slug} qr=${qr.id}`);
      throw new NotFoundException();
    }

    // 3. Determine whether to show landing or redirect directly
    const landingShown = qr.campaign.enableLanding;
    const redirectUrl = landingShown
      ? `${WEB_BASE_URL}/l/${slug}`
      : destinationUrl;

    // 4. Parse metadata
    const ipHash = meta.ip ? RedirectsService.hashIp(meta.ip) : undefined;
    const deviceType = meta.userAgent
      ? RedirectsService.parseDeviceType(meta.userAgent)
      : undefined;

    // 5. Detect duplicate
    let isDuplicate = false;
    if (ipHash) {
      const since = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000);
      const recent = await this.redirectsRepository.findRecentScan(
        qr.id,
        ipHash,
        since,
      );
      isDuplicate = !!recent;
    }

    // 6. Record scan event (fire-and-forget — don't block the redirect)
    this.recordScanAsync({
      qrCodeId: qr.id,
      campaignId: qr.campaign.id,
      businessId: qr.business.id,
      branchId: qr.branchId ?? undefined,
      ipHash,
      userAgent: meta.userAgent?.slice(0, 512),
      referer: meta.referer?.slice(0, 2048),
      deviceType,
      redirectedTo: destinationUrl,
      landingShown,
      isDuplicate,
      scannedAt: new Date(),
    });

    const ms = Date.now() - start;
    this.logger.log(
      `resolve slug=${slug} qr=${qr.id} device=${deviceType ?? 'unknown'} dup=${isDuplicate} landing=${landingShown} ${ms}ms` +
        (meta.requestId ? ` rid=${meta.requestId}` : ''),
    );

    return { redirectUrl };
  }

  /**
   * Returns the data needed to render the public landing page.
   */
  async getLandingData(slug: string): Promise<LandingData> {
    const qr = await this.redirectsRepository.findLandingData(slug);
    if (!qr) throw new NotFoundException();

    const destinationUrl =
      qr.destinationUrl ??
      qr.campaign.destinationUrl ??
      qr.business.defaultReviewRedirectUrl ??
      qr.business.googleBusinessProfileUrl;

    if (!destinationUrl) throw new NotFoundException();

    return {
      businessName: qr.business.name,
      logoUrl: qr.business.logoUrl,
      primaryColor: qr.business.primaryColor,
      destinationUrl,
      campaignName: qr.campaign.name,
    };
  }

  /**
   * Destination cascade: QR > Campaign > Business.defaultReviewRedirectUrl > Business.googleBusinessProfileUrl
   */
  private resolveDestination(qr: {
    destinationUrl: string | null;
    campaign: { destinationUrl: string | null };
    business: {
      defaultReviewRedirectUrl: string | null;
      googleBusinessProfileUrl: string | null;
    };
  }): string | undefined {
    return (
      qr.destinationUrl ??
      qr.campaign.destinationUrl ??
      qr.business.defaultReviewRedirectUrl ??
      qr.business.googleBusinessProfileUrl ??
      undefined
    );
  }

  /**
   * Fire-and-forget scan recording. Errors are logged but never propagated.
   */
  private recordScanAsync(data: {
    qrCodeId: string;
    campaignId: string;
    businessId: string;
    branchId?: string;
    ipHash?: string;
    userAgent?: string;
    referer?: string;
    deviceType?: string;
    redirectedTo: string;
    landingShown: boolean;
    isDuplicate: boolean;
    scannedAt: Date;
  }) {
    this.redirectsRepository.recordScan(data).catch((err: Error) => {
      this.logger.error(
        `Failed to record scan for QR ${data.qrCodeId}: ${err.message}`,
        err.stack,
      );
    });
  }

  /**
   * Hashes an IP address using SHA-256, truncated to 16 hex chars.
   * Never stores the raw IP.
   */
  static hashIp(ip: string): string {
    return createHash('sha256').update(ip).digest('hex').slice(0, 16);
  }

  /**
   * Simple user-agent heuristic — no external dependencies.
   */
  static parseDeviceType(ua: string): string {
    const lower = ua.toLowerCase();
    if (/tablet|ipad|playbook|silk/.test(lower)) return 'tablet';
    if (
      /mobile|iphone|ipod|android.*mobile|windows phone|blackberry/.test(lower)
    )
      return 'mobile';
    return 'desktop';
  }
}
