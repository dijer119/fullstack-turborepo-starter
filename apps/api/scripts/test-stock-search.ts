/**
 * 종목 검색 테스트
 * 실행: cd apps/api && npx ts-node scripts/test-stock-search.ts
 */

import * as iconv from 'iconv-lite';

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Connection': 'keep-alive',
};

// 방법 1: 네이버 자동완성 API
async function searchNaverAc(keyword: string) {
  console.log(`\n[방법 1] 네이버 자동완성 API`);
  const url = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(keyword)}&q_enc=euc-kr&st=111&frm=stock&r_format=json&r_enc=utf-8&r_unicode=0&t_koreng=1&r_lt=111`;
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, { headers: defaultHeaders });
    console.log(`Status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`❌ 실패: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`Response:`, JSON.stringify(data, null, 2));
    
    const items = data?.items?.[0] || [];
    const results = items.map((item: string[]) => ({
      code: item[0],
      name: item[1],
      market: item[2] || 'KOSPI',
    }));
    
    console.log(`결과:`, results);
    return results;
  } catch (e) {
    console.log(`❌ 에러:`, e);
    return [];
  }
}

// 방법 2: KRX 종목 목록에서 검색 (Python 방식)
async function searchKrxStocks(keyword: string) {
  console.log(`\n[방법 2] KRX 종목 검색 (네이버 금융)`);
  
  // 네이버 금융의 종목 검색 페이지 사용
  const url = `https://finance.naver.com/search/searchList.naver?query=${encodeURIComponent(keyword)}`;
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, { headers: defaultHeaders });
    console.log(`Status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`❌ 실패: ${response.status}`);
      return [];
    }
    
    // EUC-KR 인코딩 처리
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const html = iconv.decode(buffer, 'euc-kr');
    
    console.log(`HTML 길이: ${html.length} bytes`);
    
    // 검색 결과 파싱 - 종목 링크에서 코드 추출
    // <a href="/item/main.naver?code=005930">삼성전자</a>
    const stockMatches = html.match(/<a[^>]*href="\/item\/main\.naver\?code=(\d{6})"[^>]*>([^<]+)<\/a>/g);
    
    if (stockMatches) {
      console.log(`종목 링크 발견: ${stockMatches.length}개`);
      
      const results = stockMatches.slice(0, 10).map(match => {
        const codeMatch = match.match(/code=(\d{6})/);
        const nameMatch = match.match(/>([^<]+)</);
        return {
          code: codeMatch ? codeMatch[1] : '',
          name: nameMatch ? nameMatch[1].trim() : '',
          market: 'KOSPI',
        };
      }).filter(r => r.code && r.name);
      
      console.log(`결과:`, results);
      return results;
    } else {
      console.log(`❌ 종목을 찾지 못함`);
      return [];
    }
  } catch (e) {
    console.log(`❌ 에러:`, e);
    return [];
  }
}

// 방법 3: 네이버 증권 통합검색
async function searchNaverFinance(keyword: string) {
  console.log(`\n[방법 3] 네이버 증권 통합검색`);
  
  const url = `https://m.stock.naver.com/api/json/search/searchListJson.nhn?keyword=${encodeURIComponent(keyword)}`;
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, { headers: defaultHeaders });
    console.log(`Status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`❌ 실패: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`Response:`, JSON.stringify(data, null, 2).substring(0, 500));
    
    return data;
  } catch (e) {
    console.log(`❌ 에러:`, e);
    return [];
  }
}

// 방법 4: 네이버 금융 검색 (모바일 API)
async function searchNaverMobile(keyword: string) {
  console.log(`\n[방법 4] 네이버 모바일 검색 API`);
  
  // 모바일 API - 더 안정적
  const url = `https://m.stock.naver.com/api/search/all?query=${encodeURIComponent(keyword)}`;
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, { 
      headers: {
        ...defaultHeaders,
        'Accept': 'application/json',
      }
    });
    console.log(`Status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`❌ 실패: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`Response:`, JSON.stringify(data, null, 2).substring(0, 1000));
    
    // 주식 검색 결과 추출
    if (data.result?.d?.STOCK?.itemList) {
      const stocks = data.result.d.STOCK.itemList;
      const results = stocks.map((item: any) => ({
        code: item.code,
        name: item.name,
        market: item.market || 'KOSPI',
      }));
      console.log(`\n✅ 검색 결과:`, results);
      return results;
    }
    
    return [];
  } catch (e) {
    console.log(`❌ 에러:`, e);
    return [];
  }
}

