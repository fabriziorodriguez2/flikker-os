-- Verificación de email real para el alta self-service.
--
-- `email_verified_at`: null = correo sin confirmar. Backfillamos las cuentas
-- YA existentes con `created_at` para no bloquear a nadie que ya venía usando
-- Flikker antes de que este campo existiera — solo las cuentas creadas DESDE
-- este cambio en adelante arrancan realmente en null y pasan por el flujo de
-- confirmación. Las cuentas que crea Platform Admin también se marcan
-- verificadas en el código (no pasan por este backfill porque se crean después).
ALTER TABLE "User" ADD COLUMN "email_verified_at" TIMESTAMP(3);
UPDATE "User" SET "email_verified_at" = "createdAt" WHERE "email_verified_at" IS NULL;

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
