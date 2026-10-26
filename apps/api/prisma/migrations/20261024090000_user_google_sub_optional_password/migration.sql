-- "Continuar con Google": una cuenta creada solo con Google no tiene password.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Identidad estable de Google (`sub` del ID token). Nullable: la mayoría de
-- los usuarios no la tiene.
ALTER TABLE "User" ADD COLUMN "google_sub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_google_sub_key" ON "User"("google_sub");
