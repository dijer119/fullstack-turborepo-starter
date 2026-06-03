import { parsePdfResponse } from "@/lib/etf/krx-pdf";
import type { Holding } from "@/lib/etf/types";

const KRX_URL = "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
const headers = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
  "Content-Type": "application/x-www-form-urlencoded",
  Referer: "http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201060101",
};

export function lastBusinessDay(d = new Date()): string {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  if (x.getDay() === 0) x.setDate(x.getDate() - 2);
  else if (x.getDay() === 6) x.setDate(x.getDate() - 1);
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
}

interface EtfListRow { ISU_CD?: string; ISU_SRT_CD?: string; ISU_ABBRV?: string; [k: string]: unknown }

async function krxPost(body: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(KRX_URL, { method: "POST", headers, body: body.toString() });
  if (!res.ok) throw new Error(`KRX HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function firstArray<T>(resp: Record<string, unknown>): T[] {
  for (const k of Object.keys(resp)) {
    const v = resp[k];
    if (Array.isArray(v) && v.length) return v as T[];
  }
  return [];
}

// 단축코드 → { isin, name }. (KRX 실데이터로 필드명 확정 필요 — 관례 기준)
export async function resolveEtf(
  code: string,
  trdDd = lastBusinessDay(),
): Promise<{ isin: string; name: string } | null> {
  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT04601", locale: "ko_KR",
    trdDd, share: "1", money: "1", csvxls_isNo: "false",
  });
  const rows = firstArray<EtfListRow>(await krxPost(body));
  const match = rows.find((r) => r.ISU_SRT_CD === code);
  if (!match?.ISU_CD) return null;
  return { isin: match.ISU_CD, name: (match.ISU_ABBRV ?? code).trim() };
}

export async function fetchEtfPdf(
  isin: string,
  trdDd = lastBusinessDay(),
): Promise<Holding[]> {
  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT05001", locale: "ko_KR",
    isuCd: isin, trdDd, share: "1", money: "1", csvxls_isNo: "false",
  });
  return parsePdfResponse(await krxPost(body));
}
