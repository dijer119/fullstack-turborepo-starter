/**
 * KRX 종목 검색 테스트
 * 실행: cd apps/api && npx ts-node scripts/test-krx-search.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface KrxStock {
  code: string;
  name: string;
  market: string;
  sector?: string;
}

interface KrxStocksData {
  lastUpdated: string;
  totalCount: number;
  stocks: KrxStock[];
}

// KRX 종목 목록 로드
const filePath = path.join(__dirname, '..', 'data', 'krx_stocks.json');
const data = fs.readFileSync(filePath, 'utf-8');
const krxData: KrxStocksData = JSON.parse(data);
const krxStocks = krxData.stocks;

console.log(`📊 KRX 종목 목록 로드: ${krxStocks.length}개\n`);

// 검색 함수
function searchStock(keyword: string): KrxStock[] {
  const searchKeyword = keyword.trim().toLowerCase();
  
  if (!searchKeyword) return [];

  const results = krxStocks
    .filter(stock => 
      stock.name.toLowerCase().includes(searchKeyword) ||
      stock.code.includes(searchKeyword)
    )
    .slice(0, 20);

  // 정확히 일치하는 종목을 먼저 정렬
  results.sort((a, b) => {
    const aExact = a.name.toLowerCase() === searchKeyword;
    const bExact = b.name.toLowerCase() === searchKeyword;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    const aStarts = a.name.toLowerCase().startsWith(searchKeyword);
    const bStarts = b.name.toLowerCase().startsWith(searchKeyword);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    return a.name.localeCompare(b.name, 'ko');
  });

  return results.slice(0, 10);
}

// 테스트
const testKeywords = [
  '삼성전자',
  '삼성',
  '에코프로',
  '한화오션',
  '카카오',
  'SK',
  '005930',  // 종목코드로 검색
  '셀트리온',
  'LG',
  '현대',
];

console.log('🔍 종목 검색 테스트\n');

for (const keyword of testKeywords) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`검색어: "${keyword}"`);
  
  const results = searchStock(keyword);
  
  if (results.length > 0) {
    console.log(`✅ ${results.length}개 결과:`);
    results.slice(0, 5).forEach((stock, i) => {
      console.log(`   ${i + 1}. ${stock.name} (${stock.code}) - ${stock.market}`);
    });
    if (results.length > 5) {
      console.log(`   ... 외 ${results.length - 5}개`);
    }
  } else {
    console.log(`❌ 결과 없음`);
  }
  console.log('');
}


