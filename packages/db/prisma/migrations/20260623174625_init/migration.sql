-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "VoiceProfileSource" AS ENUM ('DERIVED', 'QUESTIONNAIRE', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "ContentItemStatus" AS ENUM ('PENDING', 'USED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PAID', 'DELIVERED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentMode" AS ENUM ('AUTONOMOUS', 'USER_SUPPLIED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('WAITING_FOR_X', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PostStage" AS ENUM ('PLANNED', 'ACQUIRED', 'COMPOSED', 'REVIEWED', 'POSTED', 'RECORDED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "DashboardSession" (
    "id" TEXT NOT NULL,
    "buyerWallet" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XConnection" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "xUserId" TEXT NOT NULL,
    "xHandle" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "tweetCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "source" "VoiceProfileSource" NOT NULL,
    "tone" TEXT NOT NULL,
    "topics" TEXT[],
    "styleNotes" TEXT[],
    "doNots" TEXT[],
    "sampleVoice" TEXT NOT NULL DEFAULT '',
    "niche" TEXT,
    "audience" TEXT,
    "goal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "status" "ContentItemStatus" NOT NULL DEFAULT 'PENDING',
    "usedByPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "crooOrderId" TEXT NOT NULL,
    "negotiationId" TEXT,
    "buyerWallet" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PAID',
    "sessionId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "contentMode" "ContentMode" NOT NULL DEFAULT 'AUTONOMOUS',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "CampaignStatus" NOT NULL DEFAULT 'WAITING_FOR_X',
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "angle" TEXT,
    "stage" "PostStage" NOT NULL DEFAULT 'PLANNED',
    "rawMaterial" TEXT,
    "draftText" TEXT,
    "tweetId" TEXT,
    "tweetUrl" TEXT,
    "postedAt" TIMESTAMP(3),
    "metrics" JSONB,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardSession_buyerWallet_idx" ON "DashboardSession"("buyerWallet");

-- CreateIndex
CREATE UNIQUE INDEX "XConnection_sessionId_key" ON "XConnection"("sessionId");

-- CreateIndex
CREATE INDEX "XConnection_xUserId_idx" ON "XConnection"("xUserId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceProfile_campaignId_key" ON "VoiceProfile"("campaignId");

-- CreateIndex
CREATE INDEX "ContentItem_campaignId_status_idx" ON "ContentItem"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_crooOrderId_key" ON "Order"("crooOrderId");

-- CreateIndex
CREATE INDEX "Order_buyerWallet_idx" ON "Order"("buyerWallet");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_orderId_key" ON "Campaign"("orderId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "ScheduledPost_campaignId_stage_idx" ON "ScheduledPost"("campaignId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledPost_campaignId_slotIndex_key" ON "ScheduledPost"("campaignId", "slotIndex");

-- AddForeignKey
ALTER TABLE "XConnection" ADD CONSTRAINT "XConnection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DashboardSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceProfile" ADD CONSTRAINT "VoiceProfile_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DashboardSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DashboardSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
