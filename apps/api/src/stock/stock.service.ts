import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { StockAnalysis } from './models/stock-analysis.model';

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

    constructor(private readonly configService: ConfigService) { }

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
}
