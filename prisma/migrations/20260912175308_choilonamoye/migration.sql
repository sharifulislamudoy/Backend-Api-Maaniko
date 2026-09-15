/*
  Warnings:

  - A unique constraint covering the columns `[steadfastConsignmentId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[steadfastTrackingCode]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "alternativePhone" TEXT,
ADD COLUMN     "deliveryType" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "steadfastConsignmentId" TEXT,
ADD COLUMN     "steadfastError" TEXT,
ADD COLUMN     "steadfastLastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "steadfastStatus" TEXT,
ADD COLUMN     "steadfastSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "steadfastTrackingCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_steadfastConsignmentId_key" ON "Order"("steadfastConsignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_steadfastTrackingCode_key" ON "Order"("steadfastTrackingCode");

-- CreateIndex
CREATE INDEX "Order_steadfastStatus_steadfastLastSyncedAt_idx" ON "Order"("steadfastStatus", "steadfastLastSyncedAt");
