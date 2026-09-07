-- AlterTable
ALTER TABLE "budget_items" ADD COLUMN     "source_key" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "fund_incomes" ADD COLUMN     "source_key" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "leaves" ADD COLUMN     "source_key" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "source_key" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "patents" ADD COLUMN     "source_key" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "project_members" ADD COLUMN     "source_key" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "publications" ADD COLUMN     "source_key" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "source_key" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tech_transfers" ADD COLUMN     "source_key" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "budget_items_project_id_spent_date_idx" ON "budget_items"("project_id", "spent_date");

-- CreateIndex
CREATE INDEX "budget_items_project_id_source_key_idx" ON "budget_items"("project_id", "source_key");

-- CreateIndex
CREATE INDEX "experiments_lab_id_start_date_idx" ON "experiments"("lab_id", "start_date");

-- CreateIndex
CREATE INDEX "experiments_project_id_idx" ON "experiments"("project_id");

-- CreateIndex
CREATE INDEX "experiments_sample_id_idx" ON "experiments"("sample_id");

-- CreateIndex
CREATE INDEX "experiments_assignee_id_idx" ON "experiments"("assignee_id");

-- CreateIndex
CREATE INDEX "fund_incomes_lab_id_date_idx" ON "fund_incomes"("lab_id", "date");

-- CreateIndex
CREATE INDEX "fund_incomes_project_id_idx" ON "fund_incomes"("project_id");

-- CreateIndex
CREATE INDEX "fund_incomes_lab_id_source_key_idx" ON "fund_incomes"("lab_id", "source_key");

-- CreateIndex
CREATE INDEX "instruments_lab_id_name_idx" ON "instruments"("lab_id", "name");

-- CreateIndex
CREATE INDEX "instruments_manager_id_idx" ON "instruments"("manager_id");

-- CreateIndex
CREATE INDEX "invitations_lab_id_idx" ON "invitations"("lab_id");

-- CreateIndex
CREATE INDEX "invitations_invited_by_id_idx" ON "invitations"("invited_by_id");

-- CreateIndex
CREATE INDEX "leaves_lab_id_status_start_date_idx" ON "leaves"("lab_id", "status", "start_date");

-- CreateIndex
CREATE INDEX "leaves_user_id_idx" ON "leaves"("user_id");

-- CreateIndex
CREATE INDEX "leaves_lab_id_source_key_idx" ON "leaves"("lab_id", "source_key");

-- CreateIndex
CREATE INDEX "memberships_lab_id_idx" ON "memberships"("lab_id");

-- CreateIndex
CREATE INDEX "menu_permissions_user_id_idx" ON "menu_permissions"("user_id");

-- CreateIndex
CREATE INDEX "milestones_project_id_due_date_idx" ON "milestones"("project_id", "due_date");

-- CreateIndex
CREATE INDEX "milestones_project_id_source_key_idx" ON "milestones"("project_id", "source_key");

-- CreateIndex
CREATE INDEX "patents_lab_id_date_idx" ON "patents"("lab_id", "date");

-- CreateIndex
CREATE INDEX "patents_project_id_idx" ON "patents"("project_id");

-- CreateIndex
CREATE INDEX "patents_lab_id_source_key_idx" ON "patents"("lab_id", "source_key");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE INDEX "project_members_project_id_source_key_idx" ON "project_members"("project_id", "source_key");

-- CreateIndex
CREATE INDEX "projects_lab_id_status_idx" ON "projects"("lab_id", "status");

-- CreateIndex
CREATE INDEX "projects_pi_id_idx" ON "projects"("pi_id");

-- CreateIndex
CREATE INDEX "publications_lab_id_year_idx" ON "publications"("lab_id", "year");

-- CreateIndex
CREATE INDEX "publications_project_id_idx" ON "publications"("project_id");

-- CreateIndex
CREATE INDEX "publications_lab_id_source_key_idx" ON "publications"("lab_id", "source_key");

-- CreateIndex
CREATE INDEX "purchases_lab_id_order_date_idx" ON "purchases"("lab_id", "order_date");

-- CreateIndex
CREATE INDEX "purchases_project_id_idx" ON "purchases"("project_id");

-- CreateIndex
CREATE INDEX "purchases_requester_id_idx" ON "purchases"("requester_id");

-- CreateIndex
CREATE INDEX "purchases_lab_id_source_key_idx" ON "purchases"("lab_id", "source_key");

-- CreateIndex
CREATE INDEX "research_projects_lab_id_start_date_idx" ON "research_projects"("lab_id", "start_date");

-- CreateIndex
CREATE INDEX "research_projects_leader_id_idx" ON "research_projects"("leader_id");

-- CreateIndex
CREATE INDEX "research_projects_project_id_idx" ON "research_projects"("project_id");

-- CreateIndex
CREATE INDEX "samples_lab_id_received_date_idx" ON "samples"("lab_id", "received_date");

-- CreateIndex
CREATE INDEX "samples_project_id_idx" ON "samples"("project_id");

-- CreateIndex
CREATE INDEX "samples_owner_id_idx" ON "samples"("owner_id");

-- CreateIndex
CREATE INDEX "tech_transfers_lab_id_contract_date_idx" ON "tech_transfers"("lab_id", "contract_date");

-- CreateIndex
CREATE INDEX "tech_transfers_project_id_idx" ON "tech_transfers"("project_id");

-- CreateIndex
CREATE INDEX "tech_transfers_lab_id_source_key_idx" ON "tech_transfers"("lab_id", "source_key");
