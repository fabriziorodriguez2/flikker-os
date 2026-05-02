import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { BranchesRepository } from './branches.repository';
import { PlansService } from '../plans/plans.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly branchesRepository: BranchesRepository,
    private readonly plansService: PlansService,
  ) {}

  listForBusiness(businessId: string, includeInactive = false) {
    return this.branchesRepository.findManyByBusiness(
      businessId,
      includeInactive,
    );
  }

  async findOneScoped(businessId: string, branchId: string) {
    const branch = await this.branchesRepository.findOne(businessId, branchId);
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  /**
   * Creates a branch atomically: limit check + slug uniqueness + insert
   * all happen inside a single transaction to prevent TOCTOU races.
   */
  async create(businessId: string, dto: CreateBranchDto) {
    const limits = await this.plansService.getLimits(businessId);

    const result = await this.branchesRepository.createAtomic(
      businessId,
      dto,
      limits.maxBranches,
    );

    if (result === 'LIMIT_REACHED') {
      throw new ForbiddenException(
        `Branch limit reached (${limits.maxBranches}). Upgrade your plan.`,
      );
    }
    if (result === 'SLUG_TAKEN') {
      throw new ConflictException('Branch slug already taken in this business');
    }
    return result;
  }

  async update(businessId: string, branchId: string, dto: UpdateBranchDto) {
    await this.findOneScoped(businessId, branchId);
    const result = await this.branchesRepository.update(
      businessId,
      branchId,
      dto,
    );
    if (result.count === 0) throw new NotFoundException('Branch not found');
    return this.findOneScoped(businessId, branchId);
  }
}
