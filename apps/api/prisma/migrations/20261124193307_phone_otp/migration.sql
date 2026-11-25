-- Phone sign-in with SMS one-time codes (ported from TUMA). Hand-written guards at the end.
-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'PHONE_VERIFY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purpose" "OtpPurpose" NOT NULL,
    "phone" TEXT NOT NULL,
    "userId" UUID,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpDelivery" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "challengeId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpChallenge_purpose_phone_createdAt_idx" ON "OtpChallenge"("purpose", "phone", "createdAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_requestIp_createdAt_idx" ON "OtpChallenge"("requestIp", "createdAt");

-- CreateIndex
CREATE INDEX "OtpDelivery_challengeId_idx" ON "OtpDelivery"("challengeId");

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpDelivery" ADD CONSTRAINT "OtpDelivery_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "OtpChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: a verified phone number belongs to one account (it is a sign-in identifier).
CREATE UNIQUE INDEX "User_verified_phone_key" ON "User"("phone") WHERE "phoneVerifiedAt" IS NOT NULL;
-- Every account keeps a way to sign in: an email or a verified phone.
ALTER TABLE "User" ADD CONSTRAINT "User_has_login" CHECK (email IS NOT NULL OR "phoneVerifiedAt" IS NOT NULL);
