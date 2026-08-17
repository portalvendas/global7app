-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "w9_address" TEXT,
ADD COLUMN     "w9_business_name" TEXT,
ADD COLUMN     "w9_city" TEXT,
ADD COLUMN     "w9_ein" TEXT,
ADD COLUMN     "w9_file_key" TEXT,
ADD COLUMN     "w9_file_name" TEXT,
ADD COLUMN     "w9_received_at" TIMESTAMP(3),
ADD COLUMN     "w9_state" TEXT,
ADD COLUMN     "w9_tax_classification" TEXT,
ADD COLUMN     "w9_zip" TEXT;

