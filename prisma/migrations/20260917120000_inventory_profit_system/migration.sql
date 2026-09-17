ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURNED';

CREATE TYPE "InventoryMovementType" AS ENUM ('INITIAL_STOCK', 'PURCHASE', 'MANUAL_IN', 'MANUAL_OUT', 'RESERVED', 'RELEASED', 'SOLD', 'RETURNED', 'ADJUSTMENT');
CREATE TYPE "ExpenseCategory" AS ENUM ('MARKETING', 'SALARY', 'RENT', 'SOFTWARE', 'TRANSPORT', 'UTILITIES', 'DAMAGE_LOSS', 'OTHER');
CREATE TYPE "FinanceEntryType" AS ENUM ('SALE', 'RETURN', 'ADJUSTMENT');

ALTER TABLE "Product"
ADD COLUMN "reservedStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "soldStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "purchaseCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "packagingCost" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "ProductVariant"
ADD COLUMN "reservedStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "soldStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "purchaseCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "packagingCost" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "Combo"
ADD COLUMN "reservedStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "soldStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "packagingCost" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "Order"
ADD COLUMN "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "productCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "packagingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "courierCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "gatewayFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "otherCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "grossProfit" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "netProfit" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "profitMargin" DECIMAL(7,2) NOT NULL DEFAULT 0,
ADD COLUMN "financialRecognized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "returnedAt" TIMESTAMP(3);

ALTER TABLE "OrderItem"
ADD COLUMN "purchaseCostSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "packagingCostSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "productId" TEXT,
  "variantId" TEXT,
  "supplierId" TEXT,
  "orderId" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(12,2),
  "previousStock" INTEGER NOT NULL,
  "newStock" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");
CREATE INDEX "InventoryMovement_variantId_createdAt_idx" ON "InventoryMovement"("variantId", "createdAt");
CREATE INDEX "InventoryMovement_orderId_idx" ON "InventoryMovement"("orderId");
CREATE INDEX "InventoryMovement_supplierId_idx" ON "InventoryMovement"("supplierId");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OperatingExpense" (
  "id" TEXT NOT NULL,
  "category" "ExpenseCategory" NOT NULL,
  "title" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "expenseDate" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperatingExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatingExpense_expenseDate_idx" ON "OperatingExpense"("expenseDate");
CREATE INDEX "OperatingExpense_category_expenseDate_idx" ON "OperatingExpense"("category", "expenseDate");

CREATE TABLE "FinanceEntry" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "type" "FinanceEntryType" NOT NULL,
  "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "productCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "packagingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "courierCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "gatewayFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "otherCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netProfit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceEntry_orderId_type_key" ON "FinanceEntry"("orderId", "type");
CREATE INDEX "FinanceEntry_occurredAt_idx" ON "FinanceEntry"("occurredAt");
CREATE INDEX "FinanceEntry_type_occurredAt_idx" ON "FinanceEntry"("type", "occurredAt");
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
