-- AlterTable
ALTER TABLE "locations" ADD COLUMN "latitude" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "locations" ADD COLUMN "longitude" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Remove defaults (columns are populated via seed)
ALTER TABLE "locations" ALTER COLUMN "latitude" DROP DEFAULT;
ALTER TABLE "locations" ALTER COLUMN "longitude" DROP DEFAULT;
