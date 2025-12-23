/**
 * KRX 종목 목록 생성 스크립트
 * 한국거래소에서 KOSPI/KOSDAQ 종목 목록을 가져와서 DB에 저장
 *
 * 실행: cd apps/api && npx ts-node scripts/generate-krx-stocks.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';

const prisma = new PrismaClient();

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Connection': 'keep-alive',
  'Referer': 'http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020101',
};

interface KrxStock {
  Code: string;           // 종목코드
  ISU_CD: string;         // ISIN 코드
  Name: string;           // 종목명
  Market: string;         // 시장구분 (KOSPI/KOSDAQ)
  Dept: string;           // 부서
  Close: string;          // 종가
  ChangeCode: string;     // 변동 코드 (1: 상승, 2: 하락, 3: 보합)
  Changes: number;        // 전일대비
  ChagesRatio: number;    // 등락률
  Open: number;           // 시가
  High: number;           // 고가
  Low: number;            // 저가
  Volume: number;         // 거래량
  Amount: number;         // 거래대금
  Marcap: number;         // 시가총액
  Stocks: number;         // 상장주식수
  TreasuryStocks: number; // 자기주식수
  TreasuryRatio: number;  // 자기주식비율 (%)
  MarketId: string;       // 시장 ID (STK/KSQ)
  EPS: number | null;     // 주당순이익 (Earnings Per Share)
}

/**
 * 숫자 문자열 파싱 (콤마 제거)
 */
function parseNumber(value: string): number {
  if (!value || value === '-') return 0;
  return parseFloat(value.replace(/,/g, '')) || 0;
}

/**
 * KRX에서 종목 목록 가져오기 (시가총액 기준)
 */
async function fetchKrxStocksByMarket(marketId: string, marketName: string): Promise<KrxStock[]> {
  console.log(`📊 ${marketName} 종목 목록 가져오는 중...`);
  
  const url = 'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
  
  // 전일 종가 기준 시가총액 API 사용
  const formData = new URLSearchParams({
    bld: 'dbms/MDC/STAT/standard/MDCSTAT01501',
    locale: 'ko_KR',
    mktId: marketId,
    trdDd: getLastBusinessDay(),
    share: '1',
    money: '1',
    csvxls_isNo: 'false',
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: defaultHeaders,
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`  - 응답 데이터: ${data.OutBlock_1?.length || 0}개 종목`);

    if (data.OutBlock_1) {
      return data.OutBlock_1.map((item: any) => ({
        Code: item.ISU_SRT_CD,
        ISU_CD: item.ISU_CD || '',
        Name: item.ISU_ABBRV,
        Market: marketName,
        Dept: item.MKT_NM || '',
        Close: item.TDD_CLSPRC?.replace(/,/g, '') || '0',
        ChangeCode: getChangeCode(item.CMPPREVDD_PRC),
        Changes: parseNumber(item.CMPPREVDD_PRC),
        ChagesRatio: parseNumber(item.FLUC_RT),
        Open: parseNumber(item.TDD_OPNPRC),
        High: parseNumber(item.TDD_HGPRC),
        Low: parseNumber(item.TDD_LWPRC),
        Volume: parseNumber(item.ACC_TRDVOL),
        Amount: parseNumber(item.ACC_TRDVAL),
        Marcap: parseNumber(item.MKTCAP),
        Stocks: parseNumber(item.LIST_SHRS),
        TreasuryStocks: 0,  // 나중에 업데이트
        TreasuryRatio: 0,   // 나중에 업데이트
        MarketId: marketId,
        EPS: null,          // 나중에 업데이트 (eps:fetch 사용)
      }));
    }
    return [];
  } catch (error) {
    console.error(`  ❌ ${marketName} 조회 실패:`, error);
    return [];
  }
}

/**
 * 변동 코드 계산 (1: 상승, 2: 하락, 3: 보합)
 */
function getChangeCode(changes: string): string {
  const num = parseNumber(changes);
  if (num > 0) return '1';
  if (num < 0) return '2';
  return '3';
}

/**
 * KRX에서 종목 목록 가져오기 (KOSPI)
 */
async function fetchKospiStocks(): Promise<KrxStock[]> {
  return fetchKrxStocksByMarket('STK', 'KOSPI');
}

/**
 * KRX에서 종목 목록 가져오기 (KOSDAQ)
 */
async function fetchKosdaqStocks(): Promise<KrxStock[]> {
  return fetchKrxStocksByMarket('KSQ', 'KOSDAQ');
}

/**
 * KRX에서 자기주식 현황 가져오기
 */
