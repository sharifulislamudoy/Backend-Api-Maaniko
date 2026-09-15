-- CreateEnum
CREATE TYPE "ContentPageCategory" AS ENUM ('SUPPORT', 'POLICY', 'COMPANY');

-- CreateTable
CREATE TABLE "ContentPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "ContentPageCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "eyebrow" TEXT,
    "summary" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPageSection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pageId" TEXT NOT NULL,

    CONSTRAINT "ContentPageSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "customComboMinSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 2000,
    "customComboDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentPage_slug_key" ON "ContentPage"("slug");

-- CreateIndex
CREATE INDEX "ContentPage_category_sortOrder_idx" ON "ContentPage"("category", "sortOrder");

-- CreateIndex
CREATE INDEX "ContentPage_isPublished_idx" ON "ContentPage"("isPublished");

-- CreateIndex
CREATE INDEX "ContentPageSection_pageId_sortOrder_idx" ON "ContentPageSection"("pageId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ContentPageSection" ADD CONSTRAINT "ContentPageSection_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ContentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
