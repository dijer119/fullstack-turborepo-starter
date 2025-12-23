import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { KrxSchedulerService } from './krx-scheduler.service';
import { KrxSafetyMarginService } from './krx-safety-margin.service';

@ApiTags('KRX')
@Controller('krx')
export class KrxController {
  constructor(
    private readonly krxSchedulerService: KrxSchedulerService,
    private readonly krxSafetyMarginService: KrxSafetyMarginService,
  ) {}

  @Post('update-stocks')
  @ApiOperation({ summary: 'KRX 종목 데이터 수동 업데이트' })
  async updateStocks() {
    await this.krxSchedulerService.updateKrxStocks();
    return { message: 'KRX 종목 데이터 업데이트 완료' };
  }

  @Post('update-eps-bps')
  @ApiOperation({ summary: 'EPS/BPS 데이터만 업데이트 (데이터베이스 종목 기준)' })
  async updateEpsBps() {
    const result = await this.krxSchedulerService.updateEpsAndBps();
    return {
      message: 'EPS/BPS 데이터 업데이트 완료',
      success: result.success,
      fail: result.fail,
      failedStocks: result.failedStocks,
    };
  }

  @Post('calculate-safety-margins')
  @ApiOperation({ summary: '전체 종목 안전마진 계산 (시간 소요)' })
  async calculateSafetyMargins() {
    const results = await this.krxSafetyMarginService.calculateAllSafetyMargins();
    return {
      message: '안전마진 계산 완료',
      total: results.length,
      calculated: results.filter(r => r.safety_margin !== null).length,
      positive: results.filter(r => r.safety_margin !== null && r.safety_margin > 0).length,
    };
  }

  @Get('safety-margins')
  @ApiOperation({ summary: '전체 종목 안전마진 결과 조회' })
  async getSafetyMargins() {
    const fs = await import('fs');
    const path = await import('path');
    
    const resultPath = path.join(process.cwd(), 'data', 'all_safety_margin_results.json');
    
    if (!fs.existsSync(resultPath)) {
      return { message: '안전마진 결과 파일이 없습니다. 먼저 계산을 실행하세요.', results: [] };
    }
    
    const data = fs.readFileSync(resultPath, 'utf-8');
    const results = JSON.parse(data);
    
    return {
      total: results.length,
      calculated: results.filter((r: any) => r.safety_margin !== null).length,
      positive: results.filter((r: any) => r.safety_margin !== null && r.safety_margin > 0).length,
      results,
    };
  }

  @Get('safety-margins/top')
  @ApiOperation({ summary: '안전마진 상위 종목 조회' })
  async getTopSafetyMargins() {
    const fs = await import('fs');
    const path = await import('path');
    
    const resultPath = path.join(process.cwd(), 'data', 'all_safety_margin_results.json');
    
    if (!fs.existsSync(resultPath)) {
      return { message: '안전마진 결과 파일이 없습니다.', results: [] };
    }
    
    const data = fs.readFileSync(resultPath, 'utf-8');
    const results = JSON.parse(data);
    
    // 안전마진이 양수인 종목만 상위 50개
    const topResults = results
      .filter((r: any) => r.safety_margin !== null && r.safety_margin > 0)
      .slice(0, 50);
    
    return {
      total: topResults.length,
      results: topResults,
    };
  }
}

