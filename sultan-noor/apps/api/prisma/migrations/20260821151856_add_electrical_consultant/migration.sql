-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('COLLECTING_INFO', 'READY', 'CART_ADDED');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "electricalConsultantEnabled" TEXT;

-- CreateTable
CREATE TABLE "ElectricalConsultation" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'COLLECTING_INFO',
    "areaSqm" INTEGER,
    "bedrooms" INTEGER,
    "livingRooms" INTEGER,
    "kitchens" INTEGER,
    "bathrooms" INTEGER,
    "otherRooms" INTEGER,
    "hasStaircase" BOOLEAN,
    "buildingType" TEXT,
    "preferencesText" TEXT,
    "preferredBrandId" TEXT,
    "cheapestOnly" BOOLEAN NOT NULL DEFAULT false,
    "higherQuality" BOOLEAN NOT NULL DEFAULT false,
    "packagesJson" JSONB,
    "selectedTier" TEXT,
    "cartAddedAt" TIMESTAMP(3),
    "noMatchItemKeysJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectricalConsultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantItemRule" (
    "id" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "categoryId" TEXT,
    "keywords" TEXT,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "maxQuantity" INTEGER,
    "priorityBrandIds" TEXT,
    "allowedProductIdsJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantItemRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ElectricalConsultation_userId_idx" ON "ElectricalConsultation"("userId");

-- CreateIndex
CREATE INDEX "ElectricalConsultation_status_idx" ON "ElectricalConsultation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantItemRule_itemKey_key" ON "ConsultantItemRule"("itemKey");

-- AddForeignKey
ALTER TABLE "ElectricalConsultation" ADD CONSTRAINT "ElectricalConsultation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
