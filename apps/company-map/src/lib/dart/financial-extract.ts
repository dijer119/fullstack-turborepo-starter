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

function extractByAccountNames(
  response: unknown,
  names: Set<string>,
): { thstrm: bigint; frmtrm: bigint } | null {
  const r = response as DartResponse;
  if (r.status !== "000") return null;
  const list = r.list ?? [];

  const candidates = list
    .filter((item) => names.has(item.account_nm ?? ""))
    .map((item) => {
      const isConsolidated =
        item.fs_nm === "연결재무제표" || item.fs_div === "CFS";
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

const REVENUE_NAMES = new Set([
  "매출액",
  "수익(매출액)",
  "영업수익",
]);

const NET_INCOME_NAMES = new Set([
  "당기순이익",
  "당기순이익(손실)",
]);

export function extractRevenue(response: unknown) {
  return extractByAccountNames(response, REVENUE_NAMES);
}

export function extractNetIncome(response: unknown) {
  return extractByAccountNames(response, NET_INCOME_NAMES);
}
