ALTER TABLE "CustomerLead" ADD COLUMN "variantId" TEXT;

ALTER TABLE "CustomerLead"
ADD CONSTRAINT "CustomerLead_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CustomerLead_variantId_idx" ON "CustomerLead"("variantId");
