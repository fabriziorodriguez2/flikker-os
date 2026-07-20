-- CreateEnum
CREATE TYPE "BenefitType" AS ENUM ('none', 'discount', 'gift', 'raffle', 'promotion', 'other');

-- CreateTable
CREATE TABLE "benefits" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "type" "BenefitType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "terms" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "recurrence" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_participations" (
    "id" TEXT NOT NULL,
    "benefit_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benefit_participations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "benefits_business_id_idx" ON "benefits"("business_id");
CREATE INDEX "benefits_business_id_active_idx" ON "benefits"("business_id", "active");

-- CreateIndex: guarantee at most one active benefit per business at the DB level.
CREATE UNIQUE INDEX "benefits_one_active_per_business" ON "benefits"("business_id") WHERE "active";

-- CreateIndex
CREATE UNIQUE INDEX "benefit_participations_benefit_id_customer_id_key" ON "benefit_participations"("benefit_id", "customer_id");
CREATE INDEX "benefit_participations_business_id_idx" ON "benefit_participations"("business_id");
CREATE INDEX "benefit_participations_benefit_id_idx" ON "benefit_participations"("benefit_id");
CREATE INDEX "benefit_participations_customer_id_idx" ON "benefit_participations"("customer_id");

-- AddForeignKey
ALTER TABLE "benefits" ADD CONSTRAINT "benefits_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_participations" ADD CONSTRAINT "benefit_participations_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "benefits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benefit_participations" ADD CONSTRAINT "benefit_participations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "benefit_participations" ADD CONSTRAINT "benefit_participations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
