-- Bookings and in-app messaging.
-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'RESCHEDULE_PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BookingLocation" AS ENUM ('AT_PROVIDER', 'AT_CUSTOMER');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'IMAGE', 'SYSTEM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationCategory" ADD VALUE 'BOOKING';
ALTER TYPE "NotificationCategory" ADD VALUE 'MESSAGE';

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "listingId" UUID,
    "conversationId" UUID,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "location" "BookingLocation" NOT NULL DEFAULT 'AT_PROVIDER',
    "address" TEXT,
    "note" TEXT,
    "quotedPrice" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'ZMW',
    "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "proposedScheduledAt" TIMESTAMP(3),
    "proposedById" UUID,
    "statusReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessagePreview" TEXT,
    "customerLastReadAt" TIMESTAMP(3),
    "providerLastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "senderId" UUID,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL,
    "mediaId" UUID,
    "bookingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_customerId_scheduledAt_idx" ON "Booking"("customerId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Booking_providerId_status_scheduledAt_idx" ON "Booking"("providerId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Conversation_providerId_lastMessageAt_idx" ON "Conversation"("providerId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_customerId_lastMessageAt_idx" ON "Conversation"("customerId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_customerId_providerId_key" ON "Conversation"("customerId", "providerId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written: sanity checks Prisma cannot express.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_duration_range" CHECK ("durationMinutes" BETWEEN 15 AND 1440);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customer_address" CHECK ("location" = 'AT_PROVIDER' OR "address" IS NOT NULL);
