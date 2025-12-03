import { useState } from "react";
import Header from "../src/components/Header";
import {
  useGetMaddingStockMessagesQuery,
  useGetMaddingStockStatsQuery,
  useLazySearchMaddingStockMessagesQuery,
} from "../src/store/services/maddingstock-api";

export default function MaddingStockPage() {
  const [page, setPage] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const limit = 20;

  const { data: messagesData, isLoading: messagesLoading, error: messagesError } = useGetMaddingStockMessagesQuery({
    limit,
    offset: page * limit,
  });

  const { data: statsData, isLoading: statsLoading } = useGetMaddingStockStatsQuery();

  const [triggerSearch, { data: searchData, isLoading: searchLoading }] = useLazySearchMaddingStockMessagesQuery();

  const handleSearch = () => {
    if (searchInput.trim()) {
      setSearchKeyword(searchInput.trim());
      triggerSearch({ keyword: searchInput.trim(), limit: 50 });
    }
  };

  const clearSearch = () => {
    setSearchKeyword("");
    setSearchInput("");
  };

  const displayMessages = searchKeyword ? searchData?.messages : messagesData?.messages;
  const isLoading = searchKeyword ? searchLoading : messagesLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* 공통 헤더 */}
      <Header />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* 페이지 타이틀 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            📈 MaddingStock 메시지
          </h1>
          <p className="text-slate-400">
            텔레그램 @maddingStock 채널의 메시지를 실시간으로 수집하고 분석합니다
          </p>
        </div>

        {/* Stats Section */}
        {!statsLoading && statsData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
              <div className="text-sm text-slate-400 mb-1">전체 메시지</div>
              <div className="text-3xl font-bold text-cyan-400">
                {statsData.totalMessages.toLocaleString()}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
              <div className="text-sm text-slate-400 mb-1">언급된 주식</div>
              <div className="text-3xl font-bold text-emerald-400">
                {statsData.stocksMentioned.length}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
              <div className="text-sm text-slate-400 mb-1">인기 키워드</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {statsData.topKeywords.slice(0, 5).map((kw) => (
                  <span
                    key={kw.keyword}
                    className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm font-medium"
                  >
                    {kw.keyword} ({kw.count})
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Search Section */}
        <div className="bg-slate-800/50 rounded-lg p-6 mb-6 border border-slate-700/50">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="주식명, 키워드로 검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 px-4 py-2 bg-slate-900/80 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-medium"
            >
              검색
            </button>
            {searchKeyword && (
              <button
                onClick={clearSearch}
                className="px-6 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors font-medium"
              >
                초기화
              </button>
            )}
          </div>
          {searchKeyword && (
            <div className="mt-3 text-sm text-slate-400">
              &apos;{searchKeyword}&apos; 검색 결과: {searchData?.total || 0}개
            </div>
          )}
        </div>

        {/* Messages List */}
        {messagesError && (
          <div className="bg-red-900/30 border border-red-700/50 text-red-400 px-4 py-3 rounded-lg mb-6">
            ⚠️ 메시지를 불러오는 중 오류가 발생했습니다. 백엔드 서버가 실행 중인지 확인해주세요.
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
            <p className="mt-4 text-slate-400">메시지를 불러오는 중...</p>
          </div>
        ) : displayMessages && displayMessages.length > 0 ? (
          <>
            <div className="space-y-4">
              {displayMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50 hover:border-slate-600/50 transition"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      {/* 전략 + 주식명 + 매매유형 */}
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {msg.parsed.strategy && (
                          <span className="inline-flex items-center px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-bold">
                            {msg.parsed.strategy}
                          </span>
                        )}
                        {msg.parsed.stockName && (
                          <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                            🏢 {msg.parsed.stockName}
                          </span>
                        )}
                        {msg.parsed.tradeType && (
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                              msg.parsed.tradeType === '매수'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {msg.parsed.tradeType === '매수' ? '📈' : '📉'} {msg.parsed.tradeType}
                          </span>
                        )}
                        {msg.parsed.status && (
                          <span className="inline-flex items-center px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">
                            {msg.parsed.status}
                          </span>
                        )}
                      </div>
                      
                      {/* 가격 + 손익율 + 변동률 */}
                      <div className="flex gap-2 flex-wrap">
                        {msg.parsed.price && (
                          <span className="text-sm px-2 py-1 bg-green-100 text-green-800 rounded font-semibold">
                            💰 {msg.parsed.price}
                          </span>
                        )}
                        {msg.parsed.profitRate && (
                          <span className="text-sm px-2 py-1 bg-pink-100 text-pink-800 rounded font-bold">
                            💵 손익율: {msg.parsed.profitRate}
                          </span>
                        )}
                        {msg.parsed.changePercent && (
                          <span
                            className={`text-sm px-2 py-1 rounded font-medium ${
                              msg.parsed.changePercent.includes("+") || msg.parsed.changePercent.includes("▲")
                                ? "bg-red-100 text-red-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            📊 {msg.parsed.changePercent}
                          </span>
                        )}
                        {msg.parsed.additionalInfo && (
                          <span className="text-sm px-2 py-1 bg-gray-100 text-gray-800 rounded">
                            ℹ️ {msg.parsed.additionalInfo}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      <div>{new Date(msg.timestamp).toLocaleDateString("ko-KR")}</div>
                      <div>{new Date(msg.timestamp).toLocaleTimeString("ko-KR")}</div>
                    </div>
                  </div>

                  <div className="text-gray-800 mb-3 whitespace-pre-wrap leading-relaxed">
                    {msg.rawText}
                  </div>

                  {msg.parsed.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.parsed.keywords.map((keyword, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium"
                        >
                          🏷️ {keyword}
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.parsed.symbols.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.parsed.symbols.map((symbol, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                        >
                          {symbol}
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.parsed.urls.length > 0 && (
                    <div className="mt-2">
                      {msg.parsed.urls.map((url, idx) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-sm block"
                        >
                          🔗 {url}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
                    ID: {msg.messageId} • @{msg.channelUsername}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {!searchKeyword && messagesData && (
              <div className="mt-8 flex justify-center items-center gap-4">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  ← 이전
                </button>
                <span className="text-gray-600">
                  {page + 1} 페이지 (전체 {messagesData.total}개)
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= messagesData.total}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  다음 →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              메시지가 없습니다
            </h3>
            <p className="text-gray-500">
              {searchKeyword
                ? "검색 결과가 없습니다. 다른 키워드로 시도해보세요."
                : "아직 수집된 메시지가 없습니다. 백엔드 서버에서 채널을 모니터링 중인지 확인해주세요."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

