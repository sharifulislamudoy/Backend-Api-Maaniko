CREATE TYPE "AiSupportStatus" AS ENUM ('PENDING', 'REPLIED', 'CLOSED');

CREATE TABLE "AiSupportTicket" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "pagePath" TEXT,
    "failureReason" TEXT NOT NULL,
    "status" "AiSupportStatus" NOT NULL DEFAULT 'PENDING',
    "adminReply" TEXT,
    "repliedBy" TEXT,
    "repliedAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiSupportTicket_conversationId_key"
ON "AiSupportTicket"("conversationId");

CREATE INDEX "AiSupportTicket_status_updatedAt_idx"
ON "AiSupportTicket"("status", "updatedAt");

CREATE INDEX "AiSupportTicket_visitorHash_updatedAt_idx"
ON "AiSupportTicket"("visitorHash", "updatedAt");
