import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();

async function fetchDividendYield(code: string): Promise<number | null> {
  try {
    const response = await axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);

    // 배당수익률 찾기
    const dvrElement = $('#_dvr');
    if (dvrElement.length > 0) {
      const dvrValue = dvrElement.text().trim();
      const cleanDvrValue = dvrValue.replace(/[^0-9.-]/g, '');
      const parsedDvr = Number.parseFloat(cleanDvrValue);
      return isNaN(parsedDvr) ? null : parsedDvr;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching dividend yield for ${code}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function testDividendYield() {
  try {
    console.log('🎯 배당수익률 테스트 시작...\n');

    // 대표적인 고배당 종목들 테스트
    const testStocks = [
      { code: '005930', name: '삼성전자' },
      { code: '000660', name: 'SK하이닉스' },
      { code: '005380', name: '현대차' },
      { code: '035420', name: 'NAVER' },
      { code: '000270', name: '기아' },
      { code: '068270', name: '셀트리온' },
      { code: '105560', name: 'KB금융' },
      { code: '055550', name: '신한지주' },
      { code: '086790', name: '하나금융지주' },
      { code: '024110', name: '기업은행' },
    ];

    for (const stock of testStocks) {
      console.log(`📊 ${stock.name} (${stock.code}) 처리 중...`);

      // 배당수익률 가져오기
      const dividendYield = await fetchDividendYield(stock.code);

      if (dividendYield !== null) {
        // DB 업데이트
        await prisma.stock.updateMany({
          where: { code: stock.code },
          data: { dividendYield },
        });

        console.log(`   ✅ 배당수익률: ${dividendYield}%`);
      } else {
        console.log(`   ⚠️ 배당수익률 정보 없음`);
      }

      // API 부하 방지를 위한 딜레이
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n✅ 테스트 완료!');
    console.log('웹페이지(http://localhost:3000/stocks)에서 배당수익률 컬럼을 확인하세요.');

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDividendYield();