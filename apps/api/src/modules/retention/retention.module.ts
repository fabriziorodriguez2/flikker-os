import { Module } from '@nestjs/common';
import { RetentionController } from './retention.controller';
import { RetentionRepository } from './retention.repository';
import { RetentionService } from './retention.service';

@Module({
  controllers: [RetentionController],
  providers: [RetentionService, RetentionRepository],
  exports: [RetentionService, RetentionRepository],
})
export class RetentionModule {}
