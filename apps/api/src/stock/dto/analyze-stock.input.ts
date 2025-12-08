import { InputType, Field } from '@nestjs/graphql';

@InputType({ description: '주식 분석 요청 입력' })
export class AnalyzeStockInput {
    @Field({ description: '분석할 종목명 (예: 삼성전자, AAPL, 테슬라)' })
    symbol: string;
}
