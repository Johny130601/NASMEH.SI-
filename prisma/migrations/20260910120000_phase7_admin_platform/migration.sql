-- Phase 7 step 1: staff roles replace the single ADMIN role (existing admins
-- become owners in this same deploy) and users gain TOTP second-factor state.

-- Role enum swap (Prisma pattern): new type, converted column, old type dropped.
CREATE TYPE "Role_new" AS ENUM ('CUSTOMER', 'OWNER', 'MANAGER', 'SUPPORT', 'FULFILLMENT');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'OWNER' ELSE "role"::text END)::"Role_new";
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "staffInvitedAt" TIMESTAMP(3),
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpRecoveryCodes" JSONB,
ADD COLUMN     "totpSecret" TEXT;
