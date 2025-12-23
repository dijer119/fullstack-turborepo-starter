import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStock() {
  try {
    const stock = await prisma.stock.findUnique({
      where: { code: '121440' }
    });

    if (stock) {
      console.log('종목 121440 데이터:');
      console.log('ID:', stock.id);
      console.log('이름:', stock.name);
      console.log('시장:', stock.market);
      console.log('EPS:', stock.eps?.toString());
      console.log('BPS:', stock.bps?.toString());
      console.log('종가:', stock.close?.toString());
      console.log('ROE:', stock.roe?.toString());
      console.log('PER:', stock.per?.toString());
      console.log('PBR:', stock.pbr?.toString());
      console.log('10년가치:', stock.tenYearValue?.toString());
      console.log('10년승수:', stock.tenYearMultiple?.toString());
      console.log('주식가치:', stock.stockValue?.toString());
      console.log('업데이트일:', stock.updatedAt);
    } else {
      console.log('종목 121440이 없습니다.');
    }
  } catch (error) {
    console.error('에러:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStock();