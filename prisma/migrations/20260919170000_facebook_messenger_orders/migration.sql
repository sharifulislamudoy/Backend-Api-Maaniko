CREATE TABLE "FacebookConversation" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "psid" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'BROWSING',
    "productId" TEXT,
    "variantId" TEXT,
    "quantity" INTEGER,
    "customerName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "orderId" TEXT,
    "aiHistory" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FacebookWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "psid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacebookWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacebookConversation_pageId_psid_key"
ON "FacebookConversation"("pageId", "psid");

CREATE INDEX "FacebookConversation_stage_updatedAt_idx"
ON "FacebookConversation"("stage", "updatedAt");

CREATE INDEX "FacebookConversation_expiresAt_idx"
ON "FacebookConversation"("expiresAt");

CREATE INDEX "FacebookConversation_orderId_idx"
ON "FacebookConversation"("orderId");

CREATE UNIQUE INDEX "FacebookWebhookEvent_eventId_key"
ON "FacebookWebhookEvent"("eventId");

CREATE INDEX "FacebookWebhookEvent_status_createdAt_idx"
ON "FacebookWebhookEvent"("status", "createdAt");

CREATE INDEX "FacebookWebhookEvent_pageId_psid_createdAt_idx"
ON "FacebookWebhookEvent"("pageId", "psid", "createdAt");
