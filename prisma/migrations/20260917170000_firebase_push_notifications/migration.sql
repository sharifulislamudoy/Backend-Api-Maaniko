CREATE TYPE "PushNotificationType" AS ENUM ('OFFER', 'ORDER_STATUS', 'TEST');

CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "customerId" TEXT,
    "platform" TEXT,
    "userAgent" TEXT,
    "allowOffers" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PushCampaign" (
    "id" TEXT NOT NULL,
    "type" "PushNotificationType" NOT NULL DEFAULT 'OFFER',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "link" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");
CREATE INDEX "PushDevice_guestId_idx" ON "PushDevice"("guestId");
CREATE INDEX "PushDevice_customerId_enabled_idx" ON "PushDevice"("customerId", "enabled");
CREATE INDEX "PushDevice_enabled_allowOffers_idx" ON "PushDevice"("enabled", "allowOffers");
CREATE INDEX "PushCampaign_type_createdAt_idx" ON "PushCampaign"("type", "createdAt");
CREATE INDEX "PushCampaign_createdAt_idx" ON "PushCampaign"("createdAt");

ALTER TABLE "PushDevice"
ADD CONSTRAINT "PushDevice_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
