-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maddingstock_messages" (
    "id" SERIAL NOT NULL,
    "message_id" BIGINT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "strategy" TEXT,
    "stock_name" TEXT,
    "trade_type" TEXT,
    "status" TEXT,
    "price" TEXT,
    "additional_info" TEXT,
    "profit_rate" TEXT,
    "change_percent" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "symbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message_date" TIMESTAMP(3) NOT NULL,
    "channel_username" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maddingstock_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "isu_cd" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "dept" TEXT,
    "close" DECIMAL(10,2) NOT NULL,
    "change_code" TEXT NOT NULL,
    "changes" DECIMAL(10,2) NOT NULL,
    "chages_ratio" DECIMAL(10,4) NOT NULL,
    "open" DECIMAL(10,2) NOT NULL,
    "high" DECIMAL(10,2) NOT NULL,
    "low" DECIMAL(10,2) NOT NULL,
    "volume" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "marcap" BIGINT NOT NULL,
    "stocks" BIGINT NOT NULL,
    "treasury_stocks" BIGINT NOT NULL,
    "treasury_ratio" DECIMAL(5,2) NOT NULL,
    "eps" DECIMAL(10,2),
    "bps" DECIMAL(10,2),
    "ten_year_value" DECIMAL(15,2),
    "ten_year_multiple" DECIMAL(10,4),
    "stock_value" DECIMAL(10,2),
    "roe" DECIMAL(10,2),
    "per" DECIMAL(10,2),
    "pbr" DECIMAL(10,2),
    "dividend_yield" DECIMAL(10,2),
    "exclude" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "data_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "maddingstock_messages_message_id_key" ON "maddingstock_messages"("message_id");

-- CreateIndex
CREATE INDEX "maddingstock_messages_message_date_idx" ON "maddingstock_messages"("message_date");

-- CreateIndex
CREATE INDEX "maddingstock_messages_stock_name_idx" ON "maddingstock_messages"("stock_name");

-- CreateIndex
CREATE INDEX "maddingstock_messages_channel_username_idx" ON "maddingstock_messages"("channel_username");

-- CreateIndex
CREATE INDEX "maddingstock_messages_trade_type_idx" ON "maddingstock_messages"("trade_type");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_code_key" ON "stocks"("code");

-- CreateIndex
CREATE INDEX "stocks_code_idx" ON "stocks"("code");

-- CreateIndex
CREATE INDEX "stocks_name_idx" ON "stocks"("name");

-- CreateIndex
CREATE INDEX "stocks_market_idx" ON "stocks"("market");

-- CreateIndex
CREATE INDEX "stocks_data_date_idx" ON "stocks"("data_date");

-- CreateIndex
CREATE INDEX "stocks_stock_value_idx" ON "stocks"("stock_value" DESC);

-- CreateIndex
CREATE INDEX "stocks_dividend_yield_idx" ON "stocks"("dividend_yield" DESC);

-- CreateIndex
CREATE INDEX "stocks_marcap_idx" ON "stocks"("marcap" DESC);

-- CreateIndex
CREATE INDEX "stocks_chages_ratio_idx" ON "stocks"("chages_ratio" DESC);

-- CreateIndex
CREATE INDEX "stocks_close_idx" ON "stocks"("close" DESC);

-- CreateIndex
CREATE INDEX "stocks_market_exclude_idx" ON "stocks"("market", "exclude");

-- CreateIndex
CREATE INDEX "stocks_favorite_idx" ON "stocks"("favorite");

-- CreateIndex
CREATE INDEX "stocks_exclude_idx" ON "stocks"("exclude");

-- CreateIndex
CREATE INDEX "stocks_roe_idx" ON "stocks"("roe");

-- CreateIndex
CREATE INDEX "stocks_tags_idx" ON "stocks"("tags");

