import { Controller, Get, Param } from '@nestjs/common';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * Lists all active plans. Public endpoint — no auth required.
   */
  @Get()
  findAll() {
    return this.plansService.findAllActive();
  }

  /**
   * Returns a specific plan by slug. Public endpoint.
   */
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.plansService.findBySlug(slug);
  }
}
