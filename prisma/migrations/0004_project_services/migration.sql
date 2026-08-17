-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_subcontractor_company_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_team_id_fkey";

-- DropIndex
DROP INDEX "projects_subcontractor_company_id_idx";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "contract_value",
DROP COLUMN "description",
DROP COLUMN "subcontractor_company_id",
DROP COLUMN "team_id";

-- CreateTable
CREATE TABLE "project_subcontractors" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,

    CONSTRAINT "project_subcontractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_services" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "client_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sub_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_subcontractors_company_id_idx" ON "project_subcontractors"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_subcontractors_project_id_company_id_key" ON "project_subcontractors"("project_id", "company_id");

-- CreateIndex
CREATE INDEX "project_services_project_id_idx" ON "project_services"("project_id");

-- AddForeignKey
ALTER TABLE "project_subcontractors" ADD CONSTRAINT "project_subcontractors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_subcontractors" ADD CONSTRAINT "project_subcontractors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_services" ADD CONSTRAINT "project_services_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

