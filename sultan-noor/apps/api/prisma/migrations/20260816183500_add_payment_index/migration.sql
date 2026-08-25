-- CreateIndex
CREATE INDEX "Payment_orderId_authority_idx" ON "Payment"("orderId", "authority");
