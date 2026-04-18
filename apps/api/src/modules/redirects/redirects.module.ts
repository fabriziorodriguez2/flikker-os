import { Module } from '@nestjs/common';
import { RedirectsController } from './redirects.controller';
import { RedirectsService } from './redirects.service';
import { RedirectsRepository } from './redirects.repository';

@Module({
  controllers: [RedirectsController],
  providers: [RedirectsService, RedirectsRepository],
})
export class RedirectsModule {}
