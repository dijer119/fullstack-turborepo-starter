-- CreateTable
CREATE TABLE "stock_overrides" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "manual_roe" REAL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "stock_overrides_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);
