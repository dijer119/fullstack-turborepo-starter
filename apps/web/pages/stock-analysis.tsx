import { useState } from 'react';
import Head from 'next/head';
import Header from '../src/components/Header';
import {
    Search,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Newspaper,
    BarChart3,
    Loader2,
    AlertCircle,
    ExternalLink
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAnalyzeStockMutation, StockAnalysis } from '../src/store/services/stock-api';

// Utility function for class names
function cn(...inputs: (string | undefined | null | boolean)[]) {
    return twMerge(clsx(inputs));
}

export default function StockAnalysisPage() {
    const [searchInput, setSearchInput] = useState('');
    const [analyzeStock, { isLoading, error, data: analysis }] = useAnalyzeStockMutation();

    const handleAnalyze = async () => {
        if (!searchInput.trim()) return;
        await analyzeStock({ symbol: searchInput.trim() });
    };

    // Extract error message from RTK Query error
    let errorMessage: string | null = null;
    if (error) {
        const errorObj = error as { data?: { errors?: Array<{ message?: string }> } };
        if (errorObj.data?.errors?.[0]?.message) {
            errorMessage = errorObj.data.errors[0].message;
        } else {
            errorMessage = 'Failed to analyze stock';
        }
    }

    return (
        <>
            <Head>
                <title>버핏분석 - 실시간 주식 분석</title>
                <meta name="description" content="워렌 버핏 스타일의 실시간 주식 분석" />
            </Head>

            <div className="min-h-screen bg-fintech-bg">
                <Header />

                <main className="max-w-5xl mx-auto px-4 py-8">
                    {/* Page Title */}
                    <div className="text-center mb-10">
                        <h1 className="text-4xl font-bold text-fintech-text mb-3">
                            🎩 버핏의 투자 인사이트
                        </h1>
                        <p className="text-fintech-muted text-lg">
                            Gemini AI + Google Search로 실시간 주식 분석
                        </p>
                    </div>

                    {/* Search Section */}
                    <div className="bg-fintech-card rounded-2xl p-6 mb-8 border border-fintech-border shadow-xl">
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-fintech-muted" />
                                <input
                                    type="text"
                                    placeholder="종목명을 입력하세요 (예: 삼성전자, AAPL, 테슬라)"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                                    className={cn(
                                        "w-full pl-12 pr-4 py-4 rounded-xl",
                                        "bg-fintech-bg border border-fintech-border",
                                        "text-fintech-text placeholder-fintech-muted",
                                        "focus:outline-none focus:ring-2 focus:ring-fintech-accent focus:border-transparent",
                                        "transition-all duration-200"
                                    )}
                                />
                            </div>
                            <button
                                onClick={handleAnalyze}
                                disabled={isLoading || !searchInput.trim()}
                                className={cn(
                                    "px-8 py-4 rounded-xl font-semibold",
                                    "bg-fintech-accent text-fintech-bg",
                                    "hover:bg-green-400 transition-all duration-200",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    "flex items-center gap-2"
                                )}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        분석중...
                                    </>
                                ) : (
                                    <>
                                        <TrendingUp className="w-5 h-5" />
                                        분석하기
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Error Message */}
                    {errorMessage && (
                        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 mb-8 flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                            <p className="text-red-400">{errorMessage}</p>
                        </div>
                    )}

                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="relative">
                                <div className="w-20 h-20 border-4 border-fintech-border rounded-full animate-pulse" />
                                <div className="absolute inset-0 w-20 h-20 border-4 border-fintech-accent border-t-transparent rounded-full animate-spin" />
                            </div>
                            <p className="mt-6 text-fintech-muted text-lg">버핏이 시장을 분석하고 있습니다...</p>
                            <p className="mt-2 text-fintech-muted/60 text-sm">Google Search로 실시간 데이터를 수집 중</p>
                        </div>
                    )}

                    {/* Analysis Results */}
                    {analysis && !isLoading && (
                        <div className="space-y-6 animate-fadeIn">
                            {/* Stock Header */}
                            <div className="bg-fintech-card rounded-2xl p-6 border border-fintech-border">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-2xl font-bold text-fintech-text">{analysis.symbol}</h2>
                                        <p className="text-fintech-muted mt-1">{analysis.marketStatus}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-3xl font-bold text-fintech-accent flex items-center gap-2">
                                            <DollarSign className="w-7 h-7" />
                                            {analysis.currentPrice}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Buffett's Opinion */}
                            <div className="bg-gradient-to-br from-fintech-card to-fintech-card/80 rounded-2xl p-6 border border-fintech-accent/30 relative overflow-hidden">
                                <div className="absolute top-4 right-4 text-6xl opacity-10">🎩</div>
                                <h3 className="text-lg font-semibold text-fintech-accent mb-3 flex items-center gap-2">
                                    <span className="text-2xl">💬</span> 버핏의 한마디
                                </h3>
                                <blockquote className="text-fintech-text text-xl italic leading-relaxed">
                                    "{analysis.buffettOpinion}"
                                </blockquote>
                            </div>

                            {/* Key Financials */}
                            <div className="bg-fintech-card rounded-2xl p-6 border border-fintech-border">
                                <h3 className="text-lg font-semibold text-fintech-text mb-4 flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-fintech-accent" />
                                    주요 재무 지표
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-fintech-bg rounded-xl p-4 border border-fintech-border">
                                        <p className="text-fintech-muted text-sm mb-1">매출</p>
                                        <p className="text-fintech-text text-xl font-bold">{analysis.keyFinancials.revenue}</p>
                                    </div>
                                    <div className="bg-fintech-bg rounded-xl p-4 border border-fintech-border">
                                        <p className="text-fintech-muted text-sm mb-1">영업이익</p>
                                        <p className="text-fintech-text text-xl font-bold">{analysis.keyFinancials.operatingIncome}</p>
                                    </div>
                                </div>
                            </div>

                            {/* News Section */}
                            {analysis.news && analysis.news.length > 0 && (
                                <div className="bg-fintech-card rounded-2xl p-6 border border-fintech-border">
                                    <h3 className="text-lg font-semibold text-fintech-text mb-4 flex items-center gap-2">
                                        <Newspaper className="w-5 h-5 text-fintech-accent" />
                                        최신 뉴스
                                    </h3>
                                    <div className="space-y-3">
                                        {analysis.news.map((item, index) => (
                                            <a
                                                key={index}
                                                href={item.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={cn(
                                                    "block bg-fintech-bg rounded-xl p-4 border border-fintech-border",
                                                    "hover:border-fintech-accent/50 hover:bg-fintech-border/30",
                                                    "transition-all duration-200 group"
                                                )}
                                            >
                                                <div className="flex justify-between items-start gap-3">
                                                    <div>
                                                        <p className="text-fintech-text font-medium group-hover:text-fintech-accent transition-colors">
                                                            {item.title}
                                                        </p>
                                                        <p className="text-fintech-muted text-sm mt-1">{item.source}</p>
                                                    </div>
                                                    <ExternalLink className="w-4 h-4 text-fintech-muted group-hover:text-fintech-accent flex-shrink-0" />
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Empty State */}
                    {!analysis && !isLoading && !error && (
                        <div className="text-center py-16">
                            <div className="text-6xl mb-4">📊</div>
                            <h3 className="text-xl font-semibold text-fintech-text mb-2">
                                분석할 종목을 입력하세요
                            </h3>
                            <p className="text-fintech-muted">
                                삼성전자, AAPL, 테슬라, NVDA 등 어떤 종목이든 분석해 드립니다
                            </p>
                        </div>
                    )}
                </main>
            </div>

            <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
      `}</style>
        </>
    );
}
