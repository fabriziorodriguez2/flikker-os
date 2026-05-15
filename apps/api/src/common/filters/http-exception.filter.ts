import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
         exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
         this.resolveMessage(exception)
        : 'Internal server error';

    const requestId = request.headers['x-request-id'] as string | undefined;

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}` +
          (requestId  ` rid=${requestId}` : ''),
        exception instanceof Error  exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId && { requestId }),
    });
  }

  private resolveMessage(exception: HttpException): string | string[] {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && response !== null) {
      const r = response as Record<string, unknown>;
      if (Array.isArray(r['message'])) return r['message'] as string[];
      if (typeof r['message'] === 'string') return r['message'];
    }
    return exception.message;
  }
}
