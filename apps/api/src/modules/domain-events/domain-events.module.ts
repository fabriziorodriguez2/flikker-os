import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DomainEventClaimService } from './domain-event-claim.service';

@Module({
  imports: [PrismaModule],
  providers: [DomainEventClaimService],
  exports: [DomainEventClaimService],
})
export class DomainEventsModule {}
