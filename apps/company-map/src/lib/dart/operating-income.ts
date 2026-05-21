import { fetchDartFinancial } from "./financial";

export type ReprtCode = "11011" | "11013" | "11012" | "11014";

export interface OpIncomeReport {
  bsnsYear: number;
  reprtCode: ReprtCode;
  thstrm: bigint;
  frmtrm: bigint;
}

interface DartListItem {
  account_nm?: string;
  fs_nm?: string;
  fs_div?: string;
  thstrm_amount?: string;
  frmtrm_amount?: string;
}

interface DartResponse {
  status?: string;
  list?: DartListItem[];
}

function parseAmount(raw: string | undefined): bigint | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

/** 영업이익 row를 연결 → 별도 순서로 선택. thstrm/frmtrm 모두 파싱돼야 row 유효. */
export function extractOpIncome(
  response: unknown,
): { thstrm: bigint; frmtrm: bigint } | null {
  const r = response as DartResponse;
  if (r.status !== "000") return null;
  const list = r.list ?? [];

  const candidates = list
    .filter((item) => item.account_nm === "영업이익")
    .map((item) => {
      const isConsolidated = item.fs_nm === "연결재무제표" || item.fs_div === "CFS";
      return {
        priority: isConsolidated ? 0 : 1,
        thstrm: parseAmount(item.thstrm_amount),
        frmtrm: parseAmount(item.frmtrm_amount),
      };
    })
    .filter((c) => c.thstrm !== null && c.frmtrm !== null)
    .sort((a, b) => a.priority - b.priority);

  if (candidates.length === 0) return null;
  const c = candidates[0];
  return { thstrm: c.thstrm!, frmtrm: c.frmtrm! };
}

/** 시도 순서: 올해 11014 → 11012 → 11013 → 작년 11011. 첫 매칭에서 멈춤. */
export async function findLatestOpIncomeReport(
  corpCode: string,
  now: Date = new Date(),
): Promise<OpIncomeReport | null> {
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;
  const candidates: Array<{ year: number; code: ReprtCode }> = [
    { year: thisYear, code: "11014" },
    { year: thisYear, code: "11012" },
    { year: thisYear, code: "11013" },
    { year: lastYear, code: "11011" },
  ];

  for (const { year, code } of candidates) {
    const resp = await fetchDartFinancial(corpCode, year, code);
    if (!resp) continue;
    const op = extractOpIncome(resp);
    if (!op) continue;
    return { bsnsYear: year, reprtCode: code, thstrm: op.thstrm, frmtrm: op.frmtrm };
  }
  return null;
}

/** 매칭된 보고서의 한 단계 이전 보고서 fetch. QoQ 비교용. */
export async function fetchPrevOpIncomeReport(
  corpCode: string,
  latest: OpIncomeReport,
): Promise<OpIncomeReport | null> {
  const prev = prevReportFor(latest);
  if (!prev) return null;
  const resp = await fetchDartFinancial(corpCode, prev.year, prev.code);
  if (!resp) return null;
  const op = extractOpIncome(resp);
  if (!op) return null;
  return { bsnsYear: prev.year, reprtCode: prev.code, thstrm: op.thstrm, frmtrm: op.frmtrm };
}

function prevReportFor(
  latest: OpIncomeReport,
): { year: number; code: ReprtCode } | null {
  switch (latest.reprtCode) {
    case "11014": return { year: latest.bsnsYear, code: "11012" };
    case "11012": return { year: latest.bsnsYear, code: "11013" };
    case "11013": return { year: latest.bsnsYear - 1, code: "11011" };
    case "11011": return { year: latest.bsnsYear - 1, code: "11014" };
  }
}
