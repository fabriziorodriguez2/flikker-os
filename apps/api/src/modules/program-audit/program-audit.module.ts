import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProgramAuditService } from './program-audit.service';

/**
 * Módulo standalone (solo depende de Prisma) para que tanto `BenefitsModule`
 * como `RewardGoalsModule` puedan importarlo sin crear una dependencia
 * circular entre ellos.
 */
@Module({
  imports: [PrismaModule],
  providers: [ProgramAuditService],
  exports: [ProgramAuditService],
})
export class ProgramAuditModule {}
