-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SimulationScenario" ADD VALUE 'TWO_ARM_REMINDER';
ALTER TYPE "SimulationScenario" ADD VALUE 'TWO_ARM_SOFT_BENEFIT';
ALTER TYPE "SimulationScenario" ADD VALUE 'REWARD_PROGRESS';
ALTER TYPE "SimulationScenario" ADD VALUE 'NEAR_TIE';
ALTER TYPE "SimulationScenario" ADD VALUE 'STRONG_SIGNAL';
