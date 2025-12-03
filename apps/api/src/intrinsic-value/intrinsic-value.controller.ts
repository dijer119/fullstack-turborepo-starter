import { Controller, Get, Query, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { IntrinsicValueService } from './intrinsic-value.service';
import { StockSearchResult } from './dto/search-stock.dto';
import { IntrinsicValueResult } from './dto/calculate-intrinsic-value.dto';

@ApiTags('intrinsic-value')
@Controller('intrinsic-value')
export class IntrinsicValueController {
  constructor(private readonly intrinsicValueService: IntrinsicValueService) {}

  @Get('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '종목 검색', 
    description: '종목명으로 주식을 검색합니다.' 
  })
  @ApiQuery({ 
    name: 'keyword', 
    description: '검색할 종목명', 
    example: '삼성전자' 
  })
  @ApiResponse({ 
    status: 200, 
    description: '검색 결과', 
    type: [StockSearchResult] 
  })
  async searchStock(
    @Query('keyword') keyword: string,
  ): Promise<StockSearchResult[]> {
    if (!keyword || keyword.trim().length === 0) {
      return [];
    }
    return this.intrinsicValueService.searchStock(keyword.trim());
  }

  @Get('popular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '인기 종목 목록', 
    description: '인기 종목 목록을 반환합니다.' 
  })
  @ApiResponse({ 
    status: 200, 
    description: '인기 종목 목록', 
    type: [StockSearchResult] 
  })
  async getPopularStocks(): Promise<StockSearchResult[]> {
    return this.intrinsicValueService.getPopularStocks();
  }

  @Get('calculate/:stockCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '내재가치 계산', 
    description: '종목 코드로 내재가치와 안전마진을 계산합니다.' 
  })
  @ApiParam({ 
    name: 'stockCode', 
    description: '종목 코드 (6자리)', 
    example: '005930' 
  })
  @ApiResponse({ 
    status: 200, 
    description: '내재가치 계산 결과', 
    type: IntrinsicValueResult 
  })
  @ApiResponse({ 
    status: 400, 
    description: '잘못된 종목 코드' 
  })
  @ApiResponse({ 
    status: 500, 
    description: '데이터 조회 실패' 
  })
  async calculateIntrinsicValue(
    @Param('stockCode') stockCode: string,
  ): Promise<IntrinsicValueResult> {
    // 종목 코드 유효성 검사
    if (!stockCode || stockCode.length !== 6 || !/^\d{6}$/.test(stockCode)) {
      throw new Error('유효한 6자리 종목 코드를 입력해주세요.');
    }
    return this.intrinsicValueService.calculateIntrinsicValue(stockCode);
  }

  @Get('price/:stockCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '현재가 조회', 
    description: '종목 코드로 현재가를 조회합니다.' 
  })
  @ApiParam({ 
    name: 'stockCode', 
    description: '종목 코드 (6자리)', 
    example: '005930' 
  })
  @ApiResponse({ 
    status: 200, 
    description: '현재가 정보' 
  })
  async getCurrentPrice(
    @Param('stockCode') stockCode: string,
  ): Promise<{ price: number; name: string }> {
    return this.intrinsicValueService.getCurrentPrice(stockCode);
  }
}

