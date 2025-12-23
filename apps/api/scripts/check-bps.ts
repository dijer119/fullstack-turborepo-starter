import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBPS() {
  try {
    // BPS가 null이 아닌 데이터 수 확인
    const withBPS = await prisma.stock.count({
      where: {
        bps: {
          not: null
        }
      }
    });

    // BPS가 null인 데이터 수 확인
    const withoutBPS = await prisma.stock.count({
      where: {
        bps: null
      }
    });

    // 전체 수
    const total = await prisma.stock.count();

    console.log('📊 BPS 데이터 현황:');
    console.log(`   - 전체 종목: ${total}개`);
    console.log(`   - BPS 있음: ${withBPS}개 (${(withBPS / total * 100).toFixed(1)}%)`);
    console.log(`   - BPS 없음: ${withoutBPS}개 (${(withoutBPS / total * 100).toFixed(1)}%)`);

    // 샘플 데이터 몇 개 출력
    const samples = await prisma.stock.findMany({
      where: {
        bps: {
          not: null
        }
      },
      take: 5,
      select: {
        code: true,
        name: true,
        eps: true,
        bps: true
      }
    });

    if (samples.length > 0) {
      console.log('\n📋 BPS가 있는 종목 샘플:');
      samples.forEach((stock) => {
        console.log(`   - ${stock.code} ${stock.name}: EPS=${stock.eps}, BPS=${stock.bps}`);
      });
    } else {
      console.log('\n⚠️  BPS 데이터가 있는 종목이 없습니다.');
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBPS();