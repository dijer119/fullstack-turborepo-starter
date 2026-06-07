import type { TreasuryAction, TreasuryPayload } from "./disclosure-payloads";
import {
  cellsOf,
  fetchViewerHtml,
  normalizeDate,
  parseNum,
} from "./dart-viewer";

// 공시 제목으로 자사주 행위 유형 분류.
// 신탁(체결/해지)에는 "취득"이 포함되므로 신탁을 먼저 판정한다.
export function classifyTreasuryAction(reportNm: string): TreasuryAction {
  if (/소각/.test(reportNm)) return "소각";
  if (/신탁계약\s*체결|취득\s*신탁계약\s*체결/.test(reportNm)) return "신탁체결";
  if (/신탁계약\s*해지|취득\s*신탁계약\s*해지/.test(reportNm)) return "신탁해지";
  if (/처분/.test(reportNm)) return "처분";
  if (/취득/.test(reportNm)) return "취득";
  return "기타";
}

// 자사주 관련 공시인지 판정. B(주요사항)·I(거래소) 공시 제목 필터에 사용.
const TREASURY_TITLE_REGEX = /자기주식|자사주|주식\s*소각/;
export function isTreasuryReport(reportNm: string): boolean {
  return TREASURY_TITLE_REGEX.test(reportNm);
}

function idxOf(cells: string[], re: RegExp, from = 0): number {
  for (let i = from; i < cells.length; i++) {
    if (re.test(cells[i])) return i;
  }
  return -1;
}

function clean(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t === "" || t === "-" ? null : t;
}

// 라벨 셀 바로 다음 셀의 텍스트.
function valAfter(cells: string[], re: RegExp): string | null {
  const i = idxOf(cells, re);
  if (i < 0 || i + 1 >= cells.length) return null;
  return clean(cells[i + 1]);
}

// 라벨 이후 첫 "보통주식" 헤더 셀 다음의 숫자.
// (취득/처분/소각 예정 주식수·금액, 보유현황 표가 "라벨 → 보통주식 → 값" 구조)
function botongNumAfter(cells: string[], re: RegExp): number | null {
  const i = idxOf(cells, re);
  if (i < 0) return null;
  const b = idxOf(cells, /보통주식/, i + 1);
  if (b < 0 || b + 1 >= cells.length) return null;
  return parseNum(cells[b + 1]);
}

// 라벨 이후 "시작일"·"종료일" 다음 셀을 날짜로.
function periodAfter(
  cells: string[],
  re: RegExp,
): { start: string | null; end: string | null } {
  const i = idxOf(cells, re);
  if (i < 0) return { start: null, end: null };
  const s = idxOf(cells, /^시작일$/, i + 1);
  const e = idxOf(cells, /^종료일$/, i + 1);
  return {
    start: s >= 0 ? normalizeDate(cells[s + 1]) : null,
    end: e >= 0 ? normalizeDate(cells[e + 1]) : null,
  };
}

// "배당가능범위 내 취득(주)" 구역의 보통주 보유수량과 비율.
function heldBefore(cells: string[]): {
  shares: number | null;
  ratio: number | null;
} {
  // "...자기주식 보유현황" 라벨 이후 "배당가능범위 내 취득" → "보통주식" → 수량 → "비율(%)" → 비율
  const i = idxOf(cells, /자기주식\s*보유현황/);
  if (i < 0) return { shares: null, ratio: null };
  const b = idxOf(cells, /보통주식/, i + 1);
  if (b < 0) return { shares: null, ratio: null };
  const shares = parseNum(cells[b + 1]);
  const r = idxOf(cells, /비율/, b + 1);
  const ratio = r >= 0 ? parseNum(cells[r + 1]) : null;
  return { shares, ratio };
}

export function emptyTreasuryPayload(action: TreasuryAction): TreasuryPayload {
  return {
    action,
    ostkShares: null,
    amount: null,
    startDate: null,
    endDate: null,
    purpose: null,
    method: null,
    boardDate: null,
    execDate: null,
    totalSharesBefore: null,
    heldOstk: null,
    heldRatio: null,
  };
}

// viewer.do 본문 HTML을 유형별로 파싱해 통일 페이로드 생성.
export function parseTreasuryBody(
  html: string,
  action: TreasuryAction,
): TreasuryPayload {
  const cells = cellsOf(html);
  const p = emptyTreasuryPayload(action);
  const held = heldBefore(cells);
  p.heldOstk = held.shares;
  p.heldRatio = held.ratio;

  if (action === "취득") {
    p.ostkShares = botongNumAfter(cells, /취득예정주식/);
    p.amount = botongNumAfter(cells, /취득예정금액/);
    const period = periodAfter(cells, /취득예상기간/);
    p.startDate = period.start;
    p.endDate = period.end;
    p.purpose = valAfter(cells, /취득목적/);
    p.method = valAfter(cells, /취득방법/);
    p.boardDate = normalizeDate(valAfter(cells, /취득결정일/));
  } else if (action === "처분") {
    p.ostkShares = botongNumAfter(cells, /처분예정주식/);
    p.amount = botongNumAfter(cells, /처분예정금액/);
    const period = periodAfter(cells, /처분예정기간/);
    p.startDate = period.start;
    p.endDate = period.end;
    p.purpose = valAfter(cells, /처분목적/);
    p.method = valAfter(cells, /처분방법/);
    p.boardDate = normalizeDate(valAfter(cells, /처분결정일/));
  } else if (action === "소각") {
    p.ostkShares = botongNumAfter(cells, /소각할\s*주식의\s*종류와\s*수|소각할\s*주식/);
    p.totalSharesBefore = botongNumAfter(cells, /발행주식\s*총수/);
    p.amount = parseNum(valAfter(cells, /소각예정금액/));
    p.method = valAfter(cells, /소각할\s*주식의\s*취득방법|소각할\s*주식의\s*취득/);
    p.execDate = normalizeDate(valAfter(cells, /소각\s*예정일/));
    p.boardDate = normalizeDate(valAfter(cells, /이사회결의일/));
  } else if (action === "신탁체결") {
    p.amount = parseNum(valAfter(cells, /계약금액/));
    const period = periodAfter(cells, /계약기간/);
    p.startDate = period.start;
    p.endDate = period.end;
    p.purpose = valAfter(cells, /계약목적/);
    p.method = valAfter(cells, /계약체결기관/);
    p.execDate = normalizeDate(valAfter(cells, /계약체결\s*예정일자/));
    p.boardDate = normalizeDate(valAfter(cells, /이사회결의일/));
  } else if (action === "신탁해지") {
    // 계약금액(원) → "해지 전" → 금액
    const ci = idxOf(cells, /계약금액/);
    if (ci >= 0) {
      const bi = idxOf(cells, /^해지\s*전$/, ci + 1);
      p.amount = bi >= 0 ? parseNum(cells[bi + 1]) : null;
    }
    const period = periodAfter(cells, /해지\s*전\s*계약기간/);
    p.startDate = period.start;
    p.endDate = period.end;
    p.purpose = valAfter(cells, /해지목적/);
    p.method = valAfter(cells, /해지기관/);
    p.execDate = normalizeDate(valAfter(cells, /해지예정일자/));
    p.boardDate = normalizeDate(valAfter(cells, /이사회결의일/));
  }

  return p;
}

export async function fetchTreasuryDetail(
  rcpNo: string,
  action: TreasuryAction,
): Promise<TreasuryPayload | null> {
  const html = await fetchViewerHtml(rcpNo);
  if (!html) return null;
  return parseTreasuryBody(html, action);
}
