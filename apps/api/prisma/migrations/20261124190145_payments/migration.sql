-- Payments via a gateway (Lenco mobile money). Hand-written guards at the end.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'MOBILE_MONEY',
ADD COLUMN     "months" INTEGER,
ADD COLUMN     "payerId" UUID,
ADD COLUMN     "payerPhone" TEXT,
ADD COLUMN     "planId" UUID,
ADD COLUMN     "succeededAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gateway" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gatewayRef" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentEvent_gatewayRef_idx" ON "PaymentEvent"("gatewayRef");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_gateway_eventId_key" ON "PaymentEvent"("gateway", "eventId");

-- CreateIndex
CREATE INDEX "Payment_status_lastCheckedAt_idx" ON "Payment"("status", "lastCheckedAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written: at most one in-flight payment per provider (also guards double-tap checkouts).
CREATE UNIQUE INDEX "Payment_one_pending_per_provider" ON "Payment"("providerId") WHERE status = 'PENDING';
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK (amount > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_months_range" CHECK (months IS NULL OR (months >= 1 AND months <= 12));
