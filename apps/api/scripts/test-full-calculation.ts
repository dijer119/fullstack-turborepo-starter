/**
 * 내재가치 전체 계산 테스트
 * 실행: cd apps/api && npx ts-node scripts/test-full-calculation.ts
 */

import * as iconv from 'iconv-lite';

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Connection': 'keep-alive',
};

async function fetchWithEucKr(url: string): Promise<string> {
  const response = await fetch(url, { headers: defaultHeaders });
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return iconv.decode(buffer, 'euc-kr');
}

function parseNumber(value: string): number {
  if (!value || value === '-' || value === 'N/A') return 0;
  const num = parseInt(value.replace(/,/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

async function getTreasuryStockRatio(stockCode: string): Promise<number> {
  try {
    const url = `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${stockCode}`;
    const response = await fetch(url, { headers: defaultHeaders });
    if (!response.ok) return 0;
    
    const html = await response.text();
    const cleanHtml = html.replace(/&nbsp;/g, '');
    
    // 자사주 행에서 직접 비율 추출
    const treasuryMatch = cleanHtml.match(/자사주[\s\S]*?<td[^>]*>\s*([\d,]+)\s*<\/td>[\s\S]*?<td[^>]*>\s*([\d.]+)\s*<\/td>/);
    
    if (treasuryMatch) {
      return parseFloat(treasuryMatch[2]);
    }
    return 0;
  } catch {
    return 0;
  }
}

async function getStockData(stockCode: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`종목 코드: ${stockCode}`);
  console.log('='.repeat(60));

  // 1. 현재가 조회
  const siseUrl = `https://finance.naver.com/item/sise.naver?code=${stockCode}`;
  const siseHtml = await fetchWithEucKr(siseUrl);
  
  const priceMatch = siseHtml.match(/id="_nowVal"[^>]*>([^<]+)</);
  const nameMatch = siseHtml.match(/<title>([^:]+)/);
  
  const currentPrice = priceMatch ? parseNumber(priceMatch[1]) : 0;
  const stockName = nameMatch ? nameMatch[1].trim() : stockCode;
  
  console.log(`📊 종목명: ${stockName}`);
  console.log(`💰 현재가: ${currentPrice.toLocaleString()}원`);

  // 2. EPS/BPS 조회
  const mainUrl = `https://finance.naver.com/item/main.naver?code=${stockCode}`;
  const mainHtml = await fetchWithEucKr(mainUrl);
  
  // 현재 EPS
  const epsMatch = mainHtml.match(/id="_eps"[^>]*>([^<]+)</);
  const currentEps = epsMatch ? parseNumber(epsMatch[1]) : 0;
  
  // 추정 EPS
  const cnsEpsMatch = mainHtml.match(/id="_cns_eps"[^>]*>([^<]+)</);
  const cnsEps = cnsEpsMatch ? parseNumber(cnsEpsMatch[1]) : currentEps;
  
  // 현재 BPS - PBR|BPS 행에서 마지막 em 태그
  let currentBps = 0;
  const pbrBpsRow = mainHtml.match(/PBR<span class="bar">[|l]<\/span>BPS[\s\S]*?<\/tr>/);
  if (pbrBpsRow) {
    const allEmTags = pbrBpsRow[0].match(/<em[^>]*>[\s\S]*?<\/em>/g);
    if (allEmTags) {
      for (let i = allEmTags.length - 1; i >= 0; i--) {
        const numMatch = allEmTags[i].match(/>([0-9,]+)</);
        if (numMatch) {
          currentBps = parseNumber(numMatch[1]);
          break;
        }
      }
    }
  }
  
  console.log(`\n📈 재무지표:`);
  console.log(`   현재 EPS: ${currentEps.toLocaleString()}원`);
  console.log(`   추정 EPS: ${cnsEps.toLocaleString()}원`);
  console.log(`   현재 BPS: ${currentBps.toLocaleString()}원`);

  // 3. 내재가치 계산
  // EPS 가중평균 = (최근년도 EPS × 3 + 전년도 EPS × 2 + 전전년도 EPS × 1) ÷ 6
  // 간단히 현재 EPS와 추정 EPS를 사용
  const weightedEps = (cnsEps * 3 + currentEps * 2 + currentEps * 1) / 6;
  
  // 기본 내재가치 = (EPS 가중평균 × 10 + 최근 BPS) ÷ 2
  const basicIntrinsicValue = (weightedEps * 10 + currentBps) / 2;
  
  // 자기주식 비율 조회
  const treasuryStockRatio = await getTreasuryStockRatio(stockCode);
  const adjustedIntrinsicValue = basicIntrinsicValue * (100 / (100 - treasuryStockRatio));
  
  console.log(`\n📊 자기주식 비율: ${treasuryStockRatio}%`);
  
  // 안전마진 = ((내재가치 - 현재가) ÷ 현재가) × 100
  const safetyMargin = ((adjustedIntrinsicValue - currentPrice) / currentPrice) * 100;

  console.log(`\n💎 내재가치 계산:`);
  console.log(`   EPS 가중평균: ${Math.round(weightedEps).toLocaleString()}원`);
  console.log(`   기본 내재가치: ${Math.round(basicIntrinsicValue).toLocaleString()}원`);
  console.log(`   조정 내재가치: ${Math.round(adjustedIntrinsicValue).toLocaleString()}원`);
  console.log(`\n🎯 안전마진: ${safetyMargin.toFixed(2)}%`);
  
  // 투자 의견
  let recommendation = '';
  if (safetyMargin >= 50) recommendation = '🟢 매우 저평가 - 적극 매수 고려';
  else if (safetyMargin >= 30) recommendation = '🟢 저평가 - 매수 고려';
  else if (safetyMargin >= 10) recommendation = '🟡 약간 저평가 - 관심 종목';
  else if (safetyMargin >= -10) recommendation = '🟡 적정 가치 근접';
  else if (safetyMargin >= -30) recommendation = '🟠 약간 고평가 - 신중한 접근 필요';
  else recommendation = '🔴 고평가 - 매수 비추천';
  
  console.log(`📝 투자 의견: ${recommendation}`);

  return {
    stockCode,
    stockName,
    currentPrice,
    currentEps,
    cnsEps,
    currentBps,
    weightedEps: Math.round(weightedEps),
    basicIntrinsicValue: Math.round(basicIntrinsicValue),
    adjustedIntrinsicValue: Math.round(adjustedIntrinsicValue),
    safetyMargin: Math.round(safetyMargin * 100) / 100,
    recommendation,
  };
}

async function main() {
  console.log('🚀 내재가치 전체 계산 테스트\n');

  const testStocks = [
    '005930', // 삼성전자
    '000660', // SK하이닉스
    '035420', // NAVER
  ];

  for (const code of testStocks) {
    try {
      await getStockData(code);
    } catch (e) {
      console.log(`❌ ${code} 조회 실패: ${e}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(console.error);

