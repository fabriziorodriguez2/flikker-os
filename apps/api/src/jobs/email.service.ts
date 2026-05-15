import { Injectable, Logger } from '@nestjs/common';

interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async send(input: SendEmailInput) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !from) {
      this.logger.warn(
        'Email not sent because RESEND_API_KEY or RESEND_FROM_EMAIL is missing.',
      );
      return null;
    }

    const baseUrl = process.env.RESEND_BASE_URL  'https://api.resend.com';
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to)  input.to : [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(
        `Resend send failed (${response.status}): ${JSON.stringify(payload)}`,
      );
    }

    return payload;
  }
}
