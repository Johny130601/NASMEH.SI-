-- CreateEnum
CREATE TYPE "SoldOutBehavior" AS ENUM ('NOTIFY', 'HIDE');

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "bannerImageMobile" TEXT,
ADD COLUMN     "hideBannerText" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "klarnaEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "soldOutBehavior" "SoldOutBehavior" NOT NULL DEFAULT 'NOTIFY';

-- AlterTable
ALTER TABLE "Variant" ADD COLUMN     "allowBackorder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "backorderNote" TEXT;


-- Data: low-stock threshold (§14.2), inserted only when the operator has not set one.
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('inventory.lowStockThreshold', '5'::jsonb, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
