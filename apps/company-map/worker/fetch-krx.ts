import type { KrxStockSeed } from "@/types/stocks";

const KRX_URL = "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Content-Type": "application/x-www-form-urlencoded",
  Connection: "keep-alive",
  Referer:
    "http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020101",
};

function parseNumber(value: string | undefined | null): number {
  if (!value || value === "-") return 0;
  return parseFloat(String(value).replace(/,/g, "")) || 0;
}

/** 마지막 영업일 yyyymmdd. KRX 시세는 어제 종가 기준. 주말이면 금요일로. */
function lastBusinessDay(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() - 2);
  else if (day === 6) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

type KrxBuilding = "STK" | "KSQ";

/** KRX MDCSTAT01501 (시가총액) 응답 row 1개의 일부 필드. */
interface KrxRawRow {
  ISU_SRT_CD: string;
  ISU_ABBRV: string;
  MKTCAP: string;
}

interface KrxResponse {
  OutBlock_1?: KrxRawRow[];
}

/** 단일 시장(KOSPI/KOSDAQ) 종목 목록을 KRX OpenAPI에서 fetch. */
export async function fetchKrxStocksByMarket(
  mktId: KrxBuilding,
  marketName: "KOSPI" | "KOSDAQ",
  trdDd: string = lastBusinessDay(),
): Promise<KrxStockSeed[]> {
  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT01501",
    locale: "ko_KR",
    mktId,
    trdDd,
    share: "1",
    money: "1",
    csvxls_isNo: "false",
  });

  const res = await fetch(KRX_URL, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`KRX ${marketName} HTTP ${res.status}`);
  }
  const data = (await res.json()) as KrxResponse;
  const rows = data.OutBlock_1 ?? [];
  return rows
    .map<KrxStockSeed | null>((r) => {
      if (!r.ISU_SRT_CD || !r.ISU_ABBRV) return null;
      return {
        Code: r.ISU_SRT_CD,
        Name: r.ISU_ABBRV,
        Marcap: parseNumber(r.MKTCAP),
        Market: marketName,
      };
    })
    .filter((x): x is KrxStockSeed => x !== null);
}

/** KOSPI + KOSDAQ 전체 fetch. KRX 일시 장애 시 한쪽이 비어도 다른 쪽은 살림. */
export async function fetchAllKrxStocks(): Promise<KrxStockSeed[]> {
  const trdDd = lastBusinessDay();
  const [kospi, kosdaq] = await Promise.all([
    fetchKrxStocksByMarket("STK", "KOSPI", trdDd).catch((e) => {
      console.error("[krx] KOSPI fetch failed:", e);
      return [] as KrxStockSeed[];
    }),
    fetchKrxStocksByMarket("KSQ", "KOSDAQ", trdDd).catch((e) => {
      console.error("[krx] KOSDAQ fetch failed:", e);
      return [] as KrxStockSeed[];
    }),
  ]);
  console.log(
    `[krx] fetched ${kospi.length} KOSPI + ${kosdaq.length} KOSDAQ (기준일 ${trdDd})`,
  );
  return [...kospi, ...kosdaq];
}
