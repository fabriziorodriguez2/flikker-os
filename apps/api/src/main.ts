import 'dotenv/config';
import { json, urlencoded } from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

const processLogger = new Logger('Process');

process.on('unhandledRejection', (reason: unknown) => {
  processLogger.error(
    'Unhandled Promise Rejection',
    reason instanceof Error  reason.stack : String(reason),
  );
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  app.use(json({ limit: '3mb' }));
  app.use(urlencoded({ extended: true, limit: '3mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT  3000;
  const env = process.env.NODE_ENV  'development';

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Application running on port ${port} [${env}]`);
}

void bootstrap();
