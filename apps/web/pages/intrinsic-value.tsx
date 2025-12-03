import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Header from "../src/components/Header";
import {
  useLazySearchStockQuery,
  useGetPopularStocksQuery,
  useLazyCalculateIntrinsicValueQuery,
  StockSearchResult,
  IntrinsicValueResult,
} from "../src/store/services/intrinsic-value-api";

export default function IntrinsicValuePage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
  const [result, setResult] = useState<IntrinsicValueResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [initialCodeProcessed, setInitialCodeProcessed] = useState(false);

  // API 훅
  const { data: popularStocks } = useGetPopularStocksQuery();
  const [triggerSearch, { data: searchResults, isLoading: searchLoading }] = useLazySearchStockQuery();
  const [triggerCalculate, { isLoading: calculating, error: calculateError }] = useLazyCalculateIntrinsicValueQuery();

  // URL 파라미터에서 종목코드 처리
  useEffect(() => {
    const { code } = router.query;
    if (code && typeof code === 'string' && !initialCodeProcessed) {
      setInitialCodeProcessed(true);
      // 종목코드로 바로 계산 실행
      triggerCalculate(code).unwrap().then((calcResult) => {
        setResult(calcResult);
        setSearchInput(calcResult.stockName);
        setSelectedStock({
          code: calcResult.stockCode,
          name: calcResult.stockName,
          market: '',
        });
      }).catch((err) => {
        console.error("URL 파라미터 종목 계산 실패:", err);
      });
    }
  }, [router.query, triggerCalculate, initialCodeProcessed]);

  // 검색 디바운스
  useEffect(() => {
    if (searchInput.trim().length >= 1 && !initialCodeProcessed) {
      const timer = setTimeout(() => {
        triggerSearch(searchInput.trim());
        setShowDropdown(true);
      }, 300);
      return () => clearTimeout(timer);
    } else if (searchInput.trim().length >= 1) {
      const timer = setTimeout(() => {
        triggerSearch(searchInput.trim());
        setShowDropdown(true);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setShowDropdown(false);
    }
  }, [searchInput, triggerSearch, initialCodeProcessed]);

  // 종목 선택 핸들러
  const handleSelectStock = useCallback(async (stock: StockSearchResult) => {
    setSelectedStock(stock);
    setSearchInput(stock.name);
    setShowDropdown(false);
    
    try {
      const calcResult = await triggerCalculate(stock.code).unwrap();
      setResult(calcResult);
    } catch (err) {
      console.error("계산 실패:", err);
    }
  }, [triggerCalculate]);

  // 인기 종목 클릭
  const handlePopularClick = (stock: StockSearchResult) => {
    handleSelectStock(stock);
  };

  // 안전마진에 따른 색상
  const getSafetyMarginColor = (margin: number) => {
    if (margin >= 30) return "text-emerald-600";
    if (margin >= 10) return "text-green-600";
    if (margin >= -10) return "text-amber-600";
    if (margin >= -30) return "text-orange-600";
    return "text-red-600";
  };

  // 안전마진에 따른 배경색
  const getSafetyMarginBg = (margin: number) => {
    if (margin >= 30) return "bg-emerald-50 border-emerald-200";
    if (margin >= 10) return "bg-green-50 border-green-200";
    if (margin >= -10) return "bg-amber-50 border-amber-200";
    if (margin >= -30) return "bg-orange-50 border-orange-200";
    return "bg-red-50 border-red-200";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* 공통 헤더 */}
      <Header />

      {/* 배경 패턴 */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }}></div>
      </div>

      <div className="relative container mx-auto px-4 py-8 max-w-5xl">
        {/* 페이지 타이틀 */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 mb-3">
            💎 내재가치 계산기
          </h1>
          <p className="text-slate-400 text-lg">
            벤자민 그레이엄의 가치투자 공식으로 주식의 내재가치와 안전마진을 계산합니다
          </p>
        </div>

        {/* 검색 섹션 */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 mb-8 border border-slate-700/50 shadow-2xl">
          <div className="relative">
            <label className="block text-slate-300 text-sm font-semibold mb-3">
              🔍 종목명 또는 종목코드 검색
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="예: 삼성전자, 005930..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => searchInput.length > 0 && setShowDropdown(true)}
                className="w-full px-5 py-4 bg-slate-900/80 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-lg"
              />
              {searchLoading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="animate-spin h-5 w-5 border-2 border-cyan-500 border-t-transparent rounded-full"></div>
                </div>
              )}
            </div>

            {/* 검색 결과 드롭다운 */}
            {showDropdown && searchResults && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
                {searchResults.map((stock) => (
                  <button
                    key={stock.code}
                    onClick={() => handleSelectStock(stock)}
                    className="w-full px-5 py-3 text-left hover:bg-slate-700 transition-colors flex justify-between items-center border-b border-slate-700/50 last:border-0"
                  >
                    <div>
                      <span className="text-white font-medium">{stock.name}</span>
                      <span className="text-slate-400 ml-3 text-sm">{stock.code}</span>
                    </div>
                    <span className="text-xs px-2 py-1 bg-slate-600 text-slate-300 rounded">
                      {stock.market}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 인기 종목 */}
          <div className="mt-6">
            <p className="text-slate-400 text-sm mb-3">🔥 인기 종목</p>
            <div className="flex flex-wrap gap-2">
              {popularStocks?.map((stock) => (
                <button
                  key={stock.code}
                  onClick={() => handlePopularClick(stock)}
                  className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg transition-all text-sm border border-slate-600/50 hover:border-cyan-500/50"
                >
                  {stock.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 로딩 상태 */}
        {calculating && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-12 text-center border border-slate-700/50">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-cyan-500 border-t-transparent mb-4"></div>
            <p className="text-slate-400 text-lg">내재가치를 계산하고 있습니다...</p>
            <p className="text-slate-500 text-sm mt-2">재무 데이터를 수집 중입니다</p>
          </div>
        )}

        {/* 에러 상태 */}
        {calculateError && (
          <div className="bg-red-900/30 backdrop-blur-sm rounded-2xl p-6 border border-red-700/50 mb-8">
            <p className="text-red-400 flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              계산에 실패했습니다. 종목 코드를 확인하거나 잠시 후 다시 시도해주세요.
            </p>
          </div>
        )}

        {/* 결과 표시 */}
        {result && !calculating && (
          <div className="space-y-6 animate-fadeIn">
            {/* 메인 결과 카드 */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl">
              {/* 헤더 */}
              <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-3xl font-bold text-white">{result.stockName}</h2>
                    <p className="text-cyan-100 mt-1">{result.stockCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-cyan-100 text-sm">현재가</p>
                    <p className="text-3xl font-bold text-white">
                      {result.currentPrice.toLocaleString()}원
                    </p>
                  </div>
                </div>
              </div>

              {/* 본문 */}
              <div className="p-6">
                {/* 핵심 지표 */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                    <p className="text-slate-400 text-sm">EPS 가중평균</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {result.weightedEps.toLocaleString()}원
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                    <p className="text-slate-400 text-sm">최근 BPS</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {result.latestBps.toLocaleString()}원
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                    <p className="text-slate-400 text-sm">기본 내재가치</p>
                    <p className="text-2xl font-bold text-cyan-400 mt-1">
                      {result.basicIntrinsicValue.toLocaleString()}원
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                    <p className="text-slate-400 text-sm">자기주식 비율</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {result.treasuryStockRatio.toFixed(2)}%
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                    <p className="text-slate-400 text-sm">💰 배당수익률</p>
                    <p className={`text-2xl font-bold mt-1 ${result.dividendYield ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {result.dividendYield ? `${result.dividendYield}%` : '-'}
                    </p>
                  </div>
                </div>

                {/* 핵심 결과 */}
                <div className={`rounded-xl p-6 border-2 ${getSafetyMarginBg(result.safetyMargin)}`}>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="text-center">
                      <p className="text-slate-600 font-medium mb-2">📊 조정 내재가치</p>
                      <p className="text-4xl font-black text-slate-800">
                        {result.adjustedIntrinsicValue.toLocaleString()}원
                      </p>
                      <p className="text-slate-500 text-sm mt-1">
                        (자기주식 반영)
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-600 font-medium mb-2">🎯 안전마진</p>
                      <p className={`text-5xl font-black ${getSafetyMarginColor(result.safetyMargin)}`}>
                        {result.safetyMargin > 0 ? "+" : ""}{result.safetyMargin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  
                  {/* 투자 의견 */}
                  <div className="mt-6 pt-6 border-t border-slate-300/50 text-center">
                    <p className="text-xl font-bold text-slate-800">
                      {result.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 과거 재무지표 */}
            {result.financialHistory.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  📈 과거 재무지표
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">연도</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-medium">EPS</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-medium">BPS</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-medium">ROE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.financialHistory.map((data, index) => (
                        <tr 
                          key={data.year || index} 
                          className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                        >
                          <td className="py-3 px-4 text-white font-medium">{data.year}</td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {data.eps !== null ? `${data.eps.toLocaleString()}원` : '-'}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {data.bps !== null ? `${data.bps.toLocaleString()}원` : '-'}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {data.roe !== null ? `${data.roe.toFixed(2)}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 계산 방법 설명 */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                📚 내재가치 계산 방법
              </h3>
              <div className="space-y-4 text-slate-300">
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                  <p className="font-semibold text-cyan-400 mb-2">1. EPS 가중평균</p>
                  <p className="text-sm text-slate-400">
                    (최근년도 EPS × 3 + 전년도 EPS × 2 + 전전년도 EPS × 1) ÷ 6
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                  <p className="font-semibold text-cyan-400 mb-2">2. 기본 내재가치</p>
                  <p className="text-sm text-slate-400">
                    (EPS 가중평균 × 10 + 최근 BPS) ÷ 2
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                  <p className="font-semibold text-cyan-400 mb-2">3. 자기주식 조정</p>
                  <p className="text-sm text-slate-400">
                    내재가치 = 기본 내재가치 × (100 ÷ (100 - 자기주식비율))
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                  <p className="font-semibold text-cyan-400 mb-2">4. 안전마진</p>
                  <p className="text-sm text-slate-400">
                    ((내재가치 - 현재가) ÷ 현재가) × 100
                  </p>
                </div>
              </div>
              <p className="text-slate-500 text-xs mt-4">
                계산 기준일: {new Date(result.calculatedAt).toLocaleString('ko-KR')}
              </p>
            </div>
          </div>
        )}

        {/* 초기 상태 */}
        {!result && !calculating && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-12 text-center border border-slate-700/50">
            <div className="text-6xl mb-4">🔎</div>
            <h3 className="text-xl font-semibold text-white mb-2">
              종목을 검색해주세요
            </h3>
            <p className="text-slate-400">
              위 검색창에서 종목명을 입력하거나 인기 종목을 클릭하세요
            </p>
          </div>
        )}

        {/* 푸터 */}
        <div className="mt-8 text-center text-slate-500 text-sm">
          <p>⚠️ 이 계산기는 투자 참고용이며, 실제 투자 결정은 신중하게 내려주세요.</p>
          <p className="mt-1">데이터 출처: 네이버 금융</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

