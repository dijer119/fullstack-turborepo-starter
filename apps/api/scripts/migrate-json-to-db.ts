import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface KrxStockJson {
  Code: string;
  ISU_CD: string;
  Name: string;
  Market: string;
  Dept: string;
  Close: string;
  ChangeCode: string;
  Changes: number;
  ChagesRatio: number;
  Open: number;
  High: number;
  Low: number;
  Volume: number;
  Amount: number;
  Marcap: number;
  Stocks: number;
  TreasuryStocks: number;
  TreasuryRatio: number;
  MarketId: string;
  EPS: number | null;
}

async function migrateJsonToDatabase() {
  console.log('🚀 Starting migration from JSON to PostgreSQL...\n');

  // Read JSON file
  const jsonPath = path.join(__dirname, '../data/krx_stocks.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('❌ Error: krx_stocks.json file not found!');
    console.error(`   Expected path: ${jsonPath}`);
    process.exit(1);
  }

  const jsonData = fs.readFileSync(jsonPath, 'utf-8');
  const stocks: KrxStockJson[] = JSON.parse(jsonData);

  console.log(`📊 Found ${stocks.length} stocks in JSON file\n`);

  // Delete existing data
  console.log('🗑️  Clearing existing stock data...');
  const deleteResult = await prisma.stock.deleteMany();
  console.log(`   Deleted ${deleteResult.count} existing records\n`);

  // Batch size for bulk insert
  const BATCH_SIZE = 100;
  let totalInserted = 0;
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ code: string; error: string }> = [];

  console.log('💾 Inserting stocks into database...\n');

  // Process in batches
  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stocks.length / BATCH_SIZE);

    try {
      await prisma.stock.createMany({
        data: batch.map((stock) => ({
          code: stock.Code,
          isuCd: stock.ISU_CD,
          name: stock.Name,
          market: stock.Market,
          marketId: stock.MarketId,
          dept: stock.Dept || null,
          close: parseFloat(stock.Close.replace(/,/g, '')),
          changeCode: stock.ChangeCode,
          changes: stock.Changes,
          chagesRatio: stock.ChagesRatio,
          open: stock.Open,
          high: stock.High,
          low: stock.Low,
          volume: BigInt(stock.Volume),
          amount: BigInt(stock.Amount),
          marcap: BigInt(stock.Marcap),
          stocks: BigInt(stock.Stocks),
          treasuryStocks: BigInt(stock.TreasuryStocks),
          treasuryRatio: stock.TreasuryRatio,
          eps: stock.EPS,
        })),
        skipDuplicates: true,
      });

      totalInserted += batch.length;
      successCount += batch.length;

      // Progress indicator
      const progress = ((i + batch.length) / stocks.length * 100).toFixed(1);
      console.log(`   Batch ${batchNumber}/${totalBatches} - ${progress}% complete (${totalInserted}/${stocks.length} stocks)`);

    } catch (error) {
      errorCount += batch.length;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ Error in batch ${batchNumber}:`, errorMessage);

      // Try inserting individually to identify problematic records
      for (const stock of batch) {
        try {
          await prisma.stock.create({
            data: {
              code: stock.Code,
              isuCd: stock.ISU_CD,
              name: stock.Name,
              market: stock.Market,
              marketId: stock.MarketId,
              dept: stock.Dept || null,
              close: parseFloat(stock.Close.replace(/,/g, '')),
              changeCode: stock.ChangeCode,
              changes: stock.Changes,
              chagesRatio: stock.ChagesRatio,
              open: stock.Open,
              high: stock.High,
              low: stock.Low,
              volume: BigInt(stock.Volume),
              amount: BigInt(stock.Amount),
              marcap: BigInt(stock.Marcap),
              stocks: BigInt(stock.Stocks),
              treasuryStocks: BigInt(stock.TreasuryStocks),
              treasuryRatio: stock.TreasuryRatio,
              eps: stock.EPS,
            },
          });
          successCount++;
          errorCount--;
        } catch (individualError) {
          const errorMsg = individualError instanceof Error ? individualError.message : String(individualError);
          errors.push({
            code: stock.Code,
            error: errorMsg,
          });
        }
      }
    }
  }

  console.log('\n✅ Migration completed!\n');
  console.log('📈 Summary:');
  console.log(`   Total stocks processed: ${stocks.length}`);
  console.log(`   Successfully inserted: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log('\n❌ Failed stocks:');
    errors.forEach((err, idx) => {
      console.log(`   ${idx + 1}. Code: ${err.code} - Error: ${err.error}`);
    });
  }

  // Verify data
  console.log('\n🔍 Verifying data...');
  const dbCount = await prisma.stock.count();
  console.log(`   Database contains ${dbCount} stocks`);

  if (dbCount === stocks.length) {
    console.log('   ✅ Data verification successful!');
  } else {
    console.log(`   ⚠️  Warning: Expected ${stocks.length} stocks, found ${dbCount} in database`);
  }

  // Sample data check
  console.log('\n📋 Sample records:');
  const samples = await prisma.stock.findMany({
    take: 3,
    orderBy: { name: 'asc' },
  });

  samples.forEach((stock, idx) => {
    console.log(`   ${idx + 1}. ${stock.name} (${stock.code}) - ${stock.market} - Close: ${stock.close}`);
  });
}

async function main() {
  try {
    await migrateJsonToDatabase();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
