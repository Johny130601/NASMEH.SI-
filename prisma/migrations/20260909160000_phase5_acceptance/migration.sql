-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ReviewRequest" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "leaseToken" TEXT,
ADD COLUMN     "leaseUntil" TIMESTAMP(3),
ALTER COLUMN "sentAt" DROP NOT NULL,
ALTER COLUMN "sentAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Order_status_deliveredAt_idx" ON "Order"("status", "deliveredAt");

-- Older orders did not record delivery separately. Preserve their best
-- available historical timestamp once; subsequent edits do not change it.
UPDATE "Order" SET "deliveredAt" = "updatedAt" WHERE "status" = 'DELIVERED';

CREATE FUNCTION "stamp_order_delivery"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" = 'DELIVERED' AND NEW."deliveredAt" IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW."deliveredAt" := CURRENT_TIMESTAMP;
    ELSIF OLD."status" <> 'DELIVERED' OR OLD."deliveredAt" IS NULL THEN
      NEW."deliveredAt" := COALESCE(OLD."deliveredAt", CURRENT_TIMESTAMP);
    ELSE
      NEW."deliveredAt" := OLD."deliveredAt";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Order_stamp_delivery"
BEFORE INSERT OR UPDATE ON "Order"
FOR EACH ROW EXECUTE FUNCTION "stamp_order_delivery"();

-- Repair legacy multiple/missing defaults before enforcing at most one.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "userId" ORDER BY "isDefault" DESC, "createdAt", "id"
  ) AS position FROM "Address"
)
UPDATE "Address" AS address SET "isDefault" = (ranked.position = 1)
FROM ranked WHERE address."id" = ranked."id";

CREATE UNIQUE INDEX "Address_one_default_per_user"
ON "Address"("userId") WHERE "isDefault" = true;
