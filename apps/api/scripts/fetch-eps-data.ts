import { PrismaClient } from '@prisma/client';
import axios from 'axios';

/**
 * OpenDart API를 사용하여 EPS(주당순이익) 데이터를 수집하여 DB에 저장하는 스크립트
 *
 * 필수 환경변수:
 * - DART_API_KEY: OpenDart API 키 (https://opendart.fss.or.kr/)
 *
 * OpenDart API 키 발급 방법:
 * 1. https://opendart.fss.or.kr/ 접속
 * 2. 회원가입 및 로그인
 * 3. 인증키 발급/관리 메뉴에서 API 키 발급
 */

const prisma = new PrismaClient();

interface Stock {
  Code: string;
  ISU_CD: string;
  Name: string;
  Market: string;
  Dept: string;
  Close: string;
  ChangeCode: string;
  Changes: number;
  ChagesRatio: number;
  Open: number;
  High: number;
  Low: number;
  Volume: number;
  Amount: number;
  Marcap: number;
  Stocks: number;
  TreasuryStocks: number;
  TreasuryRatio: number;
  MarketId: string;
  EPS: number | null;
}

interface DartFinancialData {
  rcept_no: string;
  reprt_code: string;
  bsns_year: string;
  corp_code: string;
  stock_code: string;
  account_nm: string;
  thstrm_amount: string;
  frmtrm_amount: string;
  bfefrmtrm_amount: string;
}

const DART_API_KEY = process.env.DART_API_KEY || '';
const DART_API_BASE_URL = 'https://opendart.fss.or.kr/api';

// API 호출 제한을 위한 딜레이 (밀리초)
const API_DELAY_MS = 1000; // 1초

/**
 * API 호출 사이에 딜레이를 추가하는 함수
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * OpenDart API에서 기업 고유번호를 종목코드로 조회
 */
async function getCorpCode(stockCode: string): Promise<string | null> {
  try {
    // 종목코드를 6자리로 패딩 (예: "5930" -> "005930")
    const paddedCode = stockCode.padStart(6, '0');

    const response = await axios.get(`${DART_API_BASE_URL}/company.json`, {
      params: {
        crtfc_key: DART_API_KEY,
        stock_code: paddedCode,
      },
    });

    if (response.data.status === '000') {
      return response.data.corp_code;
    }
    return null;
  } catch (error) {
    console.error(`   ❌ 기업 고유번호 조회 실패 (${stockCode}):`, (error as Error).message);
    return null;
  }
}

/**
 * OpenDart API에서 재무제표 데이터 조회
 */
async function getFinancialStatement(
  corpCode: string,
  year: string,
  reportCode: string = '11011' // 사업보고서
): Promise<DartFinancialData[]> {
  try {
    const response = await axios.get(`${DART_API_BASE_URL}/fnlttSinglAcntAll.json`, {
      params: {
        crtfc_key: DART_API_KEY,
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: reportCode,
        fs_div: 'CFS', // 연결재무제표
      },
    });

    if (response.data.status === '000') {
      return response.data.list || [];
    }
    return [];
  } catch (error) {
    console.error(`   ❌ 재무제표 조회 실패:`, (error as Error).message);
    return [];
  }
}

/**
 * 재무제표 데이터에서 EPS 추출
 */
function extractEPS(financialData: DartFinancialData[]): number | null {
  // "주당순이익" 또는 "기본주당순이익" 항목 찾기
  const epsItem = financialData.find(
    item =>
      item.account_nm.includes('주당순이익') ||
      item.account_nm.includes('기본주당순이익') ||
      item.account_nm === 'EPS'
  );

  if (epsItem && epsItem.thstrm_amount) {
    // 금액에서 쉼표 제거 후 숫자로 변환
    const epsValue = parseFloat(epsItem.thstrm_amount.replace(/,/g, ''));
    return isNaN(epsValue) ? null : epsValue;
  }

  // EPS를 직접 찾지 못한 경우, 당기순이익과 발행주식수로 계산
  const netIncomeItem = financialData.find(
    item =>
      item.account_nm.includes('당기순이익') ||
      item.account_nm.includes('지배기업소유주지분당기순이익')
  );

  if (netIncomeItem && netIncomeItem.thstrm_amount) {
    const netIncome = parseFloat(netIncomeItem.thstrm_amount.replace(/,/g, '')) * 1000000; // 백만원 단위
    return netIncome;
  }

  return null;
}

