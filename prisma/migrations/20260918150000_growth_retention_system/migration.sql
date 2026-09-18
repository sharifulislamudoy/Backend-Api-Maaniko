-- Maaniko growth and retention: rewards, referral, lifecycle reminders,
-- enhanced care profile and checkout point redemption.

CREATE TYPE "RewardTransactionType" AS ENUM ('ORDER_EARN', 'ORDER_RETURN', 'REFERRAL_BONUS', 'REDEEM', 'ADMIN_ADJUSTMENT');
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REWARDED', 'CANCELLED');
CREATE TYPE "ReminderType" AS ENUM ('CART_RECOVERY', 'PRICE_DROP', 'BACK_IN_STOCK', 'REORDER');
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'COMPLETED', 'CANCELLED');

ALTER TABLE "Product" ADD COLUMN "reorderAfterDays" INTEGER;

ALTER TABLE "CustomerProfile"
  ADD COLUMN "babyBirthDate" TIMESTAMP(3),
  ADD COLUMN "expectedDeliveryDate" TIMESTAMP(3),
  ADD COLUMN "babyGender" TEXT,
  ADD COLUMN "feedingPreference" TEXT,
  ADD COLUMN "reorderRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "referralCode" TEXT,
  ADD COLUMN "referredById" TEXT,
  ADD COLUMN "rewardBalance" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Cart"
  ADD COLUMN "reminderOneSentAt" TIMESTAMP(3),
  ADD COLUMN "reminderTwoSentAt" TIMESTAMP(3),
  ADD COLUMN "reminderThreeSentAt" TIMESTAMP(3);

ALTER TABLE "Order"
  ADD COLUMN "rewardPointsUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rewardDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "CustomerLead"
  ADD COLUMN "baselinePrice" DECIMAL(12,2),
  ADD COLUMN "baselineStock" INTEGER,
  ADD COLUMN "notifiedAt" TIMESTAMP(3);

CREATE TABLE "RewardTransaction" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "orderId" TEXT,
  "type" "RewardTransactionType" NOT NULL,
  "points" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Referral" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "referredCustomerId" TEXT NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "qualifiedOrderId" TEXT,
  "rewardedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LifecycleReminder" (
  "id" TEXT NOT NULL,
  "type" "ReminderType" NOT NULL,
  "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
  "customerId" TEXT NOT NULL,
  "cartId" TEXT,
  "orderItemId" TEXT,
  "productId" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "dedupeKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LifecycleReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerProfile_referralCode_key" ON "CustomerProfile"("referralCode");
CREATE INDEX "CustomerProfile_referredById_idx" ON "CustomerProfile"("referredById");
CREATE UNIQUE INDEX "RewardTransaction_dedupeKey_key" ON "RewardTransaction"("dedupeKey");
CREATE INDEX "RewardTransaction_customerId_createdAt_idx" ON "RewardTransaction"("customerId", "createdAt");
CREATE INDEX "RewardTransaction_orderId_idx" ON "RewardTransaction"("orderId");
CREATE UNIQUE INDEX "Referral_referredCustomerId_key" ON "Referral"("referredCustomerId");
CREATE INDEX "Referral_referrerId_status_idx" ON "Referral"("referrerId", "status");
CREATE UNIQUE INDEX "LifecycleReminder_dedupeKey_key" ON "LifecycleReminder"("dedupeKey");
CREATE INDEX "LifecycleReminder_status_dueAt_idx" ON "LifecycleReminder"("status", "dueAt");
CREATE INDEX "LifecycleReminder_customerId_type_idx" ON "LifecycleReminder"("customerId", "type");
CREATE INDEX "LifecycleReminder_productId_idx" ON "LifecycleReminder"("productId");

ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredCustomerId_fkey" FOREIGN KEY ("referredCustomerId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleReminder" ADD CONSTRAINT "LifecycleReminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleReminder" ADD CONSTRAINT "LifecycleReminder_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleReminder" ADD CONSTRAINT "LifecycleReminder_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleReminder" ADD CONSTRAINT "LifecycleReminder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
