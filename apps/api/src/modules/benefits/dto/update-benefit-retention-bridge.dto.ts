import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Piloto V2 — the two switches on a Benefit card in /dashboard/beneficios:
 * "Usar para recuperar clientes" (recoveryEnabled) and "Usar como
 * recompensa por visitas" (rewardGoalEnabled). `estimatedCost` is only
 * required the first time `recoveryEnabled: true` is sent for a Benefit
 * whose bridged incentive has no percentage/fixed/estimated value yet — see
 * BenefitsService.setRetentionBridge.
 */
export class UpdateBenefitRetentionBridgeDto {
  @IsOptional()
  @IsBoolean()
  recoveryEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  rewardGoalEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;
}
