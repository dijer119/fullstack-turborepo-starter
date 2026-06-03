import type { Holding } from "./types";

function num(v: unknown): number | null {
  if (v == null) return null;
  const cleaned = String(v).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// KRX getJsonData 응답에서 첫 비어있지 않은 배열 블록을 찾는다.
function firstArrayBlock(resp: Record<string, unknown>): unknown[] {
  for (const k of Object.keys(resp)) {
    const v = resp[k];
    if (Array.isArray(v) && v.length) return v;
  }
  return [];
}

interface KrxPdfRow {
  COMPST_ISU_CD?: string;
  COMPST_ISU_NM?: string;
  COMPST_RTO?: string;
  COMPST_ISU_CU1_SHRS?: string;
  VALU_AMT?: string;
  [k: string]: unknown;
}

export function parsePdfResponse(resp: Record<string, unknown>): Holding[] {
  const rows = firstArrayBlock(resp) as KrxPdfRow[];
  return rows
    .map((r): Holding | null => {
      const name = (r.COMPST_ISU_NM ?? "").toString().trim();
      if (!name) return null;
      return {
        constituentCode: (r.COMPST_ISU_CD ?? "").toString().trim(),
        constituentName: name,
        weight: num(r.COMPST_RTO),
        shares: num(r.COMPST_ISU_CU1_SHRS),
        amount: num(r.VALU_AMT),
      };
    })
    .filter((h): h is Holding => h !== null);
}
