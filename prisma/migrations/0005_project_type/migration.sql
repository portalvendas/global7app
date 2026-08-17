-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('SPLICE', 'CONSTRUCTION');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "project_type" "ProjectType" NOT NULL DEFAULT 'SPLICE';
