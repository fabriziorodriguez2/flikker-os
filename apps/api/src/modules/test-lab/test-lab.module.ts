import { Module } from '@nestjs/common';
import { TestLabController } from './test-lab.controller';
import { TestLabService } from './test-lab.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { JobsModule } from '../../jobs/jobs.module';

@Module({
  imports: [PrismaModule, JobsModule],
  controllers: [TestLabController],
  providers: [TestLabService],
})
export class TestLabModule {}
