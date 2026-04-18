import {
  Controller,
  Get,
  Header,
  Param,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { RedirectsService } from './redirects.service';
import { SlugPipe } from '../../common/pipes/slug.pipe';

@Controller()
export class RedirectsController {
  constructor(private readonly redirectsService: RedirectsService) {}

  /**
   * Public redirect endpoint — no auth required.
   * Resolves the QR slug, records a scan event, and issues a 302 redirect.
   * When the campaign has enableLanding, redirects to the landing page instead.
   *
   * Rate-limited to 60 requests per minute per IP.
   * Slug is validated to match the expected base64url format (8 chars).
   */
  @Get('r/:slug')
  @Redirect()
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async redirect(@Param('slug', SlugPipe) slug: string, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip;

    const requestId = req.headers['x-request-id'] as string | undefined;

    const { redirectUrl } = await this.redirectsService.resolve(slug, {
      ip,
      userAgent: req.headers['user-agent'],
      referer: req.headers['referer'],
      requestId,
    });

    return { url: redirectUrl, statusCode: 302 };
  }

  /**
   * Public endpoint — returns the data needed to render the landing page.
   * Called by the frontend /l/:slug page.
   *
   * Rate-limited to 60 requests per minute per IP.
   */
  @Get('redirects/:slug/landing')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  getLandingData(@Param('slug', SlugPipe) slug: string) {
    return this.redirectsService.getLandingData(slug);
  }
}
