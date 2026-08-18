-- CreateIndex
CREATE INDEX "bills_team_id_idx" ON "bills"("team_id");

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
