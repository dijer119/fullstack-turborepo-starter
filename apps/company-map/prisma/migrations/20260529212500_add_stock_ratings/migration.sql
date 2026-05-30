-- CreateTable
CREATE TABLE "stock_ratings" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "grade" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "stock_ratings_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "stock_ratings_grade_idx" ON "stock_ratings"("grade");
