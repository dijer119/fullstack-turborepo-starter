import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';

interface KrxStock {
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
}

@Injectable()
export class KrxSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(KrxSchedulerService.name);
  private readonly dataPath = path.join(process.cwd(), 'data', 'krx_stocks.json');
  
  private readonly defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  async onModuleInit() {
    this.logger.log('KRX 스케줄러 초기화');
    this.logger.log(`데이터 파일 경로: ${this.dataPath}`);
    
    // 파일이 없으면 즉시 업데이트
    if (!fs.existsSync(this.dataPath)) {
      this.logger.log('KRX 데이터 파일이 없습니다. 즉시 업데이트 시작...');
      await this.updateKrxStocks();
    }
  }

  /**
   * 매시 정각에 KRX 종목 데이터 업데이트
   * 장 운영 시간(09:00~16:00)에만 실행
   */
  @Cron('0 * 9-16 * * 1-5', {
    name: 'updateKrxStocks',
    timeZone: 'Asia/Seoul',
  })
  async handleCron() {
    this.logger.log('⏰ 정기 KRX 종목 업데이트 시작');
    await this.updateKrxStocks();
  }

  /**
   * 서버 시작 후 5분 뒤 첫 업데이트 (장 시간과 무관하게)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyUpdate() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // 주말이나 장 시간 외에만 실행 (장 시간에는 handleCron이 실행됨)
    if (day === 0 || day === 6 || hour < 9 || hour >= 17) {
      this.logger.log('⏰ 시간당 KRX 종목 업데이트 (장외 시간)');
      await this.updateKrxStocks();
    }
  }

  /**
   * KRX 종목 데이터 수동 업데이트
   */
  async updateKrxStocks(): Promise<void> {
    try {
      this.logger.log('🚀 KRX 종목 데이터 업데이트 시작');
      
      const baseDate = this.getLastBusinessDay();
      this.logger.log(`📅 기준일: ${baseDate}`);

      // KOSPI + KOSDAQ 데이터 가져오기
      const kospiStocks = await this.fetchKrxStocksByMarket('STK', 'KOSPI', baseDate);
      const kosdaqStocks = await this.fetchKrxStocksByMarket('KSQ', 'KOSDAQ', baseDate);
      
      let allStocks = [...kospiStocks, ...kosdaqStocks];
      
      if (allStocks.length < 100) {
        this.logger.warn('KRX 데이터 부족, 업데이트 건너뜀');
        return;
      }

      // 종목명 기준 정렬
      allStocks.sort((a, b) => a.Name.localeCompare(b.Name, 'ko'));

      // 디렉토리 확인/생성
      const dataDir = path.dirname(this.dataPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // 파일 저장
      fs.writeFileSync(this.dataPath, JSON.stringify(allStocks, null, 2), 'utf-8');
      
      this.logger.log(`✅ KRX 종목 업데이트 완료: ${allStocks.length}개 종목`);
      this.logger.log(`   - KOSPI: ${kospiStocks.length}개`);
      this.logger.log(`   - KOSDAQ: ${kosdaqStocks.length}개`);
    } catch (error) {
      this.logger.error(`❌ KRX 종목 업데이트 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async fetchKrxStocksByMarket(
    marketId: string,
    marketName: string,
    baseDate: string,
  ): Promise<KrxStock[]> {
    this.logger.log(`📊 ${marketName} 종목 목록 가져오는 중...`);
    
    const url = 'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
    
    const formData = new URLSearchParams({
      bld: 'dbms/MDC/STAT/standard/MDCSTAT01501',
      locale: 'ko_KR',
      mktId: marketId,
      trdDd: baseDate,
      share: '1',
      money: '1',
      csvxls_isNo: 'false',
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: formData.toString(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();
      this.logger.log(`   - ${marketName}: ${data.OutBlock_1?.length || 0}개 종목`);

      if (data.OutBlock_1) {
        return data.OutBlock_1.map((item: any) => ({
          Code: item.ISU_SRT_CD,
          ISU_CD: item.ISU_CD || '',
          Name: item.ISU_ABBRV,
          Market: marketName,
          Dept: item.MKT_NM || '',
          Close: item.TDD_CLSPRC?.replace(/,/g, '') || '0',
          ChangeCode: this.getChangeCode(item.CMPPREVDD_PRC),
          Changes: this.parseNumber(item.CMPPREVDD_PRC),
          ChagesRatio: this.parseFloat(item.FLUC_RT),
          Open: this.parseNumber(item.TDD_OPNPRC),
          High: this.parseNumber(item.TDD_HGPRC),
          Low: this.parseNumber(item.TDD_LWPRC),
          Volume: this.parseNumber(item.ACC_TRDVOL),
          Amount: this.parseNumber(item.ACC_TRDVAL),
          Marcap: this.parseNumber(item.MKTCAP),
          Stocks: this.parseNumber(item.LIST_SHRS),
          TreasuryStocks: 0,
          TreasuryRatio: 0,
          MarketId: marketId,
        }));
      }
      return [];
    } catch (error) {
      this.logger.error(`   ❌ ${marketName} 조회 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  private getLastBusinessDay(): string {
    const today = new Date();
    const hour = today.getHours();
    
    // 16시 이전이면 전일 데이터 사용
    if (hour < 16) {
      today.setDate(today.getDate() - 1);
    }
    
    const day = today.getDay();
    if (day === 0) today.setDate(today.getDate() - 2); // 일요일 -> 금요일
    else if (day === 6) today.setDate(today.getDate() - 1); // 토요일 -> 금요일
    
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const date = String(today.getDate()).padStart(2, '0');
    
    return `${year}${month}${date}`;
  }

  private getChangeCode(changes: string): string {
    const num = this.parseNumber(changes);
    if (num > 0) return '1';
    if (num < 0) return '2';
    return '3';
  }

  private parseNumber(value: string): number {
    if (!value || value === '-' || value === 'N/A') return 0;
    const num = parseInt(value.replace(/,/g, ''), 10);
    return isNaN(num) ? 0 : num;
  }

  private parseFloat(value: string): number {
    if (!value || value === '-' || value === 'N/A') return 0;
    const num = Number.parseFloat(value.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  }
}