/**
 * 주식 데이터의 발행주식수를 사용하여 EPS 계산
 */
function calculateEPS(netIncome: number | null, stocks: number): number | null {
  if (netIncome === null || stocks === 0) {
    return null;
  }
  return Math.round((netIncome / stocks) * 100) / 100; // 소수점 2자리
}

/**
 * 메인 함수: EPS 데이터를 수집하여 krx_stocks.json 업데이트
 */
async function fetchEPSData() {
  try {
    // API 키 확인
    if (!DART_API_KEY) {
      console.error('❌ DART_API_KEY 환경변수가 설정되지 않았습니다.');
      console.log('\n📝 OpenDart API 키 발급 방법:');
      console.log('   1. https://opendart.fss.or.kr/ 접속');
      console.log('   2. 회원가입 및 로그인');
      console.log('   3. 인증키 발급/관리 메뉴에서 API 키 발급');
      console.log('   4. .env 파일에 DART_API_KEY=발급받은키 추가\n');
      process.exit(1);
    }

    console.log('📖 DB에서 종목 목록 읽기...');
    const stocks = await prisma.stock.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        stocks: true,
        eps: true,
      },
    });

    console.log(`📊 총 ${stocks.length}개 종목 발견\n`);

    const currentYear = new Date().getFullYear() - 1; // 전년도 재무제표
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    console.log('🔧 EPS 데이터 수집 시작...');
    console.log(`   (참고: API 호출 제한으로 인해 시간이 오래 걸릴 수 있습니다)\n`);

    // 처음 10개 종목만 테스트 (전체 실행 시 이 부분 제거)
    const TEST_LIMIT = 10;
    console.log(`⚠️  테스트 모드: 처음 ${TEST_LIMIT}개 종목만 처리합니다.\n`);

    for (let i = 0; i < Math.min(stocks.length, TEST_LIMIT); i++) {
      const stock = stocks[i];
      console.log(`[${i + 1}/${Math.min(stocks.length, TEST_LIMIT)}] ${stock.name} (${stock.code})`);

      // 이미 EPS 데이터가 있는 경우 스킵
      if (stock.eps !== null && parseFloat(stock.eps.toString()) !== 0) {
        console.log(`   ⏭️  이미 EPS 데이터 존재: ${stock.eps}`);
        skipCount++;
        continue;
      }

      try {
        // 1. 기업 고유번호 조회
        const corpCode = await getCorpCode(stock.code);
        if (!corpCode) {
          console.log(`   ⚠️  기업 고유번호를 찾을 수 없습니다.`);
          failCount++;
          await delay(API_DELAY_MS);
          continue;
        }

        // 2. 재무제표 데이터 조회
        await delay(API_DELAY_MS); // API 호출 제한
        const financialData = await getFinancialStatement(corpCode, currentYear.toString());

        if (financialData.length === 0) {
          console.log(`   ⚠️  재무제표 데이터를 찾을 수 없습니다.`);
          failCount++;
          continue;
        }

        // 3. EPS 추출
        const netIncome = extractEPS(financialData);
        const eps = calculateEPS(netIncome, Number(stock.stocks));

        if (eps !== null) {
          // DB 업데이트
          await prisma.stock.update({
            where: { id: stock.id },
            data: { eps: eps },
          });
          console.log(`   ✅ EPS 업데이트: ${eps}`);
          successCount++;
        } else {
          console.log(`   ⚠️  EPS 계산 실패`);
          failCount++;
        }
      } catch (error) {
        console.log(`   ❌ 오류:`, (error as Error).message);
        failCount++;
      }

      await delay(API_DELAY_MS); // API 호출 제한
    }

    console.log('\n✅ 완료!');
    console.log(`   - 성공: ${successCount}개`);
    console.log(`   - 실패: ${failCount}개`);
    console.log(`   - 스킵: ${skipCount}개`);

    if (TEST_LIMIT < stocks.length) {
      console.log(`\n⚠️  테스트 모드였습니다. 전체 종목 처리를 원하시면 스크립트의 TEST_LIMIT을 제거하세요.`);
    }
  } catch (error) {
    console.error('❌ 오류 발생:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 스크립트 실행
console.log('🚀 EPS 데이터 수집 스크립트 시작\n');
fetchEPSData();
