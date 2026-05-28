import { fetchDartFinancial } from "./financial";
import { extractOpIncome, type ReprtCode } from "./operating-income";
import { extractRevenue, extractNetIncome } from "./financial-extract";

export interface EarningsPayload {
  bsnsYear: number;
  reprtCode: ReprtCode;
  reprtLabel: string;
  revenue: number | null;
  opIncome: number | null;
  netIncome: number | null;
  revenueYoyPct: number | null;
  opIncomeYoyPct: number | null;
  netIncomeYoyPct: number | null;
  revenueQoqPct: number | null;
  opIncomeQoqPct: number | null;
  netIncomeQoqPct: number | null;
}

const REPRT_LABEL_MAP: Record<ReprtCode, string> = {
  "11013": "Q1",
  "11012": "반기",
  "11014": "Q3",
  "11011": "사업",
};

function shortYearLabel(year: number, reprtCode: ReprtCode): string {
  const yy = String(year).slice(-2);
  const suffix = REPRT_LABEL_MAP[reprtCode];
  return suffix === "사업" ? `${yy}사업` : `${yy}${suffix}`;
}

function pctChange(curr: bigint | null, base: bigint | null): number | null {
  if (curr == null || base == null) return null;
  const b = Number(base);
  if (!Number.isFinite(b) || b === 0) return null;
  return ((Number(curr) - b) / Math.abs(b)) * 100;
}

export async function buildEarningsPayload(
  corpCode: string,
  bsnsYear: number,
  reprtCode: ReprtCode,
  prevReportPayload?: EarningsPayload | null,
): Promise<EarningsPayload | null> {
  const resp = await fetchDartFinancial(corpCode, bsnsYear, reprtCode);
  if (!resp) return null;

  const rev = extractRevenue(resp);
  const op = extractOpIncome(resp);
  const net = extractNetIncome(resp);
  if (!rev && !op && !net) return null;

  const prevRevenueB =
    prevReportPayload?.revenue != null ? BigInt(prevReportPayload.revenue) : null;
  const prevOpB =
    prevReportPayload?.opIncome != null ? BigInt(prevReportPayload.opIncome) : null;
  const prevNetB =
    prevReportPayload?.netIncome != null ? BigInt(prevReportPayload.netIncome) : null;

  return {
    bsnsYear,
    reprtCode,
    reprtLabel: shortYearLabel(bsnsYear, reprtCode),
    revenue: rev ? Number(rev.thstrm) : null,
    opIncome: op ? Number(op.thstrm) : null,
    netIncome: net ? Number(net.thstrm) : null,
    revenueYoyPct: rev ? pctChange(rev.thstrm, rev.frmtrm) : null,
    opIncomeYoyPct: op ? pctChange(op.thstrm, op.frmtrm) : null,
    netIncomeYoyPct: net ? pctChange(net.thstrm, net.frmtrm) : null,
    revenueQoqPct: rev ? pctChange(rev.thstrm, prevRevenueB) : null,
    opIncomeQoqPct: op ? pctChange(op.thstrm, prevOpB) : null,
    netIncomeQoqPct: net ? pctChange(net.thstrm, prevNetB) : null,
  };
}
