import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType({ description: 'KRX 주식 정보' })
export class Stock {
  @Field(() => Int)
  id: number;

  @Field(() => String, { description: '종목 코드' })
  code: string;

  @Field(() => String, { description: 'ISIN 코드' })
  isuCd: string;

  @Field(() => String, { description: '종목명' })
  name: string;

  @Field(() => String, { description: '시장 구분 (KOSPI/KOSDAQ)' })
  market: string;

  @Field(() => String, { description: '시장 ID' })
  marketId: string;

  @Field(() => String, { nullable: true, description: '부서' })
  dept?: string;

  @Field(() => Float, { description: '종가' })
  close: number;

  @Field(() => String, { description: '변동 코드' })
  changeCode: string;

  @Field(() => Float, { description: '전일 대비' })
  changes: number;

  @Field(() => Float, { description: '등락률 (%)' })
  chagesRatio: number;

  @Field(() => Float, { description: '시가' })
  open: number;

  @Field(() => Float, { description: '고가' })
  high: number;

  @Field(() => Float, { description: '저가' })
  low: number;

  @Field(() => Float, { description: '거래량' })
  volume: number;

  @Field(() => Float, { description: '거래대금' })
  amount: number;

  @Field(() => Float, { description: '시가총액' })
  marcap: number;

  @Field(() => Float, { description: '상장주식수' })
  stocks: number;

  @Field(() => Float, { description: '자기주식수' })
  treasuryStocks: number;

  @Field(() => Float, { description: '자기주식비율 (%)' })
  treasuryRatio: number;

  @Field(() => Float, { nullable: true, description: 'EPS (주당순이익)' })
  eps?: number;

  @Field(() => Float, { nullable: true, description: 'BPS (주당순자산가치)' })
  bps?: number;

  @Field(() => Float, { nullable: true, description: '10년가치' })
  tenYearValue?: number;

  @Field(() => Float, { nullable: true, description: '10년승수' })
  tenYearMultiple?: number;

  @Field(() => Float, { nullable: true, description: '주식가치' })
  stockValue?: number;

  @Field(() => Float, { nullable: true, description: 'ROE (자기자본이익률)' })
  roe?: number;

  @Field(() => Float, { nullable: true, description: 'PER (주가수익비율)' })
  per?: number;

  @Field(() => Float, { nullable: true, description: 'PBR (주가순자산비율)' })
  pbr?: number;

  @Field(() => Float, { nullable: true, description: '배당수익률 (%)' })
  dividendYield?: number;

  @Field(() => Boolean, { description: '목록 제외 여부' })
  exclude: boolean;

  @Field(() => Boolean, { description: '좋아요 여부' })
  favorite: boolean;

  @Field(() => [String], { description: '태그 목록' })
  tags: string[];

  @Field(() => Date, { description: '데이터 기준일' })
  dataDate: Date;

  @Field(() => Date, { description: '생성일' })
  createdAt: Date;

  @Field(() => Date, { description: '수정일' })
  updatedAt: Date;
}
