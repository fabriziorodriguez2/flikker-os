CREATE TABLE "ImpersonationLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetBusinessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpersonationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImpersonationLog_adminId_idx" ON "ImpersonationLog"("adminId");
CREATE INDEX "ImpersonationLog_targetBusinessId_idx" ON "ImpersonationLog"("targetBusinessId");
CREATE INDEX "ImpersonationLog_createdAt_idx" ON "ImpersonationLog"("createdAt");

ALTER TABLE "ImpersonationLog" ADD CONSTRAINT "ImpersonationLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImpersonationLog" ADD CONSTRAINT "ImpersonationLog_targetBusinessId_fkey" FOREIGN KEY ("targetBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
