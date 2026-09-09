-- CreateTable
CREATE TABLE "BackInStockSubscription" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'PENDING',
    "confirmToken" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'back-in-stock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackInStockSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BackInStockSubscription_confirmToken_key" ON "BackInStockSubscription"("confirmToken");

-- CreateIndex
CREATE INDEX "BackInStockSubscription_productId_idx" ON "BackInStockSubscription"("productId");

-- CreateIndex
CREATE INDEX "BackInStockSubscription_variantId_idx" ON "BackInStockSubscription"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "BackInStockSubscription_email_productId_key" ON "BackInStockSubscription"("email", "productId");

-- AddForeignKey
ALTER TABLE "BackInStockSubscription" ADD CONSTRAINT "BackInStockSubscription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackInStockSubscription" ADD CONSTRAINT "BackInStockSubscription_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
