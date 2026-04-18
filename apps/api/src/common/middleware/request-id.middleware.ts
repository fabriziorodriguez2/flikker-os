import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

const HEADER = 'x-request-id';

/**
 * Assigns a unique request ID to every incoming request.
 * If the client already provides an x-request-id header, it is reused;
 * otherwise a new UUID v4 is generated.
 *
 * The ID is attached to both the request and response headers so it can
 * be used in logs and returned to the caller for correlation.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const id = (req.headers[HEADER] as string) || randomUUID();
    req.headers[HEADER] = id;
    res.setHeader(HEADER, id);
    next();
  }
}
