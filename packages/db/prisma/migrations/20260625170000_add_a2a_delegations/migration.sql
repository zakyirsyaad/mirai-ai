-- CreateEnum
CREATE TYPE "A2ADelegationStatus" AS ENUM ('NEGOTIATING', 'ORDER_CREATED', 'PAID', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "A2ADelegation" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "scheduledPostId" TEXT,
    "upstreamCrooOrderId" TEXT NOT NULL,
    "downstreamAgent" TEXT NOT NULL,
    "downstreamServiceId" TEXT NOT NULL,
    "downstreamNegotiationId" TEXT,
    "downstreamOrderId" TEXT,
    "status" "A2ADelegationStatus" NOT NULL DEFAULT 'NEGOTIATING',
    "requestJson" JSONB NOT NULL,
    "responseJson" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "A2ADelegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "A2ADelegation_downstreamOrderId_key" ON "A2ADelegation"("downstreamOrderId");

-- CreateIndex
CREATE INDEX "A2ADelegation_campaignId_status_idx" ON "A2ADelegation"("campaignId", "status");

-- CreateIndex
CREATE INDEX "A2ADelegation_scheduledPostId_idx" ON "A2ADelegation"("scheduledPostId");

-- CreateIndex
CREATE INDEX "A2ADelegation_downstreamServiceId_idx" ON "A2ADelegation"("downstreamServiceId");

-- AddForeignKey
ALTER TABLE "A2ADelegation" ADD CONSTRAINT "A2ADelegation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "A2ADelegation" ADD CONSTRAINT "A2ADelegation_scheduledPostId_fkey" FOREIGN KEY ("scheduledPostId") REFERENCES "ScheduledPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
