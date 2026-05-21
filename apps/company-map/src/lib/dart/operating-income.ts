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
