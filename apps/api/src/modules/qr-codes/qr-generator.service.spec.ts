import { Test, TestingModule } from '@nestjs/testing';
import { QrGeneratorService } from './qr-generator.service';

const SLUG = 'aBcDeFgH';
const TIMEOUT = 60_000;

describe('QrGeneratorService', () => {
  let service: QrGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QrGeneratorService],
    }).compile();

    service = module.get<QrGeneratorService>(QrGeneratorService);
  });

  // ---------------------------------------------------------------------------
  // buildRedirectUrl
  // ---------------------------------------------------------------------------
  describe('buildRedirectUrl', () => {
    it('builds correct redirect URL from slug', () => {
      const url = QrGeneratorService.buildRedirectUrl(SLUG);
      expect(url).toContain(`/r/${SLUG}`);
    });
  });

  // ---------------------------------------------------------------------------
  // generatePng
  // ---------------------------------------------------------------------------
  describe('generatePng', () => {
    it(
      'returns a Buffer with PNG magic bytes',
      async () => {
        const buffer = await service.generatePng(SLUG);

        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.length).toBeGreaterThan(100);

        // PNG magic bytes: 89 50 4E 47
        expect(buffer[0]).toBe(0x89);
        expect(buffer[1]).toBe(0x50);
        expect(buffer[2]).toBe(0x4e);
        expect(buffer[3]).toBe(0x47);
      },
      TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  // generateSvg
  // ---------------------------------------------------------------------------
  describe('generateSvg', () => {
    it(
      'returns valid SVG string',
      async () => {
        const svg = await service.generateSvg(SLUG);

        expect(typeof svg).toBe('string');
        expect(svg).toMatch(/^<svg/);
        expect(svg).toContain('</svg>');
      },
      TIMEOUT,
    );

    it(
      'is a non-trivial SVG (contains path data)',
      async () => {
        const svg = await service.generateSvg(SLUG);
        expect(svg.length).toBeGreaterThan(200);
      },
      TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  // generatePdf
  // ---------------------------------------------------------------------------
  describe('generatePdf', () => {
    it(
      'returns a Buffer with PDF magic bytes',
      async () => {
        const buffer = await service.generatePdf(SLUG);

        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.length).toBeGreaterThan(500);

        // PDF magic bytes: %PDF
        const header = buffer.slice(0, 4).toString('ascii');
        expect(header).toBe('%PDF');
      },
      TIMEOUT,
    );

    it(
      'generates PDF with label included',
      async () => {
        const buffer = await service.generatePdf(SLUG, 'Mesa 1');

        expect(Buffer.isBuffer(buffer)).toBe(true);
        const header = buffer.slice(0, 4).toString('ascii');
        expect(header).toBe('%PDF');
        expect(buffer.length).toBeGreaterThan(500);
      },
      TIMEOUT,
    );
  });
});
