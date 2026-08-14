-- Fase 2 (Daily Production): storage do original + thumbnail no Postgres.
ALTER TABLE "attachments" ADD COLUMN "storage_key" TEXT;
ALTER TABLE "attachments" ADD COLUMN "thumbnail_data" BYTEA;
