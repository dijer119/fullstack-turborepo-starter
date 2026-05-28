-- CreateTable
CREATE TABLE "stock_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "site_name" TEXT,
    "image_url" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'blog',
    "memo" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_links_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "stock_links_code_created_at_idx" ON "stock_links"("code", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_links_code_url_key" ON "stock_links"("code", "url");
