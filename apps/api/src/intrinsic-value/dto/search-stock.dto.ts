import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchStockDto {
  @ApiProperty({
    description: '검색할 종목명',
    example: '삼성전자',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  keyword: string;
}

export class StockSearchResult {
  @ApiProperty({ description: '종목 코드' })
  code: string;

  @ApiProperty({ description: '종목명' })
  name: string;

  @ApiProperty({ description: '시장 (KOSPI/KOSDAQ)' })
  market: string;
}

