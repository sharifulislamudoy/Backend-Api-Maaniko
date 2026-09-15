CREATE TABLE "AiChatLog" (
    "id" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "responseTimeMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiChatLog_createdAt_idx" ON "AiChatLog"("createdAt");
CREATE INDEX "AiChatLog_topic_createdAt_idx" ON "AiChatLog"("topic", "createdAt");
CREATE INDEX "AiChatLog_visitorHash_createdAt_idx" ON "AiChatLog"("visitorHash", "createdAt");
