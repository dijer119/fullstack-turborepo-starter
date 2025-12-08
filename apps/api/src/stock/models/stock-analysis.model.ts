import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType({ description: '주요 재무 지표' })
export class KeyFinancials {
    @Field({ description: '매출' })
    revenue: string;

    @Field({ description: '영업이익' })
    operatingIncome: string;
}

@ObjectType({ description: '뉴스 항목' })
export class NewsItem {
    @Field({ description: '뉴스 제목' })
    title: string;

    @Field({ description: '언론사명' })
    source: string;

    @Field({ description: '기사 URL' })
    link: string;
}

@ObjectType({ description: '주식 분석 결과' })
export class StockAnalysis {
    @Field({ description: '종목명' })
    symbol: string;

    @Field({ description: '현재 주가' })
    currentPrice: string;

    @Field({ description: '시장 상황' })
    marketStatus: string;

    @Field({ description: '버핏의 한줄 평' })
    buffettOpinion: string;

    @Field(() => KeyFinancials, { description: '주요 재무 지표' })
    keyFinancials: KeyFinancials;

    @Field(() => [NewsItem], { description: '관련 뉴스' })
    news: NewsItem[];
}
