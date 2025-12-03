import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CalculateIntrinsicValueDto {
  @ApiProperty({
    description: '종목 코드 (6자리)',
    example: '005930',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  stockCode: string;
}

export class FinancialData {
  @ApiProperty({ description: '연도' })
  year: number;

  @ApiProperty({ description: 'EPS (주당순이익)' })
  eps: number | null;

  @ApiProperty({ description: 'BPS (주당순자산가치)' })
  bps: number | null;

  @ApiProperty({ description: 'ROE (자기자본이익률)' })
  roe: number | null;

  @ApiProperty({ description: 'PER (주가수익비율)' })
  per: number | null;

  @ApiProperty({ description: 'PBR (주가순자산비율)' })
  pbr: number | null;
}

export class IntrinsicValueResult {
  @ApiProperty({ description: '종목 코드' })
  stockCode: string;

  @ApiProperty({ description: '종목명' })
  stockName: string;

  @ApiProperty({ description: '현재 주가' })
  currentPrice: number;

  @ApiProperty({ description: 'EPS 가중평균' })
  weightedEps: number;

  @ApiProperty({ description: '최근 BPS' })
  latestBps: number;

  @ApiProperty({ description: '기본 내재가치' })
  basicIntrinsicValue: number;

  @ApiProperty({ description: '자기주식 비율 (%)' })
  treasuryStockRatio: number;

  @ApiProperty({ description: '배당수익률 (%)' })
  dividendYield: number | null;

  @ApiProperty({ description: '조정된 내재가치 (자기주식 반영)' })
  adjustedIntrinsicValue: number;

  @ApiProperty({ description: '안전마진 (%)' })
  safetyMargin: number;

  @ApiProperty({ description: '과거 재무 데이터' })
  financialHistory: FinancialData[];

  @ApiProperty({ description: '계산 기준일' })
  calculatedAt: string;

  @ApiProperty({ description: '투자 의견' })
  recommendation: string;
}

