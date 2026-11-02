CREATE TABLE "split_buy_reservations" (
  "strategyId" TEXT NOT NULL PRIMARY KEY,
  "watchPrice" REAL NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "orderId" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "split_buy_reservations_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "split_live_strategies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "split_buy_reservations_status_expiresAt_idx" ON "split_buy_reservations"("status", "expiresAt");
CREATE TABLE "split_reservation_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "strategyId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "watchPrice" REAL NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "orderId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "split_reservation_events_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "split_buy_reservations" ("strategyId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "split_reservation_events_strategyId_createdAt_idx" ON "split_reservation_events"("strategyId", "createdAt");
