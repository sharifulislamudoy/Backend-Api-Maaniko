-- One compact review request per delivered order.
ALTER TABLE "Order"
ADD COLUMN "reviewPromptDismissCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reviewPromptNextAt" TIMESTAMP(3),
ADD COLUMN "reviewPromptOptOut" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "OrderReview" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "overallRating" INTEGER NOT NULL,
  "comment" TEXT,
  "selectedOrderItemId" TEXT,
  "targetProductId" TEXT,
  "targetComboId" TEXT,
  "isVerified" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderReview_rating_check" CHECK ("overallRating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "OrderReview_orderId_key" ON "OrderReview"("orderId");
CREATE UNIQUE INDEX "OrderReview_selectedOrderItemId_key" ON "OrderReview"("selectedOrderItemId");
CREATE INDEX "OrderReview_customerId_createdAt_idx" ON "OrderReview"("customerId", "createdAt");
CREATE INDEX "OrderReview_targetProductId_createdAt_idx" ON "OrderReview"("targetProductId", "createdAt");
CREATE INDEX "OrderReview_targetComboId_createdAt_idx" ON "OrderReview"("targetComboId", "createdAt");
CREATE INDEX "OrderReview_overallRating_idx" ON "OrderReview"("overallRating");

ALTER TABLE "OrderReview"
ADD CONSTRAINT "OrderReview_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderReview"
ADD CONSTRAINT "OrderReview_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderReview"
ADD CONSTRAINT "OrderReview_selectedOrderItemId_fkey"
FOREIGN KEY ("selectedOrderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderReview"
ADD CONSTRAINT "OrderReview_targetProductId_fkey"
FOREIGN KEY ("targetProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderReview"
ADD CONSTRAINT "OrderReview_targetComboId_fkey"
FOREIGN KEY ("targetComboId") REFERENCES "Combo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
