import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { StockAnalysis } from './models/stock-analysis.model';
import { Stock } from './entities/stock.entity';
import { StockListResponse } from './dto/stock-list-response.dto';

// Warren Buffett persona system instruction
const BUFFETT_SYSTEM_INSTRUCTION = `당신은 전설적인 투자자 워렌 버핏입니다. 
구글 검색 도구를 사용하여 사용자가 요청한 종목의 오늘 현재 주가, 최신 뉴스, 재무 정보를 검색하세요.
그리고 버핏 특유의 위트 있고 통찰력 있는 말투로 투자 의견을 제시하세요.

반드시 다음 JSON 형식으로만 응답하세요. 다른 텍스트는 추가하지 마세요:

{
  "symbol": "종목명 (예: Apple Inc. 또는 삼성전자)",
  "currentPrice": "현재가 (통화 포함, 예: $150.25 또는 75,000원)",
  "marketStatus": "시장 상황 (예: 장중, 장마감, 프리마켓)",
  "buffettOpinion": "버핏의 한줄 평 (예: '자네, 이 기업은 해자가 깊구만. 경쟁사가 따라오려면 수십 년은 걸리겠어.')",
  "keyFinancials": {
    "revenue": "최근 매출 (예: $383.3B 또는 302조원)",
    "operatingIncome": "최근 영업이익 (예: $114.3B 또는 51조원)"
  },
  "news": [
    {
      "title": "뉴스 제목",
      "source": "언론사명",
      "link": "기사 URL"
    }
  ]
}

중요 지침:
1. 반드시 구글 검색을 통해 최신 정보를 찾으세요.
2. 주가는 오늘 또는 가장 최근 거래일 기준으로 제공하세요.
3. 뉴스는 최근 1-2주 이내의 주요 뉴스 3개 이상을 포함하세요.
4. buffettOpinion은 반드시 버핏 특유의 말투로 작성하세요. "자네", "내가 보기에", "해자가 깊다/얕다" 등의 표현을 사용하세요.
5. JSON만 반환하세요. 코드 블록(\`\`\`)이나 설명을 추가하지 마세요.`;