async function fetchTreasuryStocks(): Promise<Map<string, { shares: number; ratio: number }>> {
  console.log('📊 자기주식 현황 가져오는 중...');
  
  const treasuryMap = new Map<string, { shares: number; ratio: number }>();
  const url = 'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
  
  // 자기주식 취득/처분 현황 API (KOSPI + KOSDAQ)
  for (const mktId of ['STK', 'KSQ']) {
    const formData = new URLSearchParams({
      bld: 'dbms/MDC/STAT/standard/MDCSTAT03402',
      locale: 'ko_KR',
      mktId: mktId,
      strtDd: getStartDate(),  // 1년 전
      endDd: getLastBusinessDay(),
      csvxls_isNo: 'false',
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: defaultHeaders,
        body: formData.toString(),
      });

      if (!response.ok) {
        console.log(`  - 자기주식 API 응답 실패 (${mktId}): ${response.status}`);
        continue;
      }

      const data = await response.json();
      console.log(`  - 자기주식 데이터 (${mktId}): ${data.OutBlock_1?.length || 0}개`);

      if (data.OutBlock_1) {
        for (const item of data.OutBlock_1) {
          const code = item.ISU_SRT_CD;
          const treasuryShares = parseNumber(item.TREAS_SHR || item.HOLD_QTY || item.ACQ_QTY || '0');
          const listedShares = parseNumber(item.LIST_SHRS || '1');
          const ratio = listedShares > 0 ? (treasuryShares / listedShares) * 100 : 0;
          
          if (treasuryShares > 0) {
            treasuryMap.set(code, {
              shares: treasuryShares,
              ratio: Math.round(ratio * 100) / 100,
            });
          }
        }
      }
    } catch (error) {
      console.error(`  ❌ 자기주식 조회 실패 (${mktId}):`, error);
    }
  }

  console.log(`  - 자기주식 보유 종목: ${treasuryMap.size}개`);
  return treasuryMap;
}

/**
 * 1년 전 날짜 계산
 */
function getStartDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}${month}${day}`;
}

/**
 * 종목 목록에 자기주식 비율 업데이트
 */
function updateTreasuryRatios(
  stocks: KrxStock[],
  treasuryMap: Map<string, { shares: number; ratio: number }>
): void {
  let updatedCount = 0;
  
  for (const stock of stocks) {
    const treasury = treasuryMap.get(stock.Code);
    if (treasury) {
      stock.TreasuryStocks = treasury.shares;
      stock.TreasuryRatio = treasury.ratio;
      updatedCount++;
    }
  }
  
  console.log(`  - 자기주식 비율 업데이트: ${updatedCount}개 종목`);
}

/**
 * 네이버 금융에서 종목 목록 가져오기 (백업 방법)
 */
async function fetchNaverStocks(): Promise<KrxStock[]> {
  console.log('📊 네이버 금융에서 종목 목록 가져오는 중...');
  
  const stocks: KrxStock[] = [];
  
  // KOSPI 시가총액 상위 종목
  const kospiUrl = 'https://finance.naver.com/sise/sise_market_sum.naver?sosok=0';
  // KOSDAQ 시가총액 상위 종목
  const kosdaqUrl = 'https://finance.naver.com/sise/sise_market_sum.naver?sosok=1';
  
  for (const { url, market, marketId } of [
    { url: kospiUrl, market: 'KOSPI', marketId: 'STK' },
    { url: kosdaqUrl, market: 'KOSDAQ', marketId: 'KSQ' },
  ]) {
    try {
      // 여러 페이지 가져오기
      for (let page = 1; page <= 10; page++) {
        const pageUrl = `${url}&page=${page}`;
        const response = await fetch(pageUrl, { headers: defaultHeaders });
        
        if (!response.ok) continue;
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const html = iconv.decode(buffer, 'euc-kr');
        
        // 종목 링크 추출: <a href="/item/main.naver?code=005930">삼성전자</a>
        const stockMatches = html.match(/<a href="\/item\/main\.naver\?code=(\d{6})"[^>]*>([^<]+)<\/a>/g);
        
        if (stockMatches) {
          for (const match of stockMatches) {
            const codeMatch = match.match(/code=(\d{6})/);
            const nameMatch = match.match(/>([^<]+)</);
            
            if (codeMatch && nameMatch) {
              const code = codeMatch[1];
              const name = nameMatch[1].trim();
              
              // 중복 체크
              if (!stocks.find(s => s.Code === code) && name && !name.includes('토론')) {
                stocks.push({
                  Code: code,
                  ISU_CD: '',
                  Name: name,
                  Market: market,
                  Dept: '',
                  Close: '0',
                  ChangeCode: '3',
                  Changes: 0,
                  ChagesRatio: 0,
                  Open: 0,
                  High: 0,
                  Low: 0,
                  Volume: 0,
                  Amount: 0,
                  Marcap: 0,
                  Stocks: 0,
                  TreasuryStocks: 0,
                  TreasuryRatio: 0,
                  MarketId: marketId,
                  EPS: null,
                });
              }
            }
          }
        }
        
        await new Promise(r => setTimeout(r, 200)); // 요청 간격
      }
      
      console.log(`  - ${market}: ${stocks.filter(s => s.Market === market).length}개 종목`);
    } catch (error) {
      console.error(`  ❌ ${market} 조회 실패:`, error);
    }
  }
  
  return stocks;
}

/**
 * 마지막 영업일 계산 (어제 또는 금요일)
 */
function getLastBusinessDay(): string {
  const today = new Date();
  // 기본적으로 어제 날짜 사용
  today.setDate(today.getDate() - 1);
  
  const day = today.getDay();
  
  // 주말이면 금요일로
  if (day === 0) today.setDate(today.getDate() - 2); // 일요일 -> 금요일
  else if (day === 6) today.setDate(today.getDate() - 1); // 토요일 -> 금요일
  
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const date = String(today.getDate()).padStart(2, '0');
  
  return `${year}${month}${date}`;
}

/**
 * 메인 함수
 */
async function main() {
  console.log('🚀 KRX 종목 목록 생성 시작\n');
  console.log(`📅 기준일: ${getLastBusinessDay()}\n`);

  let allStocks: KrxStock[] = [];

  // 방법 1: KRX에서 직접 가져오기
  const kospiStocks = await fetchKospiStocks();
  const kosdaqStocks = await fetchKosdaqStocks();
  
  allStocks = [...kospiStocks, ...kosdaqStocks];
  
  // KRX에서 가져오지 못한 경우 네이버에서 가져오기
  if (allStocks.length < 100) {
    console.log('\n⚠️  KRX 데이터 부족, 네이버 금융에서 보완...');
    const naverStocks = await fetchNaverStocks();
    
    // 중복 제거하면서 병합
    for (const stock of naverStocks) {
      if (!allStocks.find(s => s.Code === stock.Code)) {
        allStocks.push(stock);
      }
    }
  }

  // 자기주식 비율 업데이트
  console.log('');
  const treasuryMap = await fetchTreasuryStocks();
  updateTreasuryRatios(allStocks, treasuryMap);

  console.log(`\n📊 총 ${allStocks.length}개 종목`);
  console.log(`  - KOSPI: ${allStocks.filter(s => s.Market === 'KOSPI').length}개`);
  console.log(`  - KOSDAQ: ${allStocks.filter(s => s.Market === 'KOSDAQ').length}개`);

  // 종목명 기준 정렬
  allStocks.sort((a, b) => a.Name.localeCompare(b.Name, 'ko'));

  // DB에 upsert (기존 데이터 업데이트 또는 신규 삽입)
  console.log(`\n💾 DB에 저장 중...`);
  let successCount = 0;
  let errorCount = 0;

  for (const stock of allStocks) {
    try {
      await prisma.stock.upsert({
        where: { code: stock.Code },
        update: {
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
          dataDate: new Date(),
        },
        create: {
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

      // 진행률 표시
      if (successCount % 100 === 0) {
        console.log(`  진행: ${successCount}/${allStocks.length} (${Math.round(successCount / allStocks.length * 100)}%)`);
      }
    } catch (error) {
      errorCount++;
      console.error(`  ❌ 오류 (${stock.Code} ${stock.Name}):`, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  console.log(`\n✅ DB 저장 완료`);
  console.log(`  - 성공: ${successCount}개`);
  console.log(`  - 실패: ${errorCount}개`);

  // 백업용 JSON 파일로도 저장
  const outputPath = path.join(__dirname, '..', 'data', 'krx_stocks.backup.json');
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(allStocks, null, 2), 'utf-8');
  console.log(`\n💾 백업 파일 저장: ${outputPath}`);

  // 샘플 출력 (자기주식 있는 종목 포함)
  console.log('\n📋 샘플 종목 (처음 5개):');
  allStocks.slice(0, 5).forEach((stock, i) => {
    console.log(`  ${i + 1}. ${stock.Name} (${stock.Code}) - ${stock.Market}`);
    console.log(`     종가: ${stock.Close}원, 변동: ${stock.Changes} (${stock.ChagesRatio}%)`);
    console.log(`     시가총액: ${(stock.Marcap / 100000000).toLocaleString()}억원`);
    console.log(`     자기주식: ${stock.TreasuryStocks.toLocaleString()}주 (${stock.TreasuryRatio}%)`);
  });

  // 자기주식 비율 높은 종목 출력
  const topTreasury = allStocks
    .filter(s => s.TreasuryRatio > 0)
    .sort((a, b) => b.TreasuryRatio - a.TreasuryRatio)
    .slice(0, 5);
  
  if (topTreasury.length > 0) {
    console.log('\n📋 자기주식 비율 상위 5개 종목:');
    topTreasury.forEach((stock, i) => {
      console.log(`  ${i + 1}. ${stock.Name} (${stock.Code}) - 자기주식 ${stock.TreasuryRatio}%`);
    });
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });

