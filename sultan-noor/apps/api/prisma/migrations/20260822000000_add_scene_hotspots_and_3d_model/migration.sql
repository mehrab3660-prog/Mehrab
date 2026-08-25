-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "model3dUrl" TEXT;

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "site3dEnabled" TEXT;

-- CreateTable
CREATE TABLE "SceneHotspot" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '💡',
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "positionZ" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SceneHotspot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SceneHotspot_productId_idx" ON "SceneHotspot"("productId");

-- CreateIndex
CREATE INDEX "SceneHotspot_isActive_idx" ON "SceneHotspot"("isActive");

-- AddForeignKey
ALTER TABLE "SceneHotspot" ADD CONSTRAINT "SceneHotspot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
