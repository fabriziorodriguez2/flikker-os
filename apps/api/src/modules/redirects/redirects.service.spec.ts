import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RedirectsService } from './redirects.service';
import { RedirectsRepository } from './redirects.repository';

const QR_ID = 'qr-1';
const CAMPAIGN_ID = 'cmp-1';
const BUSINESS_ID = 'biz-1';
const BRANCH_ID = 'br-1';

const makeQr = (overrides: Record<string, unknown> = {}) => ({
  id: QR_ID,
  slug: 'aBcDeFgH',
  businessId: BUSINESS_ID,
  campaignId: CAMPAIGN_ID,
  branchId: BRANCH_ID,
  destinationUrl: null as string | null,
  isActive: true,
  scannedCount: 0,
  lastScannedAt: null,
  label: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  campaign: {
    id: CAMPAIGN_ID,
    channel: 'QR_COUNTER',
    destinationType: 'GOOGLE_REVIEW',
    destinationUrl: null as string | null,
    enableLanding: false,
  },
  business: {
    id: BUSINESS_ID,
    defaultReviewRedirectUrl: null as string | null,
    googleBusinessProfileUrl: 'https://g.page/test-biz',
  },
  ...overrides,
});

const makeLandingQr = (overrides: Record<string, unknown> = {}) => ({
  destinationUrl: null as string | null,
  campaign: {
    name: 'QR Mostrador',
    destinationUrl: null as string | null,
  },
  business: {
    name: 'Mi Negocio',
    logoUrl: 'https://cdn.example.com/logo.png',
    primaryColor: '#FF6600',
    defaultReviewRedirectUrl: null as string | null,
    googleBusinessProfileUrl: 'https://g.page/test-biz',
  },
  ...overrides,
});

const mockRepo = {
  findActiveQrBySlug: jest.fn(),
  findRecentScan: jest.fn(),
  recordScan: jest.fn().mockResolvedValue({ id: 'evt-1' }),
  findLandingData: jest.fn(),
};

