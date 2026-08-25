-- AlterTable
ALTER TABLE "WishlistItem" ADD COLUMN     "lastAlertedPrice" DECIMAL(14,2),
ADD COLUMN     "priceAtAdd" DECIMAL(14,2);

-- Backfill existing rows from the product's current price (no earlier price
-- was ever recorded for them).
UPDATE "WishlistItem" wi
SET "priceAtAdd" = p."basePrice"
FROM "Product" p
WHERE p.id = wi."productId";

ALTER TABLE "WishlistItem" ALTER COLUMN "priceAtAdd" SET NOT NULL;
