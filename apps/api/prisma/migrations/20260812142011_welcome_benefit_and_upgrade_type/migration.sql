-- AlterEnum
ALTER TYPE "BenefitType" ADD VALUE 'upgrade';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "welcome_benefit_id" TEXT;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_welcome_benefit_id_fkey" FOREIGN KEY ("welcome_benefit_id") REFERENCES "benefits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
