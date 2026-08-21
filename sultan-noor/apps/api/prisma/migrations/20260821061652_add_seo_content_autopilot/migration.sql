-- CreateEnum
CREATE TYPE "SeoSuggestionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentDraftType" AS ENUM ('BLOG_POST', 'BUYING_GUIDE', 'COMPARISON', 'FAQ', 'EDUCATIONAL_ARTICLE', 'PRODUCT_INTRO', 'CATEGORY_CONTENT');

-- CreateEnum
CREATE TYPE "ContentDraftStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "seoAutoFixEnabled" TEXT,
ADD COLUMN     "seoContentMonthlyBudgetToman" TEXT;

-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "metaDescription" TEXT,
ADD COLUMN     "metaTitle" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "ProductSeoSuggestion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "searchKeywords" TEXT,
    "h1Suggestion" TEXT,
    "descriptionSuggestion" TEXT,
    "faq" JSONB,
    "altTextSuggestions" JSONB,
    "internalLinks" JSONB,
    "sources" JSONB,
    "confidenceNote" TEXT,
    "status" "SeoSuggestionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason" TEXT,
    "appliedFields" JSONB,
    "createdByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSeoSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL,
    "type" "ContentDraftType" NOT NULL,
    "topic" TEXT NOT NULL,
    "keywords" TEXT,
    "title" TEXT,
    "excerpt" TEXT,
    "body" TEXT,
    "faq" JSONB,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "suggestedImagePrompt" TEXT,
    "internalLinks" JSONB,
    "sources" JSONB,
    "productId" TEXT,
    "categoryId" TEXT,
    "status" "ContentDraftStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason" TEXT,
    "publishedBlogPostId" TEXT,
    "createdByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSeoSuggestion_productId_idx" ON "ProductSeoSuggestion"("productId");

-- CreateIndex
CREATE INDEX "ProductSeoSuggestion_status_idx" ON "ProductSeoSuggestion"("status");

-- CreateIndex
CREATE INDEX "ContentDraft_status_idx" ON "ContentDraft"("status");

-- CreateIndex
CREATE INDEX "ContentDraft_type_idx" ON "ContentDraft"("type");
