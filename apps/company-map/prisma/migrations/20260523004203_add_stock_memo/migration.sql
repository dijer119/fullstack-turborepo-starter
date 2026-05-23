-- CreateTable
CREATE TABLE "stock_memos" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "stock_memos_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);
