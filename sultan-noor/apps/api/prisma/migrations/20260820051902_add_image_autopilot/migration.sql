-- CreateEnum
CREATE TYPE "ProductImageType" AS ENUM ('REAL_SOURCE', 'PROCESSED_REAL', 'AI_GENERATED', 'ADMIN_UPLOADED');

-- CreateEnum
CREATE TYPE "ProductAiDraftImageStatus" AS ENUM ('CANDIDATE', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "imageAutopilotMonthlyBudgetToman" DECIMAL(12,2),
ADD COLUMN     "imageGenerationProvider" TEXT,
ADD COLUMN     "imageSearchApiKey" TEXT,
ADD COLUMN     "imageSearchProvider" TEXT,
ADD COLUMN     "removeBgApiKey" TEXT;

-- AlterTable
ALTER TABLE "ProductAiDraft" ADD COLUMN     "imageAutopilotNote" TEXT;

-- CreateTable
CREATE TABLE "ProductAiDraftImage" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "imageType" "ProductImageType" NOT NULL,
    "status" "ProductAiDraftImageStatus" NOT NULL DEFAULT 'CANDIDATE',
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT,
    "url" TEXT,
    "thumbnailUrl" TEXT,
    "webpUrl" TEXT,
    "avifUrl" TEXT,
    "sourceUrl" TEXT,
    "sourceProvider" TEXT,
    "attribution" TEXT,
    "isOfficialSource" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "fileSizeBytes" INTEGER,
    "format" TEXT,
    "contentHash" TEXT,
    "relevanceScore" DOUBLE PRECISION,
    "rejectionReason" TEXT,
    "aiProvider" TEXT,
    "aiPromptVersion" TEXT,
    "aiPrompt" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAiDraftImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "draftId" TEXT,
    "costToman" DECIMAL(12,2),
    "success" BOOLEAN NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAiDraftImage_draftId_idx" ON "ProductAiDraftImage"("draftId");

-- CreateIndex
CREATE INDEX "ProductAiDraftImage_status_idx" ON "ProductAiDraftImage"("status");

-- CreateIndex
CREATE INDEX "AiUsageLog_provider_createdAt_idx" ON "AiUsageLog"("provider", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductAiDraftImage" ADD CONSTRAINT "ProductAiDraftImage_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ProductAiDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
