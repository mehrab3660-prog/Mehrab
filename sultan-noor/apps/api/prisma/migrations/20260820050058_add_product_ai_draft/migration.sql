-- CreateEnum
CREATE TYPE "ProductAiDraftStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ProductAiDraft" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandName" TEXT,
    "modelNumber" TEXT,
    "ownerPrice" DECIMAL(14,2) NOT NULL,
    "suggestedPrice" DECIMAL(14,2),
    "description" TEXT,
    "specs" JSONB,
    "features" JSONB,
    "faq" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "categoryName" TEXT,
    "confidenceNote" TEXT,
    "sources" JSONB,
    "status" "ProductAiDraftStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason" TEXT,
    "publishedProductId" TEXT,
    "createdByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAiDraft_status_idx" ON "ProductAiDraft"("status");
