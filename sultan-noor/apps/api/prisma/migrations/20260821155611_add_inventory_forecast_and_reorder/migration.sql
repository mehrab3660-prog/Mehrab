-- CreateEnum
CREATE TYPE "ReorderRecommendationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXECUTED');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "aiAutonomousMode" TEXT;

-- CreateTable
CREATE TABLE "ReorderRecommendation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "avgDailySales" DOUBLE PRECISION NOT NULL,
    "daysRemaining" DOUBLE PRECISION,
    "riskLevel" TEXT NOT NULL,
    "suggestedQuantity" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL,
    "status" "ReorderRecommendationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason" TEXT,
    "purchaseOrderId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReorderRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReorderRecommendation_status_idx" ON "ReorderRecommendation"("status");

-- CreateIndex
CREATE INDEX "ReorderRecommendation_productId_idx" ON "ReorderRecommendation"("productId");
