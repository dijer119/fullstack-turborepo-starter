import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function testStock121440() {
  try {
    console.log('=== 121440 종목 테스트 시작 ===\n');

    // 1. 데이터베이스에서 종목 확인
    const dbStock = await prisma.stock.findUnique({
      where: { code: '121440' }
    });

    if (dbStock) {
      console.log('1. DB 종목 정보:');
      console.log('   - 코드:', dbStock.code);
      console.log('   - 이름:', dbStock.name);
      console.log('   - 시장:', dbStock.market);
      console.log('   - 종가:', dbStock.close?.toString());
      console.log('   - EPS:', dbStock.eps?.toString());
      console.log('   - BPS:', dbStock.bps?.toString());
      console.log('   - ROE:', dbStock.roe?.toString());
      console.log('   - PER:', dbStock.per?.toString());
      console.log('   - PBR:', dbStock.pbr?.toString());
      console.log('');
    }

    // 2. krx_stocks.json 파일에서 종목 확인
    const dataPath = path.join(__dirname, '../data/krx_stocks.json');
    if (fs.existsSync(dataPath)) {
      const jsonData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const jsonStock = jsonData.find((s: any) => s.Code === '121440');

      if (jsonStock) {
        console.log('2. JSON 파일 종목 정보:');
        console.log('   - 코드:', jsonStock.Code);
        console.log('   - 이름:', jsonStock.Name);
        console.log('   - 시장:', jsonStock.Market);
        console.log('   - 종가:', jsonStock.Close);
        console.log('   - EPS:', jsonStock.EPS || '없음');
        console.log('   - BPS:', jsonStock.BPS || '없음');
        console.log('');
      }
    }

    // 3. upsert 시뮬레이션
    console.log('3. Upsert 시뮬레이션:');
    const testData = {
      isuCd: 'KR7121440002',
      name: '골프존홀딩스',
      market: 'KOSDAQ',
      marketId: 'KSQ',
      dept: 'KOSDAQ',
      close: 5500,
      changeCode: '1',
      changes: 130,
      chagesRatio: 2.42,
      open: 5370,
      high: 5600,
      low: 5370,
      volume: BigInt(100466),
      amount: BigInt(553720895),
      marcap: BigInt(235602499000),
      stocks: BigInt(42836818),
      treasuryStocks: BigInt(0),
      treasuryRatio: 0,
      dataDate: new Date(),
    };

    try {
      await prisma.stock.upsert({
        where: { code: '121440' },
        update: testData,
        create: {
          code: '121440',
          ...testData,
        },
      });
      console.log('   ✅ Upsert 성공');
    } catch (error) {
      console.log('   ❌ Upsert 실패:');
      if (error instanceof Error) {
        console.log('      에러 메시지:', error.message);
        console.log('      에러 타입:', error.name);
        if (error.stack) {
          console.log('      스택:', error.stack.split('\n')[0]);
        }
      }
      console.log('      전체 에러:', error);
    }

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testStock121440();