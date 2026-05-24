import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class ShopifyHmacService {
  verify(rawBody: Buffer, base64Signature: string, secret: string): boolean {
    try {
      const computed = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64');
      const sigBuf = Buffer.from(base64Signature);
      const computedBuf = Buffer.from(computed);
      if (sigBuf.length !== computedBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, computedBuf);
    } catch {
      return false;
    }
  }
}
