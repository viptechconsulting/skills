-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "isTest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "isTest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "isTest" BOOLEAN NOT NULL DEFAULT false;
