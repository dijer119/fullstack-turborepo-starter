import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCalculatedValues() {
  try {
    // Get a sample of stocks with calculated values
    const samples = await prisma.stock.findMany({
      where: {
        AND: [
          { eps: { not: null } },
          { bps: { not: null } },
          { tenYearValue: { not: null } }
        ]
      },
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: {
        code: true,
        name: true,
        close: true,
        eps: true,
        bps: true,
        tenYearValue: true,
        tenYearMultiple: true,
        stockValue: true
      }
    });

    console.log('📊 Sample of stocks with calculated values:\n');

    samples.forEach((stock) => {
      console.log(`${stock.code} - ${stock.name}`);
      console.log(`  현재가: ₩${stock.close}`);
      console.log(`  EPS: ${stock.eps}`);
      console.log(`  BPS: ${stock.bps}`);
      console.log(`  10년가치: ${stock.tenYearValue ? `₩${stock.tenYearValue}` : 'N/A'}`);
      console.log(`  10년승수: ${stock.tenYearMultiple ? stock.tenYearMultiple : 'N/A'}`);
      console.log(`  주식가치: ${stock.stockValue ? `${stock.stockValue}%` : 'N/A'}`);
      console.log('');
    });

    // Count statistics
    const totalStocks = await prisma.stock.count();
    const withCalculatedValues = await prisma.stock.count({
      where: {
        tenYearValue: { not: null }
      }
    });

    console.log('📈 Statistics:');
    console.log(`  Total stocks: ${totalStocks}`);
    console.log(`  Stocks with calculated values: ${withCalculatedValues}`);
    console.log(`  Percentage complete: ${(withCalculatedValues / totalStocks * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCalculatedValues();