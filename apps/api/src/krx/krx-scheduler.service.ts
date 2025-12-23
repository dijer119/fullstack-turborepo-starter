import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../persistence/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

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
  EPS?: number;
  BPS?: number;
}

@Injectable()
export class KrxSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(KrxSchedulerService.name);
  private readonly dataPath = path.join(process.cwd(), 'data', 'krx_stocks.json');

  private readonly defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': 'https://data.krx.co.kr',
    'Referer': 'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201',
    'X-Requested-With': 'XMLHttpRequest',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('KRX 스케줄러 초기화');
    this.logger.log(`데이터 파일 경로: ${this.dataPath}`);

    // 파일이 없으면 백그라운드에서 비동기 업데이트 (서버 시작을 차단하지 않음)
    if (!fs.existsSync(this.dataPath)) {
      this.logger.log('KRX 데이터 파일이 없습니다. 백그라운드에서 업데이트를 시작합니다...');
      // 비동기로 실행하여 서버 시작을 차단하지 않음
      this.updateKrxStocks().catch(error => {
        this.logger.error('백그라운드 KRX 데이터 업데이트 실패:', error);
      });
    }
  }

  /**
   * 매시 정각에 KRX 종목 데이터 업데이트
   * 장 운영 시간(09:00~16:00)에만 실행
   */
  // @Cron('0 * 9-16 * * 1-5', {
  //   name: 'updateKrxStocks',
  //   timeZone: 'Asia/Seoul',
  // })
  // async handleCron() {
  //   this.logger.log('⏰ 정기 KRX 종목 업데이트 시작');
  //   await this.updateKrxStocks();
  // }

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
   * 3시간마다 EPS/BPS 데이터만 업데이트
   */
  @Cron('0 */3 * * *', {
    name: 'updateEpsBpsOnly',
    timeZone: 'Asia/Seoul',
  })
  async handleEpsBpsUpdateCron() {
    this.logger.log('⏰ 정기 EPS/BPS 업데이트 시작 (3시간마다)');
    const result = await this.updateEpsAndBps();
    this.logger.log(`✅ EPS/BPS 업데이트 완료: 성공 ${result.success}개, 실패 ${result.fail}개`);
  }

  /**
   * KRX 종목 데이터 수동 업데이트
   * @param includeEpsBps - EPS/BPS 정보도 함께 수집할지 여부 (기본값: false)
   */
  async updateKrxStocks(includeEpsBps: boolean = false): Promise<void> {
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

      // EPS/BPS 정보 수집 (옵션)
      if (includeEpsBps) {
        this.logger.log(`📊 EPS/BPS 정보 수집 시작 (${allStocks.length}개 종목)`);

        // 모든 종목에 대해 EPS/BPS 정보 가져오기
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < allStocks.length; i++) {
          const stock = allStocks[i];

          try {
            const financialData = await this.fetchFinancialDataFromNaver(stock.Code);
            if (financialData) {
              stock.EPS = financialData.eps;
              stock.BPS = financialData.bps;
              successCount++;
            } else {
              failCount++;
            }

            // 진행 상황 로그 (100개마다)
            if ((i + 1) % 100 === 0) {
              this.logger.log(`   진행: ${i + 1}/${allStocks.length} (성공: ${successCount}, 실패: ${failCount})`);
            }

            // 50ms 대기 (마지막 종목은 대기 안함)
            if (i < allStocks.length - 1) {
              await this.sleep(50);
            }
          } catch (error) {
            failCount++;
            this.logger.warn(`   종목 ${stock.Code}(${stock.Name}) 재무 데이터 조회 실패`);
          }
        }

        this.logger.log(`✅ EPS/BPS 수집 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
      } else {
        this.logger.log('⏭️ EPS/BPS 수집 건너뜀 (기존 데이터 유지)');
      }

      // 데이터베이스에 저장 (upsert)
      this.logger.log('💾 데이터베이스 업데이트 시작');

      let dbSuccessCount = 0;
      let dbFailCount = 0;

      // 배치 처리를 위한 설정
      const BATCH_SIZE = 50; // 한 번에 처리할 종목 수
      const BATCH_DELAY = 100; // 배치 간 대기 시간 (ms)

      for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
        const batch = allStocks.slice(i, Math.min(i + BATCH_SIZE, allStocks.length));

        // 배치 내 병렬 처리
        const batchPromises = batch.map(async (stock) => {
          try {
            const updateData: any = {
              isuCd: stock.ISU_CD,
              name: stock.Name,
              market: stock.Market,
              marketId: stock.MarketId,
              dept: stock.Dept,
              close: stock.Close,
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
              dataDate: new Date(),
            };

            // EPS/BPS는 수집한 경우에만 업데이트
            if (includeEpsBps) {
              updateData.eps = stock.EPS;
              updateData.bps = stock.BPS;
            }

            // 타임아웃 설정과 함께 upsert 실행
            await this.prisma.$transaction(
              async (tx) => {
                await tx.stock.upsert({
                  where: { code: stock.Code },
                  update: updateData,
                  create: {
                    code: stock.Code,
                    isuCd: stock.ISU_CD,
                    name: stock.Name,
                    market: stock.Market,
                    marketId: stock.MarketId,
                    dept: stock.Dept,
                    close: stock.Close,
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
                    bps: stock.BPS,
                    dataDate: new Date(),
                  },
                });
              },
              {
                maxWait: 5000, // 트랜잭션 시작 대기 시간 (ms)
                timeout: 10000, // 트랜잭션 실행 타임아웃 (ms)
              }
            );

            dbSuccessCount++;
            return { success: true, stock };
          } catch (error) {
            dbFailCount++;
            // 더 자세한 에러 정보 로깅
            if (error instanceof Error) {
              // 타임아웃 에러 특별 처리
              if (error.message.includes('statement timeout') || error.message.includes('57014')) {
                this.logger.error(`   DB 타임아웃 ${stock.Code} (${stock.Name}): 쿼리 실행 시간 초과`);
              } else {
                this.logger.error(`   DB 저장 실패 ${stock.Code} (${stock.Name}): ${error.message || '알 수 없는 오류'}`);
              }

              // Prisma 에러의 경우 추가 정보 출력
              if (error.message && (error.message.includes('Prisma') || error.name === 'PrismaClientKnownRequestError')) {
                const errorDetails = {
                  name: error.name,
                  message: error.message,
                  code: (error as any).code,
                };
                this.logger.error(`   에러 세부사항: ${JSON.stringify(errorDetails)}`);
              }
            } else {
              this.logger.error(`   DB 저장 실패 ${stock.Code}: ${String(error)}`);
            }
            return { success: false, stock, error };
          }
        });

        // 배치 처리 완료 대기
        await Promise.all(batchPromises);

        // 진행 상황 로그 (배치마다)
        if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= allStocks.length) {
          this.logger.log(`   진행: ${Math.min(i + BATCH_SIZE, allStocks.length)}/${allStocks.length} (성공: ${dbSuccessCount}, 실패: ${dbFailCount})`);
        }

        // 다음 배치 전 대기 (마지막 배치는 제외)
        if (i + BATCH_SIZE < allStocks.length) {
          await this.sleep(BATCH_DELAY);
        }
      }

      this.logger.log(`✅ 데이터베이스 업데이트 완료: 성공 ${dbSuccessCount}개, 실패 ${dbFailCount}개`);

      // 백업용 JSON 파일 저장
      const dataDir = path.dirname(this.dataPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
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

    // Add small delay to avoid rate limiting
    await this.sleep(500);

    const url = 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
    
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

  /**
   * 네이버 증권에서 EPS/BPS/배당수익률 정보 가져오기 (PC 버전)
   */
  private async fetchFinancialDataFromNaver(stockCode: string): Promise<{ eps: number | null; bps: number | null; dividendYield: number | null } | null> {
    try {
      const url = `https://finance.naver.com/item/main.naver?code=${stockCode}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      let eps: number | null = null;
      let bps: number | null = null;
      let dividendYield: number | null = null;

      // EPS 값 찾기 (em#_eps 선택자 사용)
      const epsElement = $('#_eps');
      if (epsElement.length > 0) {
        const epsValue = epsElement.text().trim();
        const cleanEpsValue = epsValue.replace(/[^0-9.-]/g, '');
        const parsedEps = Number.parseFloat(cleanEpsValue);
        eps = isNaN(parsedEps) ? null : parsedEps;
      }

      // BPS 값 찾기 (PBR 다음에 있는 em 태그)
      const pbrElement = $('#_pbr');
      if (pbrElement.length > 0) {
        // PBR 부모 td에서 다음 em 찾기
        const bpsElement = pbrElement.parent().find('em').not('#_pbr').first();
        if (bpsElement.length > 0) {
          const bpsValue = bpsElement.text().trim();
          const cleanBpsValue = bpsValue.replace(/[^0-9.-]/g, '');
          const parsedBps = Number.parseFloat(cleanBpsValue);
          bps = isNaN(parsedBps) ? null : parsedBps;
        }
      }

      // 배당수익률 찾기 (em#_dvr 선택자 사용)
      const dvrElement = $('#_dvr');
      if (dvrElement.length > 0) {
        const dvrValue = dvrElement.text().trim();
        const cleanDvrValue = dvrValue.replace(/[^0-9.-]/g, '');
        const parsedDvr = Number.parseFloat(cleanDvrValue);
        dividendYield = isNaN(parsedDvr) ? null : parsedDvr;
      }

      // EPS, BPS, 배당수익률 중 하나라도 있으면 반환
      if (eps !== null || bps !== null || dividendYield !== null) {
        return { eps, bps, dividendYield };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 데이터베이스 종목의 EPS/BPS만 업데이트
   */
  async updateEpsAndBps(): Promise<{ success: number; fail: number; failedStocks: string[] }> {
    try {
      this.logger.log('🚀 데이터베이스 종목 EPS/BPS 업데이트 시작');

      // 데이터베이스에서 모든 종목 가져오기
      const dbStocks = await this.prisma.stock.findMany({
        orderBy: { name: 'asc' },
      });

      if (dbStocks.length === 0) {
        this.logger.warn('데이터베이스에 종목이 없습니다');
        return { success: 0, fail: 0, failedStocks: [] };
      }

      this.logger.log(`📊 EPS/BPS 정보 수집 시작 (${dbStocks.length}개 종목)`);

      let successCount = 0;
      let failCount = 0;
      const failedStocks: string[] = [];

      for (let i = 0; i < dbStocks.length; i++) {
        const stock = dbStocks[i];

        try {
          const financialData = await this.fetchFinancialDataFromNaver(stock.code);
          if (financialData && (financialData.eps !== null || financialData.bps !== null || financialData.dividendYield !== null)) {
            // 10년가치, 10년승수, 주식가치, ROE, PER, PBR 계산
            let tenYearValue = null;
            let tenYearMultiple = null;
            let stockValue = null;
            let roe = null;
            let per = null;
            let pbr = null;

            const currentPrice = parseFloat(stock.close.toString());

            if (financialData.eps !== null && financialData.bps !== null && financialData.bps > 0) {
              // ROE = EPS / BPS * 100 (자기자본이익률 %)
              roe = (financialData.eps / financialData.bps) * 100;

              // 10년가치 = BPS*(1+(EPS/BPS))^10
              const growthRate = 1 + (financialData.eps / financialData.bps);
              tenYearValue = financialData.bps * Math.pow(growthRate, 10);

              // 10년승수 = ten_year_value / 현재가
              if (currentPrice > 0) {
                tenYearMultiple = tenYearValue / currentPrice;

                // 주식가치 = (10^(LOG10(ten_year_multiple)/10)-1)*100
                if (tenYearMultiple > 0) {
                  stockValue = (Math.pow(10, Math.log10(tenYearMultiple) / 10) - 1) * 100;
                }

                // PBR = 현재가 / BPS (주가순자산비율)
                pbr = currentPrice / financialData.bps;
              }
            }

            // PER = 현재가 / EPS (주가수익비율)
            if (financialData.eps !== null && financialData.eps > 0 && currentPrice > 0) {
              per = currentPrice / financialData.eps;
            }

            // EPS/BPS/배당수익률 및 계산값 업데이트
            await this.prisma.stock.update({
              where: { id: stock.id },
              data: {
                eps: financialData.eps,
                bps: financialData.bps,
                dividendYield: financialData.dividendYield,
                tenYearValue: tenYearValue,
                tenYearMultiple: tenYearMultiple,
                stockValue: stockValue,
                roe: roe,
                per: per,
                pbr: pbr,
              },
            });
            successCount++;
          } else {
            failCount++;
            failedStocks.push(`${stock.name}(${stock.code})`);
          }

          // 진행 상황 로그 (100개마다)
          if ((i + 1) % 100 === 0) {
            this.logger.log(`   진행: ${i + 1}/${dbStocks.length} (성공: ${successCount}, 실패: ${failCount})`);
          }

          // 50ms 대기 (마지막 종목은 대기 안함)
          if (i < dbStocks.length - 1) {
            await this.sleep(50);
          }
        } catch (error) {
          failCount++;
          failedStocks.push(`${stock.name}(${stock.code})`);
          this.logger.warn(`   종목 ${stock.code}(${stock.name}) 재무 데이터 조회 실패`);
        }
      }

      this.logger.log(`✅ EPS/BPS 업데이트 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

      // 실패 종목이 있으면 로그 출력
      if (failedStocks.length > 0) {
        this.logger.warn(`❌ 실패 종목 (${failedStocks.length}개):`);
        // 처음 10개만 로그 출력
        failedStocks.slice(0, 10).forEach(stock => {
          this.logger.warn(`   - ${stock}`);
        });
        if (failedStocks.length > 10) {
          this.logger.warn(`   ... 외 ${failedStocks.length - 10}개`);
        }
      }

      return { success: successCount, fail: failCount, failedStocks };
    } catch (error) {
      this.logger.error(`❌ EPS/BPS 업데이트 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: 0, fail: 0, failedStocks: [] };
    }
  }

  /**
   * Sleep 함수 (밀리초)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

