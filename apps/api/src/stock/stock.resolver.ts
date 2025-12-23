import { Args, Mutation, Query, Resolver, Int } from '@nestjs/graphql';
import { StockAnalysis } from './models/stock-analysis.model';
import { Stock } from './entities/stock.entity';
import { StockListResponse } from './dto/stock-list-response.dto';
import { StockService } from './stock.service';
import { PrismaService } from '../persistence/prisma/prisma.service';

@Resolver(() => Stock)
export class StockResolver {
    constructor(
        private readonly stockService: StockService,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * 주식 분석 (AI - 버핏 스타일)
     */
    @Mutation(() => StockAnalysis, { description: '주식 분석 (버핏 스타일)' })
    async analyzeStock(
        @Args('symbol', { description: '분석할 종목명' }) symbol: string,
    ): Promise<StockAnalysis> {
        return this.stockService.analyzeStock(symbol);
    }

    /**
     * 전체 주식 목록 조회 (페이지네이션 + 필터링)
     */
    @Query(() => StockListResponse, { name: 'stocks', description: '주식 목록 조회' })
    async getStocks(
        @Args('skip', { type: () => Int, nullable: true, defaultValue: 0 }) skip: number,
        @Args('take', { type: () => Int, nullable: true, defaultValue: 20 }) take: number,
        @Args('market', { type: () => String, nullable: true }) market?: string,
        @Args('includeExcluded', { type: () => Boolean, nullable: true, defaultValue: false }) includeExcluded?: boolean,
        @Args('sortBy', { type: () => String, nullable: true, defaultValue: 'stockValue' }) sortBy?: string,
        @Args('sortOrder', { type: () => String, nullable: true, defaultValue: 'desc' }) sortOrder?: 'asc' | 'desc',
        @Args('onlyFavorite', { type: () => Boolean, nullable: true, defaultValue: false }) onlyFavorite?: boolean,
        @Args('minRoe', { type: () => Int, nullable: true }) minRoe?: number,
        @Args('minDividendYield', { type: () => Int, nullable: true }) minDividendYield?: number,
        @Args('tags', { type: () => [String], nullable: true }) tags?: string[],
    ): Promise<StockListResponse> {
        return this.stockService.findAll(
            skip,
            take,
            market,
            includeExcluded || false,
            sortBy || 'stockValue',
            sortOrder || 'desc',
            onlyFavorite || false,
            minRoe,
            minDividendYield,
            tags
        );
    }

    /**
     * 종목 코드로 주식 조회
     */
    @Query(() => Stock, { name: 'stock', description: '종목 코드로 주식 조회', nullable: true })
    async getStock(
        @Args('code', { type: () => String }) code: string,
    ): Promise<Stock | null> {
        return this.stockService.findByCode(code);
    }

    /**
     * 주식 검색 (종목명 또는 코드)
     */
    @Query(() => [Stock], { name: 'searchStocks', description: '주식 검색 (종목명 또는 코드)' })
    async searchStocks(
        @Args('keyword', { type: () => String }) keyword: string,
        @Args('limit', { type: () => Int, nullable: true, defaultValue: 10 }) limit: number,
    ): Promise<Stock[]> {
        return this.stockService.search(keyword, limit);
    }

    /**
     * 시장별 주식 개수 조회
     */
    @Query(() => Int, { name: 'stockCount', description: '시장별 주식 개수' })
    async getStockCount(
        @Args('market', { type: () => String, nullable: true }) market?: string,
    ): Promise<number> {
        return this.stockService.count(market);
    }

    /**
     * 모든 태그 목록 조회
     */
    @Query(() => [String], { name: 'allTags', description: '모든 태그 목록' })
    async getAllTags(): Promise<string[]> {
        return this.stockService.getAllTags();
    }

    /**
     * 주식 제외 상태 토글
     */
    @Mutation(() => Stock, { description: '주식 제외 상태 토글' })
    async toggleStockExclude(
        @Args('id', { type: () => Int }) id: number,
    ): Promise<Stock> {
        const stock = await this.prisma.stock.findUnique({ where: { id } });
        if (!stock) {
            throw new Error('Stock not found');
        }

        const updated = await this.prisma.stock.update({
            where: { id },
            data: { exclude: !stock.exclude },
        });

        return this.stockService.mapToStockEntity(updated);
    }

    /**
     * 주식 좋아요 상태 토글
     */
    @Mutation(() => Stock, { description: '주식 좋아요 상태 토글' })
    async toggleStockFavorite(
        @Args('id', { type: () => Int }) id: number,
    ): Promise<Stock> {
        const stock = await this.prisma.stock.findUnique({ where: { id } });
        if (!stock) {
            throw new Error('Stock not found');
        }

        const updated = await this.prisma.stock.update({
            where: { id },
            data: { favorite: !stock.favorite },
        });

        return this.stockService.mapToStockEntity(updated);
    }

    /**
     * 주식에 태그 추가
     */
    @Mutation(() => Stock, { description: '주식에 태그 추가' })
    async addTagToStock(
        @Args('id', { type: () => Int }) id: number,
        @Args('tag', { type: () => String }) tag: string,
    ): Promise<Stock> {
        const stock = await this.prisma.stock.findUnique({ where: { id } });
        if (!stock) {
            throw new Error('Stock not found');
        }

        // 중복 태그 방지
        const tags = stock.tags || [];
        if (!tags.includes(tag)) {
            tags.push(tag);
        }

        const updated = await this.prisma.stock.update({
            where: { id },
            data: { tags },
        });

        // 태그 캐시 무효화
        this.stockService.invalidateTagsCache();

        return this.stockService.mapToStockEntity(updated);
    }

    /**
     * 주식에서 태그 제거
     */
    @Mutation(() => Stock, { description: '주식에서 태그 제거' })
    async removeTagFromStock(
        @Args('id', { type: () => Int }) id: number,
        @Args('tag', { type: () => String }) tag: string,
    ): Promise<Stock> {
        const stock = await this.prisma.stock.findUnique({ where: { id } });
        if (!stock) {
            throw new Error('Stock not found');
        }

        const tags = (stock.tags || []).filter(t => t !== tag);

        const updated = await this.prisma.stock.update({
            where: { id },
            data: { tags },
        });

        // 태그 캐시 무효화
        this.stockService.invalidateTagsCache();

        return this.stockService.mapToStockEntity(updated);
    }
}
