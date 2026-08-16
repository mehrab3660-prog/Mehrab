-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "province" TEXT,
    "maxWeightGrams" INTEGER NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_province_maxWeightGrams_key" ON "ShippingRate"("province", "maxWeightGrams");
