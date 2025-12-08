import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { StockAnalysis } from './models/stock-analysis.model';
import { StockService } from './stock.service';

@Resolver(() => StockAnalysis)
export class StockResolver {
    constructor(private readonly stockService: StockService) { }

    @Mutation(() => StockAnalysis, { description: '주식 분석 (버핏 스타일)' })
    async analyzeStock(
        @Args('symbol', { description: '분석할 종목명' }) symbol: string,
    ): Promise<StockAnalysis> {
        return this.stockService.analyzeStock(symbol);
    }
}
