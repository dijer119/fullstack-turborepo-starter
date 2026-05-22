-- CreateTable
CREATE TABLE "refresh_states" (
    "kind" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL,
    "finished_at" DATETIME,
    "output" TEXT
);
