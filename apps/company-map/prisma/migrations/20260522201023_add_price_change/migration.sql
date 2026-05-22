-- CreateTable
CREATE TABLE "price_changes" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "current_price" REAL,
    "past_price" REAL,
    "past_date" DATETIME,
    "pct_change" REAL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_changes_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);
