/**
 * 전체 종목 안전마진 계산 스크립트
 * 실행: cd apps/api && npx ts-node scripts/generate-safety-margins.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface SafetyMarginResult {
  code: string;
  name: string;
  current_price: number | null;
  intrinsic_value: number | null;
  safety_margin: number | null;
  treasury_ratio: number;
  dividend_yield: number | null;
  last_updated: string;
}

interface KrxStock {
  Code: string;
  Name: string;
  Market: string;
  Close: string;
}

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

function parseNumber(value: string): number {
  if (!value || value === '-' || value === 'N/A') return 0;
  const num = parseInt(value.replace(/,/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

async function getFinancialData(stockCode: string): Promise<{
  eps: number[];
  bps: number;
  treasuryRatio: number;
  dividendYield: number | null;
} | null> {
  try {
    // 투자지표 페이지에서 EPS, BPS 조회
    const investUrl = `https://navercomp.wisereport.co.kr/v2/company/c1030001.aspx?cmp_cd=${stockCode}`;
    const investResponse = await fetch(investUrl, { headers: defaultHeaders });
    
    if (!investResponse.ok) return null;
    
    const investHtml = await investResponse.text();
    const cleanInvestHtml = investHtml.replace(/&nbsp;/g, '').replace(/,/g, '');

    // EPS 추출 (투자지표 페이지에서 직접)
    const eps: number[] = [];
    const epsMatch = investHtml.match(/EPS[\s\S]{0,50}?>([\d,]+)</);
    if (epsMatch) {
      eps.push(parseNumber(epsMatch[1]));
    }

    // BPS 추출
    let bps = 0;
    const bpsMatch = investHtml.match(/BPS[\s\S]{0,50}?>([\d,]+)</);
    if (bpsMatch) {
      bps = parseNumber(bpsMatch[1]);
    }

    // 배당수익률 추출
    let dividendYield: number | null = null;
    const divMatch = investHtml.match(/현금배당수익률[\s\S]{0,50}?>([\d.]+)%/);
    if (divMatch) {
      dividendYield = parseFloat(divMatch[1]) || null;
    }

    // 기업개요 페이지에서 자사주 비율 조회
    let treasuryRatio = 0;
    try {
      const compUrl = `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${stockCode}`;
      const compResponse = await fetch(compUrl, { headers: defaultHeaders });
      
      if (compResponse.ok) {
        const compHtml = await compResponse.text();
        const cleanCompHtml = compHtml.replace(/&nbsp;/g, '');
        
        const treasuryMatch = cleanCompHtml.match(/자사주[\s\S]*?<td[^>]*>\s*([\d,]+)\s*<\/td>[\s\S]*?<td[^>]*>\s*([\d.]+)\s*<\/td>/);
        if (treasuryMatch) {
          treasuryRatio = parseFloat(treasuryMatch[2]) || 0;
        }
      }
    } catch {
      // 자사주 비율 조회 실패 시 0 유지
    }

    return { eps, bps, treasuryRatio, dividendYield };
  } catch {
    return null;
  }
}

async function calculateSingleStock(stock: KrxStock): Promise<SafetyMarginResult> {
  const now = new Date().toISOString();
  const result: SafetyMarginResult = {
    code: stock.Code,
    name: stock.Name,
    current_price: null,
    intrinsic_value: null,
    safety_margin: null,
    treasury_ratio: 0,
    dividend_yield: null,
    last_updated: now,
  };

  try {
    // 1. 현재가
    const currentPrice = parseInt(stock.Close, 10);
    if (isNaN(currentPrice) || currentPrice <= 0) {
      return result;
    }
    result.current_price = currentPrice;

    // 2. 재무 데이터 조회
    const financialData = await getFinancialData(stock.Code);
    if (!financialData) {
      return result;
    }

    const { eps, bps, treasuryRatio, dividendYield } = financialData;
    result.treasury_ratio = treasuryRatio;
    result.dividend_yield = dividendYield;

    // 3. 내재가치 계산
    if (eps.length === 0 || bps <= 0) {
      return result;
    }

    // EPS 가중평균 계산
    let weightedEps: number;
    if (eps.length >= 3) {
      weightedEps = (eps[0] * 3 + eps[1] * 2 + eps[2] * 1) / 6;
    } else if (eps.length === 2) {
      weightedEps = (eps[0] * 3 + eps[1] * 2) / 5;
    } else {
      weightedEps = eps[0];
    }

    // 기본 내재가치 = (EPS 가중평균 × 10 + BPS) ÷ 2
    const basicIntrinsicValue = (weightedEps * 10 + bps) / 2;
    
    // 자기주식 조정
    const adjustedIntrinsicValue = treasuryRatio > 0 
      ? basicIntrinsicValue * (100 / (100 - treasuryRatio))
      : basicIntrinsicValue;

    result.intrinsic_value = Math.round(adjustedIntrinsicValue * 100) / 100;

    // 4. 안전마진 계산
    const safetyMargin = ((adjustedIntrinsicValue - currentPrice) / currentPrice) * 100;
    result.safety_margin = Math.round(safetyMargin * 100) / 100;

  } catch {
    // 에러 발생 시 기본값 반환
  }

  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 전체 종목 안전마진 계산 시작\n');

  // KRX 종목 목록 로드
  const krxDataPath = path.join(__dirname, '..', 'data', 'krx_stocks.json');
  
  if (!fs.existsSync(krxDataPath)) {
    console.error(`❌ KRX 데이터 파일이 없습니다: ${krxDataPath}`);
    console.log('먼저 yarn krx:update를 실행하세요.');
    return;
  }

  const stocks: KrxStock[] = JSON.parse(fs.readFileSync(krxDataPath, 'utf-8'));
  console.log(`📊 총 ${stocks.length}개 종목 계산 예정\n`);

  const results: SafetyMarginResult[] = [];
  const batchSize = 10;
  const delayMs = 500;
  const startTime = Date.now();

  for (let i = 0; i < stocks.length; i += batchSize) {
    const batch = stocks.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(stock => calculateSingleStock(stock))
    );
    results.push(...batchResults);
    
    // 진행률 출력
    const progress = Math.min(i + batchSize, stocks.length);
    const percent = Math.round(progress / stocks.length * 100);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const eta = Math.round(elapsed / progress * (stocks.length - progress));
    
    process.stdout.write(`\r   진행: ${progress}/${stocks.length} (${percent}%) - 경과: ${elapsed}s, 예상: ${eta}s`);
    
    if (i + batchSize < stocks.length) {
      await delay(delayMs);
    }
  }

  console.log('\n');

  // 안전마진 기준 정렬
  results.sort((a, b) => {
    if (a.safety_margin === null && b.safety_margin === null) return 0;
    if (a.safety_margin === null) return 1;
    if (b.safety_margin === null) return -1;
    return b.safety_margin - a.safety_margin;
  });

  // 결과 저장
  const resultPath = path.join(__dirname, '..', 'data', 'all_safety_margin_results.json');
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2), 'utf-8');

  // 요약 출력
  const validResults = results.filter(r => r.safety_margin !== null);
  const positiveMargin = validResults.filter(r => r.safety_margin! > 0);
  
  console.log('✅ 안전마진 계산 완료\n');
  console.log(`   📁 저장 위치: ${resultPath}`);
  console.log(`   📊 총 종목: ${results.length}개`);
  console.log(`   ✅ 계산 성공: ${validResults.length}개`);
  console.log(`   🟢 양수 안전마진: ${positiveMargin.length}개`);
  
  if (positiveMargin.length > 0) {
    console.log('\n📋 안전마진 상위 10개 종목:');
    positiveMargin.slice(0, 10).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.name} (${r.code})`);
      console.log(`      현재가: ${r.current_price?.toLocaleString()}원`);
      console.log(`      내재가치: ${r.intrinsic_value?.toLocaleString()}원`);
      console.log(`      안전마진: ${r.safety_margin?.toFixed(2)}%`);
      console.log(`      자사주: ${r.treasury_ratio}%, 배당: ${r.dividend_yield ?? 'N/A'}%`);
    });
  }
}

main().catch(console.error);

