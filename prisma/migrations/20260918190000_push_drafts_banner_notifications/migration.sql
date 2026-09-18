CREATE TYPE "PushCampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'PARTIAL', 'FAILED');

ALTER TYPE "PushNotificationType" ADD VALUE IF NOT EXISTS 'BANNER';

ALTER TABLE "PushCampaign"
ADD COLUMN "status" "PushCampaignStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "sourceKey" TEXT,
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "PushCampaign"
SET
  "status" = CASE
    WHEN "failureCount" = 0 THEN 'SENT'::"PushCampaignStatus"
    WHEN "sentCount" > 0 THEN 'PARTIAL'::"PushCampaignStatus"
    ELSE 'FAILED'::"PushCampaignStatus"
  END,
  "sentAt" = "createdAt";

CREATE UNIQUE INDEX "PushCampaign_sourceKey_key" ON "PushCampaign"("sourceKey");
CREATE INDEX "PushCampaign_status_createdAt_idx" ON "PushCampaign"("status", "createdAt");
