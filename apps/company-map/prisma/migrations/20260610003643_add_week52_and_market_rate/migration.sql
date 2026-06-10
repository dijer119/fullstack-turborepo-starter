-- CreateTable
CREATE TABLE "week52_prices" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "as_of_date" DATETIME NOT NULL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "week52_prices_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "market_rates" (
    "kind" TEXT NOT NULL PRIMARY KEY,
    "rate_pct" REAL NOT NULL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
