import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addCalculatedColumns() {
  try {
    // First, try to add the columns if they don't exist
    console.log('📊 Adding calculated value columns to stocks table...');

    try {
      await prisma.$executeRaw`
        ALTER TABLE stocks
        ADD COLUMN IF NOT EXISTS ten_year_value DECIMAL(15,2),
        ADD COLUMN IF NOT EXISTS ten_year_multiple DECIMAL(10,4),
        ADD COLUMN IF NOT EXISTS stock_value DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS roe DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS per DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS pbr DECIMAL(10,2)
      `;
      console.log('✅ Columns added successfully (or already exist)');
    } catch (error) {
      console.log('⚠️  Could not add columns (they may already exist):', error instanceof Error ? error.message : String(error));
    }

    // Now update all stocks with EPS and BPS to calculate the values
    console.log('\n📈 Calculating values for stocks with EPS and BPS data...');

    const stocks = await prisma.stock.findMany({
      where: {
        AND: [
          { eps: { not: null } },
          { bps: { not: null } },
          { close: { gt: 0 } }
        ]
      },
      select: {
        id: true,
        code: true,
        name: true,
        close: true,
        eps: true,
        bps: true
      }
    });

    console.log(`Found ${stocks.length} stocks with EPS and BPS data`);

    let updated = 0;
    let failed = 0;

    for (const stock of stocks) {
      try {
        const eps = parseFloat(stock.eps.toString());
        const bps = parseFloat(stock.bps.toString());
        const currentPrice = parseFloat(stock.close.toString());

        // Skip if BPS is zero or negative
        if (bps <= 0) {
          console.log(`⚠️  Skipping ${stock.code} ${stock.name}: BPS is ${bps}`);
          continue;
        }

        // Calculate ROE = EPS / BPS * 100 (자기자본이익률 %)
        const roe = (eps / bps) * 100;

        // Calculate 10년가치 = BPS*(1+(EPS/BPS))^10
        const growthRate = 1 + (eps / bps);
        let tenYearValue = bps * Math.pow(growthRate, 10);

        // Handle edge cases
        if (!isFinite(tenYearValue) || tenYearValue < 0) {
          console.log(`⚠️  Skipping ${stock.code} ${stock.name}: Invalid calculation result`);
          continue;
        }

        // Calculate 10년승수 = ten_year_value / 현재가
        const tenYearMultiple = tenYearValue / currentPrice;

        // Calculate 주식가치 = (10^(LOG10(ten_year_multiple)/10)-1)*100
        let stockValue = null;
        if (tenYearMultiple > 0) {
          stockValue = (Math.pow(10, Math.log10(tenYearMultiple) / 10) - 1) * 100;
        }

        // Calculate PER = 현재가 / EPS (주가수익비율)
        let per = null;
        if (eps > 0) {
          per = currentPrice / eps;
        }

        // Calculate PBR = 현재가 / BPS (주가순자산비율)
        const pbr = currentPrice / bps;

        // Update the stock with calculated values
        await prisma.stock.update({
          where: { id: stock.id },
          data: {
            tenYearValue: tenYearValue,
            tenYearMultiple: tenYearMultiple,
            stockValue: stockValue,
            roe: roe,
            per: per,
            pbr: pbr
          }
        });

        updated++;
        console.log(`✅ Updated ${stock.code} ${stock.name}: 10년가치=${tenYearValue.toFixed(2)}, 10년승수=${tenYearMultiple.toFixed(4)}, 주식가치=${stockValue?.toFixed(2) || 'N/A'}%, ROE=${roe.toFixed(2)}, PER=${per?.toFixed(2) || 'N/A'}, PBR=${pbr.toFixed(2)}`);
      } catch (error) {
        failed++;
        console.error(`❌ Failed to update ${stock.code} ${stock.name}:`, error instanceof Error ? error.message : String(error));
      }
    }

    console.log(`\n📊 Update Summary:`);
    console.log(`   - Total stocks processed: ${stocks.length}`);
    console.log(`   - Successfully updated: ${updated}`);
    console.log(`   - Failed: ${failed}`);
    console.log(`   - Skipped: ${stocks.length - updated - failed}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addCalculatedColumns();