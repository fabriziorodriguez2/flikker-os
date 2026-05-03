import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformRepository } from './platform.repository';
import { AuditService } from '../../common/services/audit.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformRepository, AuditService],
})
export class PlatformModule {}
