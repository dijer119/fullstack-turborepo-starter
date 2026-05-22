-- CreateTable
CREATE TABLE "tags" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "stock_tags" (
    "stock_code" TEXT NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("stock_code", "tag_id"),
    CONSTRAINT "stock_tags_stock_code_fkey" FOREIGN KEY ("stock_code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "stock_tags_tag_id_idx" ON "stock_tags"("tag_id");
