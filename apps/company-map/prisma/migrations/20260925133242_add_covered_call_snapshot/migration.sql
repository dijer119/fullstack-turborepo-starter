-- CreateTable
CREATE TABLE "covered_call_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payload" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);
