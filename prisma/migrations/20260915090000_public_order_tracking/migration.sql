ALTER TABLE "Order"
ADD COLUMN "publicTrackingToken" TEXT,
ADD COLUMN "publicTrackingExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_publicTrackingToken_key"
ON "Order"("publicTrackingToken");

CREATE INDEX "Order_publicTrackingExpiresAt_idx"
ON "Order"("publicTrackingExpiresAt");
