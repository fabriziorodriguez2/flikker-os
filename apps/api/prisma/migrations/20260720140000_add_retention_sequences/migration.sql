-- CreateTable
CREATE TABLE "retention_sequences" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_steps" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "message_body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_sends" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "step_id" TEXT,
    "offset_days" INTEGER NOT NULL,
    "message_id" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'queued',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_sequences_business_id_key" ON "retention_sequences"("business_id");

-- CreateIndex
CREATE INDEX "retention_steps_business_id_idx" ON "retention_steps"("business_id");
CREATE INDEX "retention_steps_sequence_id_idx" ON "retention_steps"("sequence_id");
CREATE UNIQUE INDEX "retention_steps_sequence_id_offset_days_key" ON "retention_steps"("sequence_id", "offset_days");

-- CreateIndex
CREATE INDEX "retention_sends_business_id_idx" ON "retention_sends"("business_id");
CREATE INDEX "retention_sends_customer_id_idx" ON "retention_sends"("customer_id");
CREATE INDEX "retention_sends_step_id_idx" ON "retention_sends"("step_id");
CREATE UNIQUE INDEX "retention_sends_customer_id_offset_days_key" ON "retention_sends"("customer_id", "offset_days");

-- AddForeignKey
ALTER TABLE "retention_sequences" ADD CONSTRAINT "retention_sequences_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_steps" ADD CONSTRAINT "retention_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "retention_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retention_steps" ADD CONSTRAINT "retention_steps_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_sends" ADD CONSTRAINT "retention_sends_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retention_sends" ADD CONSTRAINT "retention_sends_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retention_sends" ADD CONSTRAINT "retention_sends_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "retention_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "retention_sends" ADD CONSTRAINT "retention_sends_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
