/**
 * stock_masters.market을 OpenDART list.json의 corp_cls 필드로 채운다.
 * KRX API가 세션 차단되어 KRX 시드로 market을 못 받을 때 fallback.
 * pblntfTy=A (정기공시) + 최근 180일이면 거의 모든 상장사가 1회 이상 등장.
 */
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { db } from "../worker/db";

const DART_LIST_URL = "https://opendart.fss.or.kr/api/list.json";

const CLS_TO_MARKET: Record<string, string> = {
  Y: "KOSPI",
  K: "KOSDAQ",
  N: "KONEX",
  E: "기타",
};

interface RawListRow {
  corp_code?: string;
  stock_code?: string;
  corp_cls?: string;
}

interface RawListResponse {
  status: string;
  message?: string;
  total_page?: number;
  list?: RawListRow[];
}

async function fetchPage(
  apiKey: string,
  bgnDe: string,
  endDe: string,
  pageNo: number,
): Promise<{ totalPage: number; rows: RawListRow[] }> {
  const qs = new URLSearchParams({
    crtfc_key: apiKey,
    bgn_de: bgnDe,
    end_de: endDe,
    pblntf_ty: "A",
    page_count: "100",
    page_no: String(pageNo),
  });
  const res = await fetch(`${DART_LIST_URL}?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as RawListResponse;
  if (data.status === "013") return { totalPage: 0, rows: [] };
  if (data.status !== "000") {
    throw new Error(`DART status ${data.status}: ${data.message ?? "unknown"}`);
  }
  return { totalPage: data.total_page ?? 1, rows: data.list ?? [] };
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

(async () => {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    console.error("DART_API_KEY not set");
    process.exit(1);
  }
  // DART list.json은 corp_code 없을 때 검색기간 90일 max.
  const now = new Date();
  const bgnDe = toDateString(new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000));
  const endDe = toDateString(now);
  console.log(`[market] fetching DART list ${bgnDe} ~ ${endDe}`);

  const stockToCls = new Map<string, string>();
  let pageNo = 1;
  let totalPage = 1;
  while (pageNo <= totalPage) {
    const page = await fetchPage(apiKey, bgnDe, endDe, pageNo);
    if (pageNo === 1) totalPage = page.totalPage;
    for (const r of page.rows) {
      const stock = (r.stock_code ?? "").trim();
      const cls = (r.corp_cls ?? "").trim();
      if (stock && cls && !stockToCls.has(stock)) stockToCls.set(stock, cls);
    }
    if (pageNo % 50 === 0 || pageNo === totalPage) {
      console.log(
        `[market] page ${pageNo}/${totalPage}, mapped ${stockToCls.size} stocks`,
      );
    }
    pageNo++;
    if (pageNo <= totalPage) await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`[market] fetched mapping for ${stockToCls.size} stocks`);

  let updated = 0;
  let skipped = 0;
  for (const [stock, cls] of stockToCls) {
    const market = CLS_TO_MARKET[cls];
    if (!market) {
      skipped++;
      continue;
    }
    const res = await db.stockMaster.updateMany({
      where: { code: stock },
      data: { market },
    });
    if (res.count > 0) updated++;
  }
  console.log(`[market] updated ${updated} stock_masters, skipped ${skipped} unknown cls`);

  const dist = await db.stockMaster.groupBy({
    by: ["market"],
    _count: { code: true },
  });
  console.log("[market] distribution:", dist.map((d) => `${d.market}=${d._count.code}`).join(", "));
  process.exit(0);
})();
