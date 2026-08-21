-- CreateEnum
CREATE TYPE "NewsItemStatus" AS ENUM ('DISCOVERED', 'VERIFIED', 'AI_DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NewsImageSource" AS ENUM ('SOURCE', 'SOURCE_SEARCH', 'AI_GENERATED');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "newsMonthlyBudgetToman" TEXT,
ADD COLUMN     "storeAiAllowAddToCart" TEXT,
ADD COLUMN     "storeAiEnabled" TEXT,
ADD COLUMN     "storeAiMaxResults" TEXT,
ADD COLUMN     "storeAiMonthlyBudgetToman" TEXT,
ADD COLUMN     "storeAiRateLimitPerMinute" TEXT,
ADD COLUMN     "storeAiStrictCatalogOnly" TEXT;

-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "category" TEXT,
ADD COLUMN     "tags" TEXT;

-- CreateTable
CREATE TABLE "NewsSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "rawSummary" TEXT,
    "language" TEXT,
    "publishedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "NewsItemStatus" NOT NULL DEFAULT 'DISCOVERED',
    "duplicateOfId" TEXT,
    "similarGroupKey" TEXT,
    "confidenceNote" TEXT,
    "draftTitle" TEXT,
    "draftExcerpt" TEXT,
    "draftBody" TEXT,
    "category" TEXT,
    "tags" TEXT,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "keywords" TEXT,
    "faq" JSONB,
    "confirmingSources" JSONB,
    "suggestedImagePrompt" TEXT,
    "imageUrl" TEXT,
    "imageSource" "NewsImageSource",
    "imageIsAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "imageAttribution" TEXT,
    "publishedBlogPostId" TEXT,
    "rejectionReason" TEXT,
    "createdByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsItem_status_idx" ON "NewsItem"("status");

-- CreateIndex
CREATE INDEX "NewsItem_contentHash_idx" ON "NewsItem"("contentHash");

-- CreateIndex
CREATE INDEX "NewsItem_similarGroupKey_idx" ON "NewsItem"("similarGroupKey");