@Injectable()
export class StockService {
    private readonly logger = new Logger(StockService.name);
    private tagsCache: { data: string[] | null; timestamp: number } = { data: null, timestamp: 0 };
    private readonly TAGS_CACHE_TTL = 5 * 60 * 1000; // 5분 캐시

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) { }

    async analyzeStock(symbol: string): Promise<StockAnalysis> {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        const ai = new GoogleGenAI({ apiKey });

        // Google Search Grounding tool
        const groundingTool = { googleSearch: {} };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `${symbol} 주식을 분석해주세요. 현재 주가, 최신 뉴스, 재무 정보를 검색하여 알려주세요.`,
            config: {
                tools: [groundingTool],
                systemInstruction: BUFFETT_SYSTEM_INSTRUCTION,
            },
        });

        const responseText = response.text || '';

        // Extract JSON from response
        let jsonString = responseText;

        // Remove markdown code blocks if present
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonString = jsonMatch[1];
        }

        // Try to find JSON object in the response
        const jsonObjectMatch = jsonString.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
            jsonString = jsonObjectMatch[0];
        }

        try {
            const analysisData: StockAnalysis = JSON.parse(jsonString);

            // Extract grounding metadata for news links if available
            const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
            if (groundingMetadata?.groundingChunks && analysisData.news) {
                const chunks = groundingMetadata.groundingChunks;
                analysisData.news = analysisData.news.map((newsItem, index) => {
                    // Try to match news with grounding chunks
                    const chunk = chunks[index];
                    if (chunk?.web?.uri && (!newsItem.link || newsItem.link === '')) {
                        return { ...newsItem, link: chunk.web.uri };
                    }
                    return newsItem;
                });
            }

            return analysisData;
        } catch (parseError) {
            this.logger.error('JSON parse error:', parseError);
            this.logger.error('Response text:', responseText);
            throw new Error(
                'Failed to parse AI response. Raw response: ' +
                responseText.substring(0, 500),
            );
        }
    }

    /**
     * 전체 주식 목록 조회 (페이지네이션 + 정렬 + 필터링)
     */
    async findAll(
        skip: number = 0,
        take: number = 20,
        market?: string,
        includeExcluded: boolean = false,
        sortBy: string = 'stockValue',
        sortOrder: 'asc' | 'desc' = 'desc',
        onlyFavorite: boolean = false,
        minRoe?: number,
        minDividendYield?: number,
        tags?: string[]
    ): Promise<StockListResponse> {
        const where: any = {};
        if (market) where.market = market;
        if (!includeExcluded) where.exclude = false;
        if (onlyFavorite) where.favorite = true;

        // ROE 필터 (기본값: 0 초과)
        if (minRoe !== undefined && minRoe !== null) {
            where.roe = { gt: minRoe };
        }

        // 배당수익률 필터
        if (minDividendYield !== undefined && minDividendYield !== null) {
            where.dividendYield = { gte: minDividendYield };
        }

        // 태그 필터 - 선택한 모든 태그를 포함하는 주식만 조회
        if (tags && tags.length > 0) {
            where.tags = {
                hasEvery: tags
            };
        }

        // 정렬 필드 매핑
        const orderByMap: any = {
            stockValue: { stockValue: { sort: sortOrder, nulls: 'last' } },
            dividendYield: { dividendYield: { sort: sortOrder, nulls: 'last' } },
            name: { name: sortOrder },
            close: { close: sortOrder },
            chagesRatio: { chagesRatio: sortOrder },
            marcap: { marcap: sortOrder },
        };

        const orderBy = orderByMap[sortBy] || { stockValue: { sort: 'desc', nulls: 'last' } };

        const [stocks, total] = await Promise.all([
            this.prisma.stock.findMany({
                where,
                skip,
                take,
                orderBy,
            }),
            this.prisma.stock.count({ where }),
        ]);

        return {
            stocks: stocks.map(this.mapToStockEntity),
            total,
            skip,
            take,
        };
    }

    /**
     * 종목 코드로 주식 조회
     */
    async findByCode(code: string): Promise<Stock | null> {
        const stock = await this.prisma.stock.findUnique({
            where: { code },
        });

        return stock ? this.mapToStockEntity(stock) : null;
    }

    /**
     * 주식 검색 (종목명 또는 코드)
     */
    async search(keyword: string, limit: number = 10): Promise<Stock[]> {
        const stocks = await this.prisma.stock.findMany({
            where: {
                OR: [
                    { name: { contains: keyword, mode: 'insensitive' } },
                    { code: { contains: keyword } },
                ],
            },
            take: limit,
            orderBy: [
                { stockValue: { sort: 'desc', nulls: 'last' } },  // 검색 결과도 주식가치 높은 순, null은 마지막
                { name: 'asc' }  // 주식가치가 같거나 null인 경우 이름순
            ],
        });

        return stocks.map(this.mapToStockEntity);
    }

    /**
     * 시장별 주식 개수 조회
     */
    async count(market?: string): Promise<number> {
        const where = market ? { market } : {};
        return this.prisma.stock.count({ where });
    }

    /**
     * 모든 태그 목록 조회 (중복 제거, 5분 캐시)
     */
    async getAllTags(): Promise<string[]> {
        const now = Date.now();

        // 캐시가 유효한 경우 캐시된 데이터 반환
        if (this.tagsCache.data && (now - this.tagsCache.timestamp) < this.TAGS_CACHE_TTL) {
            this.logger.debug('Returning cached tags');
            return this.tagsCache.data;
        }

        this.logger.debug('Fetching tags from database');
        const stocks = await this.prisma.stock.findMany({
            where: {
                tags: {
                    isEmpty: false
                }
            },
            select: {
                tags: true
            }
        });

        // 모든 태그를 하나의 배열로 합치고 중복 제거
        const allTags = new Set<string>();
        stocks.forEach(stock => {
            stock.tags.forEach(tag => allTags.add(tag));
        });

        const sortedTags = Array.from(allTags).sort();

        // 캐시 업데이트
        this.tagsCache = {
            data: sortedTags,
            timestamp: now
        };

        return sortedTags;
    }

    /**
     * 태그 캐시 무효화 (태그 추가/삭제 시 호출)
     */
    invalidateTagsCache(): void {
        this.tagsCache = { data: null, timestamp: 0 };
    }

    /**
     * Prisma 모델을 GraphQL Entity로 변환
     */
    public mapToStockEntity(stock: any): Stock {
        return {
            id: stock.id,
            code: stock.code,
            isuCd: stock.isuCd,
            name: stock.name,
            market: stock.market,
            marketId: stock.marketId,
            dept: stock.dept,
            close: parseFloat(stock.close.toString()),
            changeCode: stock.changeCode,
            changes: parseFloat(stock.changes.toString()),
            chagesRatio: parseFloat(stock.chagesRatio.toString()),
            open: parseFloat(stock.open.toString()),
            high: parseFloat(stock.high.toString()),
            low: parseFloat(stock.low.toString()),
            volume: Number(stock.volume),
            amount: Number(stock.amount),
            marcap: Number(stock.marcap),
            stocks: Number(stock.stocks),
            treasuryStocks: Number(stock.treasuryStocks),
            treasuryRatio: parseFloat(stock.treasuryRatio.toString()),
            eps: stock.eps ? parseFloat(stock.eps.toString()) : undefined,
            bps: stock.bps ? parseFloat(stock.bps.toString()) : undefined,
            tenYearValue: stock.tenYearValue ? parseFloat(stock.tenYearValue.toString()) : undefined,
            tenYearMultiple: stock.tenYearMultiple ? parseFloat(stock.tenYearMultiple.toString()) : undefined,
            stockValue: stock.stockValue ? parseFloat(stock.stockValue.toString()) : undefined,
            roe: stock.roe ? parseFloat(stock.roe.toString()) : undefined,
            per: stock.per ? parseFloat(stock.per.toString()) : undefined,
            pbr: stock.pbr ? parseFloat(stock.pbr.toString()) : undefined,
            dividendYield: stock.dividendYield ? parseFloat(stock.dividendYield.toString()) : undefined,
            exclude: stock.exclude || false,
            favorite: stock.favorite || false,
            tags: stock.tags || [],
            dataDate: stock.dataDate,
            createdAt: stock.createdAt,
            updatedAt: stock.updatedAt,
        };
    }
}
