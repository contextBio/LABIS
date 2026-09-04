-- CreateTable
CREATE TABLE "publications" (
    "id" SERIAL NOT NULL,
    "lab_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "journal" TEXT NOT NULL DEFAULT '',
    "year" TEXT NOT NULL DEFAULT '',
    "authors" TEXT NOT NULL DEFAULT '',
    "doi" TEXT NOT NULL DEFAULT '',
    "project_id" INTEGER,
    "memo" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patents" (
    "id" SERIAL NOT NULL,
    "lab_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "application_no" TEXT NOT NULL DEFAULT '',
    "registration_no" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '출원',
    "date" TEXT NOT NULL DEFAULT '',
    "inventors" TEXT NOT NULL DEFAULT '',
    "project_id" INTEGER,
    "memo" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "patents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tech_transfers" (
    "id" SERIAL NOT NULL,
    "lab_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "licensee" TEXT NOT NULL DEFAULT '',
    "contract_date" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "project_id" INTEGER,
    "memo" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "tech_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" SERIAL NOT NULL,
    "lab_id" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '재료비',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "order_date" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '신청',
    "requester_id" TEXT,
    "project_id" INTEGER,
    "memo" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_incomes" (
    "id" SERIAL NOT NULL,
    "lab_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "date" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "fund_incomes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patents" ADD CONSTRAINT "patents_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patents" ADD CONSTRAINT "patents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_transfers" ADD CONSTRAINT "tech_transfers_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_transfers" ADD CONSTRAINT "tech_transfers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_incomes" ADD CONSTRAINT "fund_incomes_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_incomes" ADD CONSTRAINT "fund_incomes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
