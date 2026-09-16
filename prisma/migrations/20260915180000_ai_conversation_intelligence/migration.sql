ALTER TABLE "AiChatLog"
ADD COLUMN "conversationId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "intent" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "question" TEXT NOT NULL DEFAULT '',
ADD COLUMN "normalizedQuestion" TEXT NOT NULL DEFAULT '',
ADD COLUMN "answer" TEXT NOT NULL DEFAULT '',
ADD COLUMN "pagePath" TEXT,
ADD COLUMN "needsFollowUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resolved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "helpful" BOOLEAN,
ADD COLUMN "feedback" TEXT,
ADD COLUMN "quickReplies" JSONB,
ADD COLUMN "recommendedItems" JSONB,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "AiChatLog"
SET "conversationId" = 'legacy_' || "id"
WHERE "conversationId" = '';

CREATE INDEX "AiChatLog_conversationId_createdAt_idx"
ON "AiChatLog"("conversationId", "createdAt");

CREATE INDEX "AiChatLog_needsFollowUp_createdAt_idx"
ON "AiChatLog"("needsFollowUp", "createdAt");

CREATE INDEX "AiChatLog_helpful_createdAt_idx"
ON "AiChatLog"("helpful", "createdAt");

CREATE TYPE "AiKnowledgeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AiKnowledgeEntry" (
    "id" TEXT NOT NULL,
    "sourceLogId" TEXT,
    "question" TEXT NOT NULL,
    "normalizedQuestion" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "keywords" TEXT[] NOT NULL,
    "status" "AiKnowledgeStatus" NOT NULL DEFAULT 'PENDING',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiKnowledgeEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiKnowledgeEntry_sourceLogId_key" ON "AiKnowledgeEntry"("sourceLogId");
CREATE UNIQUE INDEX "AiKnowledgeEntry_normalizedQuestion_key" ON "AiKnowledgeEntry"("normalizedQuestion");
CREATE INDEX "AiKnowledgeEntry_status_updatedAt_idx" ON "AiKnowledgeEntry"("status", "updatedAt");
CREATE INDEX "AiKnowledgeEntry_intent_status_idx" ON "AiKnowledgeEntry"("intent", "status");
