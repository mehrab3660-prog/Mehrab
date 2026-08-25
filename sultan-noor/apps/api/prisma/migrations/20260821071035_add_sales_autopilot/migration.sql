-- CreateEnum
CREATE TYPE "SalesRecommendationType" AS ENUM ('CROSS_SELL', 'BUNDLE', 'DISCOUNT', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "SalesRecommendationSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "SalesRecommendationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ACTIVE');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "salesAiMonthlyBudgetToman" TEXT;

-- CreateTable
CREATE TABLE "SalesRecommendation" (
    "id" TEXT NOT NULL,
    "type" "SalesRecommendationType" NOT NULL,
    "severity" "SalesRecommendationSeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "supportingData" JSONB,
    "productIds" JSONB,
    "payload" JSONB,
    "confidenceNote" TEXT,
    "sources" JSONB,
    "status" "SalesRecommendationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason" TEXT,
    "createdByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesRecommendation_status_idx" ON "SalesRecommendation"("status");

-- CreateIndex
CREATE INDEX "SalesRecommendation_type_idx" ON "SalesRecommendation"("type");
