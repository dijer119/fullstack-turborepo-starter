import { Injectable, Logger, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { StockSearchResult } from './dto/search-stock.dto';
import {
  IntrinsicValueResult,
  FinancialData,
} from './dto/calculate-intrinsic-value.dto';
import { PrismaService } from '../persistence/prisma/prisma.service';
import * as iconv from 'iconv-lite';

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

  // 네이버 요청용 공통 헤더 (봇 차단 우회)
  private readonly defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive',
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 모듈 초기화 시 - DB 연결 확인
   */
  async onModuleInit() {
    try {
      const count = await this.prisma.stock.count();
      this.logger.log(`KRX 종목 DB 연결 완료: ${count}개 종목`);
    } catch (error) {
      this.logger.error(`KRX 종목 DB 연결 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
   * 종목명으로 주식 검색 (DB에서 검색)
   */
  async searchStock(keyword: string): Promise<StockSearchResult[]> {
    try {
      const searchKeyword = keyword.trim();

      if (!searchKeyword) {
        return [];
      }

      // Prisma로 DB에서 검색 (대소문자 구분 없이)
      const stocks = await this.prisma.stock.findMany({
        where: {
          OR: [
            {
              name: {
                contains: searchKeyword,
                mode: 'insensitive',
              },
            },
            {
              code: {
                contains: searchKeyword,
              },
            },
          ],
        },
        select: {
          code: true,
          name: true,
          market: true,
        },
        take: 20, // 최대 20개
      });

      // 정확히 일치하는 종목을 먼저 정렬
      const results = stocks
        .map(stock => ({
          code: stock.code,
          name: stock.name,
          market: stock.market,
        }))
        .sort((a, b) => {
          const lowerKeyword = searchKeyword.toLowerCase();
          const aExact = a.name.toLowerCase() === lowerKeyword;
          const bExact = b.name.toLowerCase() === lowerKeyword;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;

          const aStarts = a.name.toLowerCase().startsWith(lowerKeyword);
          const bStarts = b.name.toLowerCase().startsWith(lowerKeyword);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;

          return a.name.localeCompare(b.name, 'ko');
        });

      this.logger.log(`[searchStock] "${keyword}" 검색 결과: ${results.length}개`);
      return results.slice(0, 10);
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
      // 투자지표 테이블에서 데이터 추출
      const result: NaverFinancialRaw = {
        eps: [],
        bps: [],
        roe: [],
        per: [],
        pbr: [],
        years: [],
      };

      // WiseReport에서 연간 재무 데이터 추출 시도
      await this.fetchAnnualFinancials(stockCode, result);

      // 연간 데이터가 없으면 WiseReport에서 현재 값 추출
      if (result.eps.length === 0 || result.eps.every(v => v === 0)) {
        this.logger.warn(`[getFinancialData] 연간 데이터 없음, 현재 값으로 대체`);
        await this.fetchCurrentFinancials(stockCode, result);
      }

      // 데이터 검증 및 로깅
      this.logger.log(`[getFinancialData] Final Years: [${result.years.join(', ')}]`);
      this.logger.log(`[getFinancialData] Final EPS: [${result.eps.join(', ')}]`);
      this.logger.log(`[getFinancialData] Final BPS: [${result.bps.join(', ')}]`);
      this.logger.log(`[getFinancialData] Final ROE: [${result.roe.join(', ')}]`);

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
   * 현재 재무 데이터 조회 (WiseReport c1010001.aspx)
   * 연간 데이터가 없을 때 현재 값을 사용하고 과거 값은 역산
   */
  private async fetchCurrentFinancials(stockCode: string, result: NaverFinancialRaw): Promise<void> {
    try {
      const url = `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${stockCode}`;
      const response = await fetch(url, { headers: this.defaultHeaders });
      
      if (!response.ok) {
        this.logger.warn(`[fetchCurrentFinancials] HTTP error: ${response.status}`);
        return;
      }
      
      const html = await response.text();
      
      const currentYear = new Date().getFullYear();
      result.years = [currentYear - 2, currentYear - 1, currentYear];
      
      // EPS 추출: EPS <b class="num">178</b>
      const epsMatch = html.match(/EPS\s*<b class="num">([^<]+)<\/b>/);
      let currentEps = 0;
      if (epsMatch) {
        currentEps = this.parseNumber(epsMatch[1]);
        this.logger.log(`[fetchCurrentFinancials] Current EPS: ${currentEps}`);
      }
      
      // BPS 추출: BPS <b class="num">13,891</b>
      const bpsMatch = html.match(/BPS\s*<b class="num">([^<]+)<\/b>/);
      let currentBps = 0;
      if (bpsMatch) {
        currentBps = this.parseNumber(bpsMatch[1]);
        this.logger.log(`[fetchCurrentFinancials] Current BPS: ${currentBps}`);
      }
      
      // ROE 추출 (있으면)
      let currentRoe = 0;
      const roeMatch = html.match(/ROE\s*<b class="num">([^<]+)<\/b>/);
      if (roeMatch) {
        currentRoe = this.parseFloat(roeMatch[1]);
        this.logger.log(`[fetchCurrentFinancials] Current ROE: ${currentRoe}`);
      }
      
      // 과거 데이터를 역산 (연평균 성장률 가정: 5%)
      // 이는 추정치이며, 실제 과거 데이터가 아님을 명시
      const growthRate = 1.05; // 5% 성장 가정
      
      if (currentEps > 0) {
        result.eps = [
          Math.round(currentEps / (growthRate * growthRate)), // 2년 전
          Math.round(currentEps / growthRate), // 1년 전
          currentEps, // 현재
        ];
        this.logger.log(`[fetchCurrentFinancials] Estimated EPS history: [${result.eps.join(', ')}]`);
      } else {
        result.eps = [0, 0, 0];
      }
      
      if (currentBps > 0) {
        result.bps = [
          Math.round(currentBps / (growthRate * growthRate)),
          Math.round(currentBps / growthRate),
          currentBps,
        ];
        this.logger.log(`[fetchCurrentFinancials] Estimated BPS history: [${result.bps.join(', ')}]`);
      } else {
        result.bps = [0, 0, 0];
      }
      
      if (currentRoe > 0) {
        result.roe = [currentRoe, currentRoe, currentRoe];
      } else {
        result.roe = [0, 0, 0];
      }
      
      // PER, PBR도 추출 (참고용)
      const perMatch = html.match(/PER\s*<b class="num">([^<]+)<\/b>/);
      if (perMatch) {
        const per = this.parseFloat(perMatch[1]);
        result.per = [per, per, per];
      }
      
      const pbrMatch = html.match(/PBR\s*<b class="num">([^<]+)<\/b>/);
      if (pbrMatch) {
        const pbr = this.parseFloat(pbrMatch[1]);
        result.pbr = [pbr, pbr, pbr];
      }
      
    } catch (error) {
      this.logger.error(`Current financial fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 연간 재무 데이터 조회 (WiseReport)
   * 연도와 함께 EPS, BPS, ROE 데이터를 추출
   */
  private async fetchAnnualFinancials(stockCode: string, result: NaverFinancialRaw): Promise<void> {
    try {
      // WiseReport 재무제표 페이지
      const url = `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${stockCode}`;
      const response = await fetch(url, { headers: this.defaultHeaders });
      
      if (!response.ok) {
        this.logger.warn(`[fetchAnnualFinancials] HTTP error: ${response.status}`);
        return;
      }
      
      const html = await response.text();
      
      // 1. 연도 추출 - thead의 연도 행에서 추출
      // 패턴: <th>2022/12</th><th>2023/12</th><th>2024/12</th>
      const yearMatches = html.match(/<th[^>]*>(\d{4})\/\d{2}<\/th>/g);
      if (yearMatches && yearMatches.length >= 3) {
        // 최근 3개년 데이터만 사용 (역순으로 slice하여 최근 3개 선택 후 정렬)
        const allYears = yearMatches.map(match => {
          const yearMatch = match.match(/(\d{4})/);
          return yearMatch ? parseInt(yearMatch[1], 10) : 0;
        }).filter(year => year > 0);
        
        // 최근 3개년 선택
        result.years = allYears.slice(-3);
        this.logger.log(`[fetchAnnualFinancials] Years: [${result.years.join(', ')}]`);
      } else {
        // 연도를 찾지 못하면 기본값 설정
        const currentYear = new Date().getFullYear();
        result.years = [currentYear - 2, currentYear - 1, currentYear];
        this.logger.warn(`[fetchAnnualFinancials] Years not found, using default: [${result.years.join(', ')}]`);
      }

      // 2. EPS 데이터 추출
      // 패턴: EPS(원) ... <td class="num">1,234</td><td class="num">2,345</td>...
      const epsTableMatch = html.match(/EPS\(원\)[\s\S]{0,500}?<\/tr>/);
      if (epsTableMatch) {
        const epsValues = epsTableMatch[0].match(/<td[^>]*class="[^"]*num[^"]*"[^>]*>([\d,\-\s]+)<\/td>/g);
        if (epsValues) {
          // 최근 3개년 데이터만 추출 (역순으로 slice)
          const allEps = epsValues.map(v => {
            const numMatch = v.match(/([\d,\-]+)/);
            return numMatch ? this.parseNumber(numMatch[1]) : 0;
          });
          result.eps = allEps.slice(-3);
          this.logger.log(`[fetchAnnualFinancials] EPS: [${result.eps.join(', ')}]`);
        }
      }

      // 3. BPS 데이터 추출
      const bpsTableMatch = html.match(/BPS\(원\)[\s\S]{0,500}?<\/tr>/);
      if (bpsTableMatch) {
        const bpsValues = bpsTableMatch[0].match(/<td[^>]*class="[^"]*num[^"]*"[^>]*>([\d,\-\s]+)<\/td>/g);
        if (bpsValues) {
          const allBps = bpsValues.map(v => {
            const numMatch = v.match(/([\d,\-]+)/);
            return numMatch ? this.parseNumber(numMatch[1]) : 0;
          });
          result.bps = allBps.slice(-3);
          this.logger.log(`[fetchAnnualFinancials] BPS: [${result.bps.join(', ')}]`);
        }
      }

      // 4. ROE 데이터 추출
      const roeTableMatch = html.match(/ROE\([\s\S]{0,500}?<\/tr>/);
      if (roeTableMatch) {
        const roeValues = roeTableMatch[0].match(/<td[^>]*class="[^"]*num[^"]*"[^>]*>([\d.,\-\s]+)<\/td>/g);
        if (roeValues) {
          const allRoe = roeValues.map(v => {
            const numMatch = v.match(/([\d.,\-]+)/);
            return numMatch ? this.parseFloat(numMatch[1]) : 0;
          });
          result.roe = allRoe.slice(-3);
          this.logger.log(`[fetchAnnualFinancials] ROE: [${result.roe.join(', ')}]`);
        }
      }

      // 데이터가 없으면 기본값 설정
      if (result.eps.length === 0) {
        result.eps = [0, 0, 0];
      }
      if (result.bps.length === 0) {
        result.bps = [0, 0, 0];
      }
      if (result.roe.length === 0) {
        result.roe = [0, 0, 0];
      }

    } catch (error) {
      this.logger.error(`Annual financial fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // 오류 시 기본값 설정
      const currentYear = new Date().getFullYear();
      result.years = [currentYear - 2, currentYear - 1, currentYear];
      result.eps = [0, 0, 0];
      result.bps = [0, 0, 0];
      result.roe = [0, 0, 0];
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


