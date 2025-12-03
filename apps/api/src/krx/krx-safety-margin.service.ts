import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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

@Injectable()
export class KrxSafetyMarginService {
  private readonly logger = new Logger(KrxSafetyMarginService.name);
  private readonly krxDataPath = path.join(process.cwd(), 'data', 'krx_stocks.json');
  private readonly resultPath = path.join(process.cwd(), 'data', 'all_safety_margin_results.json');
  
  private readonly defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  };

  /**
   * 매일 장 마감 후 (17:00) 전체 종목 안전마진 계산
   * - 평일(월~금)만 실행
   * - 하루 1회
   */
  @Cron('0 17 * * 1-5', {
    name: 'calculateAllSafetyMargins',
    timeZone: 'Asia/Seoul',
  })
  async handleDailyCalculation() {
    this.logger.log('⏰ [일일 스케줄] 장 마감 후 전체 종목 안전마진 계산 시작');
    this.logger.log(`📅 실행 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
    await this.calculateAllSafetyMargins();
  }

  /**
   * 전체 종목 안전마진 계산 및 저장
   */
  async calculateAllSafetyMargins(): Promise<SafetyMarginResult[]> {
    this.logger.log('🚀 전체 종목 안전마진 계산 시작');
    
    // KRX 종목 목록 로드
    const stocks = this.loadKrxStocks();
    if (stocks.length === 0) {
      this.logger.warn('KRX 종목 목록이 비어있습니다.');
      return [];
    }

    this.logger.log(`📊 총 ${stocks.length}개 종목 계산 예정`);
    
    const results: SafetyMarginResult[] = [];
    const batchSize = 10; // 동시 처리 개수
    const delayMs = 500; // 배치 간 딜레이

    for (let i = 0; i < stocks.length; i += batchSize) {
      const batch = stocks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(stock => this.calculateSingleStock(stock))
      );
      results.push(...batchResults);
      
      // 진행률 로깅
      const progress = Math.min(i + batchSize, stocks.length);
      if (progress % 100 === 0 || progress === stocks.length) {
        this.logger.log(`   진행: ${progress}/${stocks.length} (${Math.round(progress / stocks.length * 100)}%)`);
      }
      
      // Rate limiting
      if (i + batchSize < stocks.length) {
        await this.delay(delayMs);
      }
    }

    // 안전마진 기준 내림차순 정렬 (null은 맨 뒤로)
    results.sort((a, b) => {
      if (a.safety_margin === null && b.safety_margin === null) return 0;
      if (a.safety_margin === null) return 1;
      if (b.safety_margin === null) return -1;
      return b.safety_margin - a.safety_margin;
    });

    // 결과 저장
    this.saveResults(results);
    
    // 요약 로깅
    const validResults = results.filter(r => r.safety_margin !== null);
    const positiveMargin = validResults.filter(r => r.safety_margin! > 0);
    
    this.logger.log(`✅ 안전마진 계산 완료`);
    this.logger.log(`   - 총 종목: ${results.length}개`);
    this.logger.log(`   - 계산 성공: ${validResults.length}개`);
    this.logger.log(`   - 양수 안전마진: ${positiveMargin.length}개`);
    
    if (positiveMargin.length > 0) {
      this.logger.log(`   - 최고 안전마진: ${positiveMargin[0].name} (${positiveMargin[0].safety_margin?.toFixed(2)}%)`);
    }

    return results;
  }

  private async calculateSingleStock(stock: KrxStock): Promise<SafetyMarginResult> {
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
      // 1. 현재가 (krx_stocks.json에서)
      const currentPrice = parseInt(stock.Close, 10);
      if (isNaN(currentPrice) || currentPrice <= 0) {
        return result;
      }
      result.current_price = currentPrice;

      // 2. 재무 데이터 조회
      const financialData = await this.getFinancialData(stock.Code);
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

    } catch (error) {
      // 에러 발생 시 기본값 반환
    }

    return result;
  }

  private async getFinancialData(stockCode: string): Promise<{
    eps: number[];
    bps: number;
    treasuryRatio: number;
    dividendYield: number | null;
  } | null> {
    try {
      // 투자지표 페이지에서 EPS, BPS 조회
      const investUrl = `https://navercomp.wisereport.co.kr/v2/company/c1030001.aspx?cmp_cd=${stockCode}`;
      const investResponse = await fetch(investUrl, { headers: this.defaultHeaders });
      
      if (!investResponse.ok) return null;
      
      const investHtml = await investResponse.text();
      const cleanInvestHtml = investHtml.replace(/&nbsp;/g, '').replace(/,/g, '');

      // EPS 추출 (투자지표 페이지에서 직접)
      const eps: number[] = [];
      const epsMatch = investHtml.match(/EPS[\s\S]{0,50}?>([\d,]+)</);
      if (epsMatch) {
        eps.push(this.parseNumber(epsMatch[1]));
      }

      // BPS 추출
      let bps = 0;
      const bpsMatch = investHtml.match(/BPS[\s\S]{0,50}?>([\d,]+)</);
      if (bpsMatch) {
        bps = this.parseNumber(bpsMatch[1]);
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
        const compResponse = await fetch(compUrl, { headers: this.defaultHeaders });
        
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

  private loadKrxStocks(): KrxStock[] {
    try {
      if (!fs.existsSync(this.krxDataPath)) {
        this.logger.warn(`KRX 데이터 파일이 없습니다: ${this.krxDataPath}`);
        return [];
      }
      
      const data = fs.readFileSync(this.krxDataPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      this.logger.error(`KRX 데이터 로드 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  private saveResults(results: SafetyMarginResult[]): void {
    try {
      const dataDir = path.dirname(this.resultPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(this.resultPath, JSON.stringify(results, null, 2), 'utf-8');
      this.logger.log(`📁 결과 저장: ${this.resultPath}`);
    } catch (error) {
      this.logger.error(`결과 저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseNumber(value: string): number {
    if (!value || value === '-' || value === 'N/A') return 0;
    const num = parseInt(value.replace(/,/g, ''), 10);
    return isNaN(num) ? 0 : num;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

