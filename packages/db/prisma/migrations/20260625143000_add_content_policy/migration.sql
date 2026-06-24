-- Add campaign-level content filters used before automatic posting.
CREATE TABLE "ContentPolicy" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "allowedTopics" TEXT[],
    "blockedTopics" TEXT[],
    "blockedPhrases" TEXT[],
    "language" TEXT NOT NULL DEFAULT 'any',
    "toneRules" TEXT[],
    "formatRules" TEXT[],
    "requireApprovalFor" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentPolicy_campaignId_key" ON "ContentPolicy"("campaignId");

ALTER TABLE "ContentPolicy" ADD CONSTRAINT "ContentPolicy_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
