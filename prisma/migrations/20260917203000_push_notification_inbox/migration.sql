CREATE TABLE "PushInboxItem" (
    "id" TEXT NOT NULL,
    "type" "PushNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "link" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "guestId" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushInboxItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PushInboxItem_isGlobal_createdAt_idx" ON "PushInboxItem"("isGlobal", "createdAt");
CREATE INDEX "PushInboxItem_guestId_createdAt_idx" ON "PushInboxItem"("guestId", "createdAt");
CREATE INDEX "PushInboxItem_customerId_createdAt_idx" ON "PushInboxItem"("customerId", "createdAt");

ALTER TABLE "PushInboxItem"
ADD CONSTRAINT "PushInboxItem_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PushInboxItem" (
    "id",
    "type",
    "title",
    "body",
    "imageUrl",
    "link",
    "isGlobal",
    "createdAt"
)
SELECT
    'legacy_' || "id",
    "type",
    "title",
    "body",
    "imageUrl",
    "link",
    true,
    "createdAt"
FROM "PushCampaign";
