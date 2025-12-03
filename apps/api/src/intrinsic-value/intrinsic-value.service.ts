import { Injectable, Logger, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { StockSearchResult } from './dto/search-stock.dto';
import {
  IntrinsicValueResult,
  FinancialData,
} from './dto/calculate-intrinsic-value.dto';
import * as iconv from 'iconv-lite';
import * as fs from 'fs';
import * as path from 'path';

interface KrxStock {
  Code: string;           // 종목코드
  ISU_CD: string;         // ISIN 코드
  Name: string;           // 종목명
  Market: string;         // 시장구분 (KOSPI/KOSDAQ)
  Dept: string;           // 부서
  Close: string;          // 종가
  ChangeCode: string;     // 변동 코드
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
  MarketId: string;       // 시장 ID
}

interface NaverFinancialRaw {
  eps: number[];
  bps: number[];
  roe: number[];
  per: number[];
  pbr: number[];
  years: number[];
}

@Injectable()
export class IntrinsicValueService implements OnModuleInit {
  private readonly logger = new Logger(IntrinsicValueService.name);
  
  // KRX 종목 목록 캐시
  private krxStocks: KrxStock[] = [];

  // 네이버 요청용 공통 헤더 (봇 차단 우회)
  private readonly defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive',
  };

  /**
   * 모듈 초기화 시 KRX 종목 목록 로드
   */
  onModuleInit() {
    this.loadKrxStocks();
  }

  /**
   * KRX 종목 목록 JSON 파일 로드
   */
  private loadKrxStocks(): void {
    try {
      // process.cwd()를 사용하여 프로젝트 루트 기준 경로 설정
      const filePath = path.join(process.cwd(), 'data', 'krx_stocks.json');
      
      this.logger.log(`KRX 종목 목록 파일 경로: ${filePath}`);
      
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        this.krxStocks = JSON.parse(data) as KrxStock[];
        this.logger.log(`KRX 종목 목록 로드 완료: ${this.krxStocks.length}개 종목`);
      } else {
        this.logger.warn(`KRX 종목 목록 파일이 없습니다: ${filePath}`);
        this.logger.warn('yarn krx:update 를 실행하여 생성하세요.');
      }
    } catch (error) {
      this.logger.error(`KRX 종목 목록 로드 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * EUC-KR 인코딩 페이지를 UTF-8로 변환하여 가져오기
   */
  private async fetchWithEucKr(url: string): Promise<string> {
    const response = await fetch(url, { headers: this.defaultHeaders });
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return iconv.decode(buffer, 'euc-kr');
  }

  /**
   * 종목명으로 주식 검색 (KRX 종목 목록에서 검색)
   */
  async searchStock(keyword: string): Promise<StockSearchResult[]> {
    try {
      const searchKeyword = keyword.trim().toLowerCase();
      
      if (!searchKeyword) {
        return [];
      }

      // KRX 종목 목록에서 검색
      if (this.krxStocks.length > 0) {
        const results = this.krxStocks
          .filter(stock => 
            stock.Name.toLowerCase().includes(searchKeyword) ||
            stock.Code.includes(searchKeyword)
          )
          .slice(0, 20) // 최대 20개
          .map(stock => ({
            code: stock.Code,
            name: stock.Name,
            market: stock.Market,
          }));

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

        this.logger.log(`[searchStock] "${keyword}" 검색 결과: ${results.length}개`);
        return results.slice(0, 10);
      }

      // KRX 목록이 없으면 에러 반환
      this.logger.warn('[searchStock] KRX 종목 목록이 비어있습니다.');
      return [];
    } catch (error) {
      this.logger.error(`Stock search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        '종목 검색에 실패했습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 종목 코드로 현재가 조회
   * Python 방식과 동일: sise.naver 페이지에서 #_nowVal 요소로 현재가 추출
   */
  async getCurrentPrice(stockCode: string): Promise<{ price: number; name: string }> {
    try {
      // 네이버 금융 시세 페이지 크롤링 (Python과 동일한 URL)
      const url = `https://finance.naver.com/item/sise.naver?code=${stockCode}`;
      this.logger.log(`[getCurrentPrice] Fetching URL: ${url}`);
      
      // EUC-KR 인코딩 처리
      const html = await this.fetchWithEucKr(url);
      this.logger.log(`[getCurrentPrice] HTML length: ${html.length} bytes`);
      
      // 현재가 추출 - id="_nowVal" 요소에서 추출 (Python XPath와 동일)
      const priceMatch = html.match(/id="_nowVal"[^>]*>([^<]+)</);
      
      // 종목명 추출
      const nameMatch = html.match(/<title>([^:]+)/);
      
      this.logger.log(`[getCurrentPrice] Price match found: ${!!priceMatch}, Name match found: ${!!nameMatch}`);
      
      if (!priceMatch) {
        // 디버깅: HTML 일부 출력
        this.logger.warn(`[getCurrentPrice] HTML sample (first 1000 chars): ${html.substring(0, 1000)}`);
        throw new Error('현재가를 찾을 수 없습니다. (_nowVal 요소를 찾지 못함)');
      }

      // 콤마 제거 후 숫자로 변환
      const priceText = priceMatch[1].trim().replace(/,/g, '');
      const price = parseFloat(priceText);
      const name = nameMatch ? nameMatch[1].trim() : stockCode;

      this.logger.log(`[getCurrentPrice] Result - Stock: ${name}, Price: ${price}원`);

      return { price, name };
    } catch (error) {
      this.logger.error(`Failed to get current price: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        '현재가 조회에 실패했습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 재무 데이터 조회 (EPS, BPS, ROE 등)
   * Python 코드와 동일한 방식으로 네이버 금융에서 데이터 추출
   */
  async getFinancialData(stockCode: string): Promise<NaverFinancialRaw> {
    try {
      // 네이버 금융 투자지표 페이지 (EUC-KR 인코딩)
      const url = `https://finance.naver.com/item/main.naver?code=${stockCode}`;
      this.logger.log(`[getFinancialData] Fetching: ${url}`);
      
      const html = await this.fetchWithEucKr(url);
      this.logger.log(`[getFinancialData] HTML length: ${html.length} bytes`);
      
      // 투자지표 테이블에서 데이터 추출
      const result: NaverFinancialRaw = {
        eps: [],
        bps: [],
        roe: [],
        per: [],
        pbr: [],
        years: [],
      };

      // 연도 추출 (최근 3~4년)
      const currentYear = new Date().getFullYear();
      result.years = [currentYear - 2, currentYear - 1, currentYear];

      // 현재 EPS 추출 (id="_eps")
      const epsMatch = html.match(/id="_eps"[^>]*>([^<]+)</);
      if (epsMatch) {
        const currentEps = this.parseNumber(epsMatch[1]);
        this.logger.log(`[getFinancialData] Current EPS: ${currentEps}`);
        // 현재 EPS를 배열에 추가 (최근 데이터로 사용)
        result.eps = [currentEps, currentEps, currentEps];
      }

      // 추정 EPS 추출 (id="_cns_eps") - 더 정확한 미래 추정치
      const cnsEpsMatch = html.match(/id="_cns_eps"[^>]*>([^<]+)</);
      if (cnsEpsMatch) {
        const cnsEps = this.parseNumber(cnsEpsMatch[1]);
        this.logger.log(`[getFinancialData] Consensus EPS: ${cnsEps}`);
        // 추정 EPS가 있으면 가장 최근 값으로 사용
        if (result.eps.length > 0) {
          result.eps[result.eps.length - 1] = cnsEps;
        }
      }

      // 현재 BPS 추출 - PBR|BPS 행에서 마지막 em 태그
      // HTML: PBR<span class="bar">l</span>BPS ... <em id="_pbr">1.71</em>배 ... <em>60,632</em>원
      const pbrBpsRow = html.match(/PBR<span class="bar">[|l]<\/span>BPS[\s\S]*?<\/tr>/);
      if (pbrBpsRow) {
        const allEmTags = pbrBpsRow[0].match(/<em[^>]*>[\s\S]*?<\/em>/g);
        if (allEmTags) {
          // 마지막 em에서 숫자 추출 (BPS 값)
          for (let i = allEmTags.length - 1; i >= 0; i--) {
            const numMatch = allEmTags[i].match(/>([0-9,]+)</);
            if (numMatch) {
              const currentBps = this.parseNumber(numMatch[1]);
              this.logger.log(`[getFinancialData] Current BPS: ${currentBps}`);
              result.bps = [currentBps, currentBps, currentBps];
              break;
            }
          }
        }
      }

      // 연간 데이터 테이블에서 EPS/BPS 히스토리 추출 시도
      await this.fetchAnnualFinancials(stockCode, result);

      // 데이터 검증 및 로깅
      this.logger.log(`[getFinancialData] Final EPS: [${result.eps.join(', ')}]`);
      this.logger.log(`[getFinancialData] Final BPS: [${result.bps.join(', ')}]`);

      return result;
    } catch (error) {
      this.logger.error(`Failed to get financial data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new HttpException(
        '재무 데이터 조회에 실패했습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 연간 재무 데이터 조회 (FnGuide 데이터)
   */
  private async fetchAnnualFinancials(stockCode: string, result: NaverFinancialRaw): Promise<void> {
    try {
      // 네이버 금융 종목분석 페이지에서 연간 데이터 조회
      const url = `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${stockCode}`;
      const response = await fetch(url, { headers: this.defaultHeaders });
      
      if (!response.ok) return;
      
      const html = await response.text();
      
      // 연간 EPS 데이터 추출 (최근 3년)
      const epsTableMatch = html.match(/EPS\(원\)[\s\S]*?<\/tr>/);
      if (epsTableMatch) {
        const epsValues = epsTableMatch[0].match(/<td[^>]*class="num"[^>]*>([\d,\-]+)<\/td>/g);
        if (epsValues && epsValues.length >= 3) {
          result.eps = epsValues.slice(0, 3).map(v => {
            const num = v.match(/([\d,\-]+)/)?.[1] || '0';
            return this.parseNumber(num);
          });
          this.logger.log(`[fetchAnnualFinancials] Annual EPS: [${result.eps.join(', ')}]`);
        }
      }

      // 연간 BPS 데이터 추출
      const bpsTableMatch = html.match(/BPS\(원\)[\s\S]*?<\/tr>/);
      if (bpsTableMatch) {
        const bpsValues = bpsTableMatch[0].match(/<td[^>]*class="num"[^>]*>([\d,\-]+)<\/td>/g);
        if (bpsValues && bpsValues.length >= 3) {
          result.bps = bpsValues.slice(0, 3).map(v => {
            const num = v.match(/([\d,\-]+)/)?.[1] || '0';
            return this.parseNumber(num);
          });
          this.logger.log(`[fetchAnnualFinancials] Annual BPS: [${result.bps.join(', ')}]`);
        }
      }

      // ROE 데이터 추출
      const roeTableMatch = html.match(/ROE[\s\S]*?<\/tr>/);
      if (roeTableMatch) {
        const roeValues = roeTableMatch[0].match(/<td[^>]*class="num"[^>]*>([\d.,\-]+)<\/td>/g);
        if (roeValues && roeValues.length >= 3) {
          result.roe = roeValues.slice(0, 3).map(v => {
            const num = v.match(/([\d.,\-]+)/)?.[1] || '0';
            return this.parseFloat(num);
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Annual financial fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * 자기주식 비율 조회
   * WiseReport에서 자사주 비율 직접 추출
   */
  async getTreasuryStockRatio(stockCode: string): Promise<number> {
    try {
      // WiseReport 기업개요 페이지에서 자기주식 비율 추출
      const url = `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${stockCode}`;
      this.logger.log(`[getTreasuryStockRatio] Fetching: ${url}`);
      
      const response = await fetch(url, { headers: this.defaultHeaders });
      if (!response.ok) {
        this.logger.warn(`[getTreasuryStockRatio] HTTP error: ${response.status}`);
        return 0;
      }
      
      const html = await response.text();
      
      // &nbsp; 제거하여 정확한 패턴 매칭
      const cleanHtml = html.replace(/&nbsp;/g, '');
      
      // 자사주 행에서 직접 비율 추출
      // 패턴: 자사주 ... <td>91,828,987</td> ... <td>1.55</td>
      const treasuryMatch = cleanHtml.match(/자사주[\s\S]*?<td[^>]*>\s*([\d,]+)\s*<\/td>[\s\S]*?<td[^>]*>\s*([\d.]+)\s*<\/td>/);
      
      if (treasuryMatch) {
        const shares = parseInt(treasuryMatch[1].replace(/,/g, ''), 10);
        const ratio = parseFloat(treasuryMatch[2]);
        this.logger.log(`[getTreasuryStockRatio] 자사주: ${shares.toLocaleString()}주, 비율: ${ratio}%`);
        return ratio;
      }
      
      this.logger.log(`[getTreasuryStockRatio] Not found, returning 0`);
      return 0;
    } catch (error) {
      this.logger.warn(`Treasury stock ratio fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 0;
    }
  }

  /**
   * 배당수익률 조회
   */
  async getDividendYield(stockCode: string): Promise<number | null> {
    try {
      const url = `https://navercomp.wisereport.co.kr/v2/company/c1030001.aspx?cmp_cd=${stockCode}`;
      this.logger.log(`[getDividendYield] Fetching: ${url}`);
      
      const response = await fetch(url, { headers: this.defaultHeaders });
      if (!response.ok) {
        return null;
      }
      
      const html = await response.text();
      
      // 현금배당수익률 추출
      const divMatch = html.match(/현금배당수익률[\s\S]{0,50}?>([\d.]+)%/);
      if (divMatch) {
        const dividendYield = parseFloat(divMatch[1]);
        this.logger.log(`[getDividendYield] Found: ${dividendYield}%`);
        return dividendYield;
      }
      
      this.logger.log(`[getDividendYield] Not found`);
      return null;
    } catch (error) {
      this.logger.warn(`Dividend yield fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * 내재가치 계산
   * 
   * 계산 방법:
   * 1. EPS 가중평균 = (최근년도EPS×3 + 전년도EPS×2 + 전전년도EPS×1) ÷ 6
   * 2. 기본 내재가치 = (EPS 가중평균 × 10 + 최근년도 BPS) ÷ 2
   * 3. 자기주식 조정: 내재가치 = 기본 내재가치 × (100 ÷ (100 - 자기주식비율))
   * 4. 안전마진 = ((내재가치 - 현재가) ÷ 현재가) × 100
   */
  async calculateIntrinsicValue(stockCode: string): Promise<IntrinsicValueResult> {
    // 1. 현재가 조회
    const { price: currentPrice, name: stockName } = await this.getCurrentPrice(stockCode);

    // 2. 재무 데이터 조회
    const financialRaw = await this.getFinancialData(stockCode);

    // 3. 자기주식 비율 및 배당률 조회 (병렬)
    const [treasuryStockRatio, dividendYield] = await Promise.all([
      this.getTreasuryStockRatio(stockCode),
      this.getDividendYield(stockCode),
    ]);

    // EPS 배열 확인 (최소 1개 이상 필요)
    const epsValues = financialRaw.eps.filter(v => v !== null && !isNaN(v));
    const bpsValues = financialRaw.bps.filter(v => v !== null && !isNaN(v));

    if (epsValues.length === 0) {
      throw new HttpException(
        'EPS 데이터를 찾을 수 없습니다. 종목 코드를 확인해주세요.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 4. EPS 가중평균 계산
    // 최근 3개년 데이터 사용 (가장 최근 = 가중치 3, 그 전년 = 2, 그 전전년 = 1)
    let weightedEps: number;
    if (epsValues.length >= 3) {
      weightedEps = (epsValues[2] * 3 + epsValues[1] * 2 + epsValues[0] * 1) / 6;
    } else if (epsValues.length === 2) {
      weightedEps = (epsValues[1] * 3 + epsValues[0] * 2) / 5;
    } else {
      weightedEps = epsValues[0];
    }

    // 5. 최근 BPS
    const latestBps = bpsValues.length > 0 ? bpsValues[bpsValues.length - 1] : 0;

    // 6. 기본 내재가치 계산
    const basicIntrinsicValue = (weightedEps * 10 + latestBps) / 2;

    // 7. 자기주식 조정된 내재가치
    let adjustedIntrinsicValue = basicIntrinsicValue;
    if (treasuryStockRatio > 0 && treasuryStockRatio < 100) {
      adjustedIntrinsicValue = basicIntrinsicValue * (100 / (100 - treasuryStockRatio));
    }

    // 8. 안전마진 계산
    const safetyMargin = ((adjustedIntrinsicValue - currentPrice) / currentPrice) * 100;

    // 9. 재무 히스토리 정리
    const financialHistory: FinancialData[] = financialRaw.years.slice(0, 3).map((year, index) => ({
      year,
      eps: financialRaw.eps[index] || null,
      bps: financialRaw.bps[index] || null,
      roe: financialRaw.roe[index] || null,
      per: financialRaw.per[index] || null,
      pbr: financialRaw.pbr[index] || null,
    }));

    // 10. 투자 의견 생성
    const recommendation = this.generateRecommendation(safetyMargin, adjustedIntrinsicValue, currentPrice);

    return {
      stockCode,
      stockName,
      currentPrice,
      weightedEps: Math.round(weightedEps),
      latestBps: Math.round(latestBps),
      basicIntrinsicValue: Math.round(basicIntrinsicValue),
      treasuryStockRatio,
      dividendYield,
      adjustedIntrinsicValue: Math.round(adjustedIntrinsicValue),
      safetyMargin: Math.round(safetyMargin * 100) / 100,
      financialHistory,
      calculatedAt: new Date().toISOString(),
      recommendation,
    };
  }

  /**
   * 투자 의견 생성
   */
  private generateRecommendation(safetyMargin: number, intrinsicValue: number, currentPrice: number): string {
    if (safetyMargin >= 50) {
      return '🟢 매우 저평가 - 적극 매수 고려';
    } else if (safetyMargin >= 30) {
      return '🟢 저평가 - 매수 고려';
    } else if (safetyMargin >= 10) {
      return '🟡 약간 저평가 - 관심 종목';
    } else if (safetyMargin >= -10) {
      return '🟡 적정 가치 근접';
    } else if (safetyMargin >= -30) {
      return '🟠 약간 고평가 - 신중한 접근 필요';
    } else {
      return '🔴 고평가 - 매수 비추천';
    }
  }

  /**
   * 숫자 문자열 파싱 (콤마 제거)
   */
  private parseNumber(value: string): number {
    if (!value || value === '-' || value === 'N/A') return 0;
    const num = parseInt(value.replace(/,/g, ''), 10);
    return isNaN(num) ? 0 : num;
  }

  /**
   * 소수점 숫자 파싱
   */
  private parseFloat(value: string): number {
    if (!value || value === '-' || value === 'N/A') return 0;
    const num = parseFloat(value.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  }

  /**
   * 한국 주식 종목 목록 (KRX) - 인기 종목
   */
  async getPopularStocks(): Promise<StockSearchResult[]> {
    return [
      { code: '005930', name: '삼성전자', market: 'KOSPI' },
      { code: '000660', name: 'SK하이닉스', market: 'KOSPI' },
      { code: '035420', name: 'NAVER', market: 'KOSPI' },
      { code: '035720', name: '카카오', market: 'KOSPI' },
      { code: '051910', name: 'LG화학', market: 'KOSPI' },
      { code: '006400', name: '삼성SDI', market: 'KOSPI' },
      { code: '005380', name: '현대차', market: 'KOSPI' },
      { code: '000270', name: '기아', market: 'KOSPI' },
      { code: '068270', name: '셀트리온', market: 'KOSPI' },
      { code: '207940', name: '삼성바이오로직스', market: 'KOSPI' },
    ];
  }
}

