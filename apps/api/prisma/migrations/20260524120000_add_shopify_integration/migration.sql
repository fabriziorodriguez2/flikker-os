-- CreateEnum
CREATE TYPE "ShopifyOrderStatus" AS ENUM ('pending', 'scheduled', 'skipped', 'failed');

-- CreateTable
CREATE TABLE "ShopifyIntegration" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "webhook_secret" TEXT NOT NULL,
    "delay_hours" INTEGER NOT NULL DEFAULT 24,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "customer_email" TEXT,
    "status" "ShopifyOrderStatus" NOT NULL DEFAULT 'pending',
    "scheduled_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "skip_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopifyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyIntegration_businessId_key" ON "ShopifyIntegration"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyIntegration_shop_domain_key" ON "ShopifyIntegration"("shop_domain");

-- CreateIndex
CREATE INDEX "ShopifyIntegration_shop_domain_idx" ON "ShopifyIntegration"("shop_domain");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyOrder_integrationId_shopify_order_id_key" ON "ShopifyOrder"("integrationId", "shopify_order_id");

-- CreateIndex
CREATE INDEX "ShopifyOrder_businessId_idx" ON "ShopifyOrder"("businessId");

-- CreateIndex
CREATE INDEX "ShopifyOrder_integrationId_idx" ON "ShopifyOrder"("integrationId");

-- AddForeignKey
ALTER TABLE "ShopifyIntegration" ADD CONSTRAINT "ShopifyIntegration_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyOrder" ADD CONSTRAINT "ShopifyOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyOrder" ADD CONSTRAINT "ShopifyOrder_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ShopifyIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
