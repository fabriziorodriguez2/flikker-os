import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { BranchesRepository } from './branches.repository';
import { PlansModule } from '../plans/plans.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [PlansModule],
  controllers: [BranchesController],
  providers: [BranchesService, BranchesRepository, RolesGuard],
  exports: [BranchesService, BranchesRepository],
})
export class BranchesModule {}