// 방법 5: 데이터 랩 종목 검색
async function searchDataLab(keyword: string) {
  console.log(`\n[방법 5] 네이버 데이터랩 검색`);
  
  const url = `https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0`;
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, { headers: defaultHeaders });
    console.log(`Status: ${response.status}`);
    return [];
  } catch (e) {
    console.log(`❌ 에러:`, e);
    return [];
  }
}

// 방법 6: 네이버 검색 자동완성 (search.naver.com)
async function searchNaverSearch(keyword: string) {
  console.log(`\n[방법 6] 네이버 통합검색 자동완성`);
  
  const url = `https://mac.search.naver.com/mobile/ac?st=100&q_enc=utf-8&r_format=json&r_enc=utf-8&r_unicode=0&t_koreng=1&q=${encodeURIComponent(keyword)}`;
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, { headers: defaultHeaders });
    console.log(`Status: ${response.status}`);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    console.log(`Response:`, JSON.stringify(data, null, 2).substring(0, 500));
    return [];
  } catch (e) {
    console.log(`❌ 에러:`, e);
    return [];
  }
}

// 방법 7: KOSPI/KOSDAQ 전체 종목에서 검색 (KRX OpenAPI)
async function searchKrxOpenApi(keyword: string) {
  console.log(`\n[방법 7] KRX 종목 검색 시뮬레이션`);
  
  // Python 코드와 동일하게 종목 코드로 직접 검색
  // 먼저 종목명으로 코드를 찾아야 함
  
  // 네이버 금융 종목 페이지 검색
  const searchUrl = `https://finance.naver.com/search/search.naver?query=${encodeURIComponent(keyword)}`;
  console.log(`URL: ${searchUrl}`);
  
  try {
    const response = await fetch(searchUrl, { headers: defaultHeaders });
    console.log(`Status: ${response.status}`);
    
    if (!response.ok) {
      return [];
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const html = iconv.decode(buffer, 'euc-kr');
    console.log(`HTML 길이: ${html.length}`);
    
    // HTML 샘플 출력
    console.log(`\nHTML 샘플 (첫 2000자):\n${html.substring(0, 2000)}`);
    
    // 검색 결과에서 종목 추출 - 다양한 패턴 시도
    // 패턴 1: /item/main.naver?code=XXXXXX
    let stockLinks = html.match(/<a[^>]+href="[^"]*\/item\/main\.naver\?code=(\d{6})"[^>]*>[^<]*<\/a>/g);
    
    // 패턴 2: code= 포함된 모든 링크
    if (!stockLinks || stockLinks.length === 0) {
      stockLinks = html.match(/code=(\d{6})/g);
      if (stockLinks) {
        console.log(`\n코드 패턴 발견: ${stockLinks.slice(0, 5).join(', ')}`);
      }
    }
    
    if (stockLinks && stockLinks.length > 0) {
      console.log(`종목 링크 발견: ${stockLinks.length}개`);
      
      const results = stockLinks.slice(0, 10).map(link => {
        const codeMatch = link.match(/code=(\d{6})/);
        const nameMatch = link.match(/>([^<]+)</);
        return {
          code: codeMatch ? codeMatch[1] : '',
          name: nameMatch ? nameMatch[1].trim() : '',
          market: 'KOSPI',
        };
      }).filter(r => r.code && r.name);
      
      // 중복 제거
      const uniqueResults = results.filter((item, index, self) => 
        index === self.findIndex(t => t.code === item.code)
      );
      
      console.log(`\n✅ 검색 결과:`, uniqueResults);
      return uniqueResults;
    }
    
    return [];
  } catch (e) {
    console.log(`❌ 에러:`, e);
    return [];
  }
}

async function main() {
  console.log('🚀 종목 검색 테스트\n');
  
  const testKeywords = ['삼성전자', '에코프로', '한화오션'];
  
  for (const keyword of testKeywords) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`검색어: "${keyword}"`);
    console.log('='.repeat(60));
    
    await searchKrxOpenApi(keyword);
    
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(console.error);

