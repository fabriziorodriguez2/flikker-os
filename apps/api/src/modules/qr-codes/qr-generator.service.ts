import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import PDFDocument from 'pdfkit';

const API_BASE_URL =
  process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

const PNG_SIZE = 1024;
const PDF_QR_SIZE = 200;

@Injectable()
export class QrGeneratorService {
  /**
   * Returns the public redirect URL for a given QR slug.
   */
  static buildRedirectUrl(slug: string): string {
    return `${API_BASE_URL}/r/${slug}`;
  }

  /**
   * Generates a QR code as a PNG buffer (1024×1024 by default).
   */
  async generatePng(slug: string): Promise<Buffer> {
    const url = QrGeneratorService.buildRedirectUrl(slug);
    return QRCode.toBuffer(url, {
      type: 'png',
      width: PNG_SIZE,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
  }

  /**
   * Generates a QR code as an SVG string.
   */
  async generateSvg(slug: string): Promise<string> {
    const url = QrGeneratorService.buildRedirectUrl(slug);
    return QRCode.toString(url, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
    });
  }

  /**
   * Generates a single-page PDF with the QR code (as embedded PNG),
   * an optional label, and the redirect URL as text.
   * Page size: A6 (105×148mm) — handy for print.
   */
  async generatePdf(slug: string, label?: string): Promise<Buffer> {
    const url = QrGeneratorService.buildRedirectUrl(slug);
    const pngBuffer = await this.generatePng(slug);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: [297.64, 419.53], // A6 in points (105×148mm)
        margin: 24,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = 297.64;
      const contentCenter = pageWidth / 2;

      // QR code image (centered)
      const qrX = contentCenter - PDF_QR_SIZE / 2;
      doc.image(pngBuffer, qrX, 40, {
        width: PDF_QR_SIZE,
        height: PDF_QR_SIZE,
      });

      // Label (if provided)
      const textY = 40 + PDF_QR_SIZE + 16;
      if (label) {
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(label, 24, textY, {
            width: pageWidth - 48,
            align: 'center',
          });
      }

      // URL below label
      const urlY = label ? textY + 24 : textY;
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666666')
        .text(url, 24, urlY, {
          width: pageWidth - 48,
          align: 'center',
        });

      doc.end();
    });
  }
}