describe('RedirectsService', () => {
  let service: RedirectsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedirectsService,
        { provide: RedirectsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<RedirectsService>(RedirectsService);
  });

  // ---------------------------------------------------------------------------
  // resolve — direct redirect (enableLanding: false)
  // ---------------------------------------------------------------------------
  describe('resolve (direct redirect)', () => {
    it('returns destination URL and records scan', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({ destinationUrl: 'https://qr-level.com' }),
      );
      mockRepo.findRecentScan.mockResolvedValue(null);

      const result = await service.resolve('aBcDeFgH', {
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });

      expect(result.redirectUrl).toBe('https://qr-level.com');
      expect(mockRepo.findActiveQrBySlug).toHaveBeenCalledWith('aBcDeFgH');
      expect(mockRepo.recordScan).toHaveBeenCalledWith(
        expect.objectContaining({
          qrCodeId: QR_ID,
          campaignId: CAMPAIGN_ID,
          businessId: BUSINESS_ID,
          branchId: BRANCH_ID,
          redirectedTo: 'https://qr-level.com',
          landingShown: false,
          isDuplicate: false,
        }),
      );
    });

    // -------------------------------------------------------------------------
    // 404 cases
    // -------------------------------------------------------------------------
    it('throws NotFoundException when slug not found', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(null);
      await expect(service.resolve('nope', { ip: '1.2.3.4' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when no destination resolves', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({
          destinationUrl: null,
          campaign: {
            id: CAMPAIGN_ID,
            channel: 'QR_COUNTER',
            destinationType: 'GOOGLE_REVIEW',
            destinationUrl: null,
            enableLanding: false,
          },
          business: {
            id: BUSINESS_ID,
            defaultReviewRedirectUrl: null,
            googleBusinessProfileUrl: null,
          },
        }),
      );

      await expect(
        service.resolve('aBcDeFgH', { ip: '1.2.3.4' }),
      ).rejects.toThrow(NotFoundException);
    });

    // -------------------------------------------------------------------------
    // Destination cascade
    // -------------------------------------------------------------------------
    it('falls back to campaign destinationUrl', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({
          destinationUrl: null,
          campaign: {
            id: CAMPAIGN_ID,
            channel: 'QR_COUNTER',
            destinationType: 'GOOGLE_REVIEW',
            destinationUrl: 'https://campaign-level.com',
            enableLanding: false,
          },
        }),
      );
      mockRepo.findRecentScan.mockResolvedValue(null);

      const result = await service.resolve('aBcDeFgH', { ip: '1.2.3.4' });
      expect(result.redirectUrl).toBe('https://campaign-level.com');
    });

    it('falls back to business defaultReviewRedirectUrl', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({
          destinationUrl: null,
          campaign: {
            id: CAMPAIGN_ID,
            channel: 'QR_COUNTER',
            destinationType: 'GOOGLE_REVIEW',
            destinationUrl: null,
            enableLanding: false,
          },
          business: {
            id: BUSINESS_ID,
            defaultReviewRedirectUrl: 'https://biz-default.com',
            googleBusinessProfileUrl: 'https://g.page/test-biz',
          },
        }),
      );
      mockRepo.findRecentScan.mockResolvedValue(null);

      const result = await service.resolve('aBcDeFgH', { ip: '1.2.3.4' });
      expect(result.redirectUrl).toBe('https://biz-default.com');
    });

    it('falls back to business googleBusinessProfileUrl', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(makeQr());
      mockRepo.findRecentScan.mockResolvedValue(null);

      const result = await service.resolve('aBcDeFgH', { ip: '1.2.3.4' });
      expect(result.redirectUrl).toBe('https://g.page/test-biz');
    });

    // -------------------------------------------------------------------------
    // Duplicate detection
    // -------------------------------------------------------------------------
    it('marks scan as duplicate when recent scan exists', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({ destinationUrl: 'https://dest.com' }),
      );
      mockRepo.findRecentScan.mockResolvedValue({ id: 'evt-old' });

      await service.resolve('aBcDeFgH', { ip: '1.2.3.4' });

      expect(mockRepo.recordScan).toHaveBeenCalledWith(
        expect.objectContaining({ isDuplicate: true }),
      );
    });

    it('skips duplicate check when no IP is provided', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({ destinationUrl: 'https://dest.com' }),
      );

      await service.resolve('aBcDeFgH', {});

      expect(mockRepo.findRecentScan).not.toHaveBeenCalled();
      expect(mockRepo.recordScan).toHaveBeenCalledWith(
        expect.objectContaining({ isDuplicate: false, ipHash: undefined }),
      );
    });

    // -------------------------------------------------------------------------
    // branchId handling
    // -------------------------------------------------------------------------
    it('passes undefined branchId when QR has no branch', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({ branchId: null, destinationUrl: 'https://dest.com' }),
      );
      mockRepo.findRecentScan.mockResolvedValue(null);

      await service.resolve('aBcDeFgH', { ip: '1.2.3.4' });

      expect(mockRepo.recordScan).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: undefined }),
      );
    });

    // -------------------------------------------------------------------------
    // Fire-and-forget error handling
    // -------------------------------------------------------------------------
    it('still returns URL even if recordScan fails', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({ destinationUrl: 'https://dest.com' }),
      );
      mockRepo.findRecentScan.mockResolvedValue(null);
      mockRepo.recordScan.mockRejectedValueOnce(new Error('DB down'));

      const result = await service.resolve('aBcDeFgH', { ip: '1.2.3.4' });
      expect(result.redirectUrl).toBe('https://dest.com');
    });
  });

  // ---------------------------------------------------------------------------
  // resolve — landing page redirect (enableLanding: true)
  // ---------------------------------------------------------------------------
  describe('resolve (landing redirect)', () => {
    it('returns landing page URL when enableLanding is true', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({
          destinationUrl: 'https://final-dest.com',
          campaign: {
            id: CAMPAIGN_ID,
            channel: 'QR_COUNTER',
            destinationType: 'GOOGLE_REVIEW',
            destinationUrl: null,
            enableLanding: true,
          },
        }),
      );
      mockRepo.findRecentScan.mockResolvedValue(null);

      const result = await service.resolve('aBcDeFgH', { ip: '1.2.3.4' });

      // Should redirect to the landing page, not the final destination
      expect(result.redirectUrl).toContain('/l/aBcDeFgH');
    });

    it('records ScanEvent with landingShown: true', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({
          destinationUrl: 'https://final-dest.com',
          campaign: {
            id: CAMPAIGN_ID,
            channel: 'QR_COUNTER',
            destinationType: 'GOOGLE_REVIEW',
            destinationUrl: null,
            enableLanding: true,
          },
        }),
      );
      mockRepo.findRecentScan.mockResolvedValue(null);

      await service.resolve('aBcDeFgH', { ip: '1.2.3.4' });

      expect(mockRepo.recordScan).toHaveBeenCalledWith(
        expect.objectContaining({
          landingShown: true,
          redirectedTo: 'https://final-dest.com', // always the final destination
        }),
      );
    });

    it('records ScanEvent with landingShown: false for direct redirects', async () => {
      mockRepo.findActiveQrBySlug.mockResolvedValue(
        makeQr({ destinationUrl: 'https://dest.com' }),
      );
      mockRepo.findRecentScan.mockResolvedValue(null);

      await service.resolve('aBcDeFgH', { ip: '1.2.3.4' });

      expect(mockRepo.recordScan).toHaveBeenCalledWith(
        expect.objectContaining({ landingShown: false }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getLandingData
  // ---------------------------------------------------------------------------
  describe('getLandingData', () => {
    it('returns landing data with business branding', async () => {
      mockRepo.findLandingData.mockResolvedValue(makeLandingQr());

      const data = await service.getLandingData('aBcDeFgH');

      expect(data).toEqual({
        businessName: 'Mi Negocio',
        logoUrl: 'https://cdn.example.com/logo.png',
        primaryColor: '#FF6600',
        destinationUrl: 'https://g.page/test-biz',
        campaignName: 'QR Mostrador',
      });
    });

    it('resolves destination via cascade (QR > campaign > business)', async () => {
      mockRepo.findLandingData.mockResolvedValue(
        makeLandingQr({ destinationUrl: 'https://qr-override.com' }),
      );

      const data = await service.getLandingData('aBcDeFgH');
      expect(data.destinationUrl).toBe('https://qr-override.com');
    });

    it('falls back to campaign destinationUrl', async () => {
      mockRepo.findLandingData.mockResolvedValue(
        makeLandingQr({
          campaign: {
            name: 'QR Mostrador',
            destinationUrl: 'https://campaign-dest.com',
          },
        }),
      );

      const data = await service.getLandingData('aBcDeFgH');
      expect(data.destinationUrl).toBe('https://campaign-dest.com');
    });

    it('throws NotFoundException when slug not found', async () => {
      mockRepo.findLandingData.mockResolvedValue(null);
      await expect(service.getLandingData('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when no destination resolves', async () => {
      mockRepo.findLandingData.mockResolvedValue(
        makeLandingQr({
          business: {
            name: 'No URLs',
            logoUrl: null,
            primaryColor: null,
            defaultReviewRedirectUrl: null,
            googleBusinessProfileUrl: null,
          },
        }),
      );

      await expect(service.getLandingData('aBcDeFgH')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // hashIp
  // ---------------------------------------------------------------------------
  describe('hashIp', () => {
    it('returns a 16-char hex string', () => {
      const hash = RedirectsService.hashIp('192.168.1.1');
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('produces same hash for same IP', () => {
      expect(RedirectsService.hashIp('10.0.0.1')).toBe(
        RedirectsService.hashIp('10.0.0.1'),
      );
    });

    it('produces different hashes for different IPs', () => {
      expect(RedirectsService.hashIp('10.0.0.1')).not.toBe(
        RedirectsService.hashIp('10.0.0.2'),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // parseDeviceType
  // ---------------------------------------------------------------------------
  describe('parseDeviceType', () => {
    it('detects mobile devices', () => {
      expect(
        RedirectsService.parseDeviceType(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        ),
      ).toBe('mobile');
    });

    it('detects Android mobile', () => {
      expect(
        RedirectsService.parseDeviceType(
          'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 Mobile',
        ),
      ).toBe('mobile');
    });

    it('detects tablets', () => {
      expect(
        RedirectsService.parseDeviceType(
          'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)',
        ),
      ).toBe('tablet');
    });

    it('defaults to desktop', () => {
      expect(
        RedirectsService.parseDeviceType(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        ),
      ).toBe('desktop');
    });
  });
});
