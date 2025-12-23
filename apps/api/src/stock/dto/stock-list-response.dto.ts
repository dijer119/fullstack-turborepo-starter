import { ObjectType, Field, Int } from '@nestjs/graphql';
import { Stock } from '../entities/stock.entity';

@ObjectType({ description: '주식 목록 응답' })
export class StockListResponse {
  @Field(() => [Stock], { description: '주식 목록' })
  stocks: Stock[];

  @Field(() => Int, { description: '전체 개수' })
  total: number;

  @Field(() => Int, { description: '스킵' })
  skip: number;

  @Field(() => Int, { description: '가져온 개수' })
  take: number;
}
