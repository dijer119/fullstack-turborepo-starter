CREATE TABLE "stock_watch_groups" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "stock_watch_groups_name_key" ON "stock_watch_groups"("name");
CREATE TABLE "stock_watch_memberships" (
  "groupId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  PRIMARY KEY ("groupId", "symbol"),
  CONSTRAINT "stock_watch_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "stock_watch_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_watch_memberships_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "stock_watches"("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "stock_watch_memberships_symbol_idx" ON "stock_watch_memberships"("symbol");
CREATE TABLE "recent_stock_views" (
  "symbol" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "market" TEXT,
  "currency" TEXT,
  "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "recent_stock_views_viewedAt_idx" ON "recent_stock_views"("viewedAt");
