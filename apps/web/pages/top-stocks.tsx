import { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../src/components/Header';
import { useGetTopSafetyMarginsQuery, useGetAllSafetyMarginsQuery } from '../src/store/services/krx-api';

type SortField = 'safety_margin' | 'treasury_ratio' | 'dividend_yield';
type SortDirection = 'asc' | 'desc';

export default function TopStocksPage() {
  const [displayCount, setDisplayCount] = useState<number>(30);
  const [dividendFilter, setDividendFilter] = useState<number>(0);
  const [sortField, setSortField] = useState<SortField>('safety_margin');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  const { data: allData, isLoading, error } = useGetAllSafetyMarginsQuery();

  // 정렬 토글 함수
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // 정렬 아이콘
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="ml-1 text-slate-600">↕</span>;
    }
    return <span className="ml-1 text-cyan-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>;
  };

  // 필터링 및 정렬된 데이터
  const filteredData = useMemo(() => {
    if (!allData?.results) return [];
    
    let filtered = allData.results.filter((item: any) => 
      item.safety_margin !== null && item.safety_margin > 0
    );
    
    // 배당수익률 필터
    if (dividendFilter > 0) {
      filtered = filtered.filter((item: any) => 
        item.dividend_yield !== null && item.dividend_yield >= dividendFilter
      );
    }
    
    // 정렬
    filtered = [...filtered].sort((a: any, b: any) => {
      const aVal = a[sortField] ?? -Infinity;
      const bVal = b[sortField] ?? -Infinity;
      
      if (sortDirection === 'desc') {
        return bVal - aVal;
      }
      return aVal - bVal;
    });
    
    return filtered.slice(0, displayCount);
  }, [allData, displayCount, dividendFilter, sortField, sortDirection]);

  // 안전마진에 따른 배경색
  const getSafetyMarginColor = (margin: number) => {
    if (margin >= 100) return 'bg-emerald-500/20 text-emerald-400';
    if (margin >= 50) return 'bg-green-500/20 text-green-400';
    if (margin >= 30) return 'bg-lime-500/20 text-lime-400';
    if (margin >= 10) return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-slate-500/20 text-slate-400';
  };

  return (
    <>
      <Head>
        <title>안전마진 상위 종목 | Value Calculator</title>
        <meta name="description" content="내재가치 대비 안전마진이 높은 종목 리스트" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* 공통 헤더 */}
        <Header />

        {/* 메인 컨텐츠 */}
        <main className="max-w-7xl mx-auto px-4 py-8 pb-12">
          {/* 타이틀 & 필터 */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <h1 className="text-3xl font-bold text-white">
              🏆 안전마진 상위 종목
            </h1>
            
            <div className="flex flex-wrap gap-4">
              {/* 표시 개수 */}
              <select
                value={displayCount}
                onChange={(e) => setDisplayCount(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value={30}>30개</option>
                <option value={50}>50개</option>
                <option value={100}>100개</option>
                <option value={200}>200개</option>
              </select>
              
              {/* 배당수익률 필터 */}
              <select
                value={dividendFilter}
                onChange={(e) => setDividendFilter(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value={0}>배당: 전체</option>
                <option value={1}>1% 이상</option>
                <option value={3}>3% 이상</option>
                <option value={5}>5% 이상</option>
                <option value={7}>7% 이상</option>
                <option value={10}>10% 이상</option>
              </select>
            </div>
          </div>

          {/* 통계 */}
          {allData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <p className="text-slate-400 text-sm">전체 종목</p>
                <p className="text-2xl font-bold text-white">{allData.total?.toLocaleString()}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <p className="text-slate-400 text-sm">계산 완료</p>
                <p className="text-2xl font-bold text-cyan-400">{allData.calculated?.toLocaleString()}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <p className="text-slate-400 text-sm">양수 안전마진</p>
                <p className="text-2xl font-bold text-emerald-400">{allData.positive?.toLocaleString()}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <p className="text-slate-400 text-sm">표시 중</p>
                <p className="text-2xl font-bold text-white">{filteredData.length}</p>
              </div>
            </div>
          )}

          {/* 로딩 */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
              <p className="text-red-400">데이터를 불러오는데 실패했습니다.</p>
              <p className="text-slate-500 text-sm mt-2">먼저 안전마진 계산을 실행해주세요.</p>
            </div>
          )}

          {/* 테이블 */}
          {filteredData.length > 0 && (
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800/50 border-b border-slate-700/50">
                      <th className="px-4 py-4 text-left text-sm font-semibold text-slate-400">#</th>
                      <th className="px-4 py-4 text-left text-sm font-semibold text-slate-400">종목명</th>
                      <th className="px-4 py-4 text-right text-sm font-semibold text-slate-400">현재가</th>
                      <th className="px-4 py-4 text-right text-sm font-semibold text-slate-400">내재가치</th>
                      <th 
                        className="px-4 py-4 text-right text-sm font-semibold text-slate-400 cursor-pointer hover:text-cyan-400 transition select-none"
                        onClick={() => handleSort('safety_margin')}
                      >
                        안전마진<SortIcon field="safety_margin" />
                      </th>
                      <th 
                        className="px-4 py-4 text-right text-sm font-semibold text-slate-400 cursor-pointer hover:text-cyan-400 transition select-none"
                        onClick={() => handleSort('treasury_ratio')}
                      >
                        자사주<SortIcon field="treasury_ratio" />
                      </th>
                      <th 
                        className="px-4 py-4 text-right text-sm font-semibold text-slate-400 cursor-pointer hover:text-cyan-400 transition select-none"
                        onClick={() => handleSort('dividend_yield')}
                      >
                        배당률<SortIcon field="dividend_yield" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((item: any, index: number) => (
                      <tr 
                        key={item.code}
                        className="border-b border-slate-700/30 hover:bg-slate-700/20 transition"
                      >
                        <td className="px-4 py-4 text-slate-500 font-medium">{index + 1}</td>
                        <td className="px-4 py-4">
                          <Link 
                            href={`/intrinsic-value?code=${item.code}`}
                            className="font-medium text-white hover:text-cyan-400 transition"
                          >
                            {item.name}
                          </Link>
                          <span className="text-slate-500 text-sm ml-2">({item.code})</span>
                        </td>
                        <td className="px-4 py-4 text-right text-white font-mono">
                          {item.current_price?.toLocaleString()}원
                        </td>
                        <td className="px-4 py-4 text-right text-cyan-400 font-mono">
                          {Math.round(item.intrinsic_value)?.toLocaleString()}원
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${getSafetyMarginColor(item.safety_margin)}`}>
                            {item.safety_margin?.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-slate-400 font-mono">
                          {item.treasury_ratio > 0 ? `${item.treasury_ratio}%` : '-'}
                        </td>
                        <td className="px-4 py-4 text-right text-emerald-400 font-mono">
                          {item.dividend_yield ? `${item.dividend_yield}%` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 데이터 없음 */}
          {!isLoading && !error && filteredData.length === 0 && (
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-12 text-center">
              <p className="text-slate-400 text-lg">조건에 맞는 종목이 없습니다.</p>
              <p className="text-slate-500 text-sm mt-2">필터 조건을 변경해보세요.</p>
            </div>
          )}
        </main>

        {/* 푸터 */}
        <footer className="border-t border-slate-700/50 py-8 text-center">
          <p className="text-slate-500 text-sm">
            데이터 출처: 네이버 금융 | 참고: <a href="https://intrinsic-value-calculator.onrender.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">spaceromany</a>
          </p>
        </footer>
      </div>
    </>
  );
}

