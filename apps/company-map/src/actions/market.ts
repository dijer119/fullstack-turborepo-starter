"use server";

import {
  getMarketCalendarKR,
  getMarketCalendarUS,
  isTossConfigured,
  type MarketCalendar,
} from "@/lib/toss/client";

export type SessionKind = "regular" | "extended" | "closed";

export interface MarketStatus {
  market: "KR" | "US";
  label: string; // 정규장 / 장전 시간외 / 프리마켓 / 애프터마켓 / 장 마감 등
  kind: SessionKind;
  until: string | null; // 현재 세션 종료(개장 중) 또는 다음 개장(마감) ISO 시각
}

interface LabeledSession {
  label: string;
  kind: SessionKind;
  start: number;
  end: number;
}

// 시각 파싱 (offset 포함 ISO).
const ms = (iso: string) => new Date(iso).getTime();

// 여러 영업일의 세션을 펼쳐 라벨링. (US 정규장은 자정을 넘기므로 전·당·익일 모두 포함)
function flatten<D>(
  cal: MarketCalendar<D>,
  pick: (day: D) => LabeledSession[],
): LabeledSession[] {
  return [cal.previousBusinessDay, cal.today, cal.nextBusinessDay]
    .filter(Boolean)
    .flatMap(pick);
}

function krSessions(day: {
  integrated: {
    preMarket: { startTime: string; endTime: string };
    regularMarket: { startTime: string; endTime: string };
    afterMarket: { startTime: string; endTime: string };
  };
}): LabeledSession[] {
  const g = day.integrated;
  return [
    { label: "장전 시간외", kind: "extended" as const, ...range(g.preMarket) },
    { label: "정규장", kind: "regular" as const, ...range(g.regularMarket) },
    { label: "장후 시간외", kind: "extended" as const, ...range(g.afterMarket) },
  ];
}

function usSessions(day: {
  dayMarket: { startTime: string; endTime: string };
  preMarket: { startTime: string; endTime: string };
  regularMarket: { startTime: string; endTime: string };
  afterMarket: { startTime: string; endTime: string };
}): LabeledSession[] {
  return [
    { label: "주간거래", kind: "extended" as const, ...range(day.dayMarket) },
    { label: "프리마켓", kind: "extended" as const, ...range(day.preMarket) },
    { label: "정규장", kind: "regular" as const, ...range(day.regularMarket) },
    { label: "애프터마켓", kind: "extended" as const, ...range(day.afterMarket) },
  ];
}

function range(s: { startTime: string; endTime: string }) {
  return { start: ms(s.startTime), end: ms(s.endTime) };
}

function resolve(market: "KR" | "US", sessions: LabeledSession[], now: number): MarketStatus {
  const active = sessions.find((s) => now >= s.start && now < s.end);
  if (active) {
    return { market, label: active.label, kind: active.kind, until: new Date(active.end).toISOString() };
  }
  // 마감: 다음 개장 시각
  const upcoming = sessions
    .filter((s) => s.start > now)
    .sort((a, b) => a.start - b.start)[0];
  return {
    market,
    label: "장 마감",
    kind: "closed",
    until: upcoming ? new Date(upcoming.start).toISOString() : null,
  };
}

export async function getMarketStatuses(): Promise<{
  kr: MarketStatus;
  us: MarketStatus;
} | null> {
  if (!isTossConfigured()) return null;
  try {
    const [krCal, usCal] = await Promise.all([
      getMarketCalendarKR(),
      getMarketCalendarUS(),
    ]);
    const now = Date.now();
    return {
      kr: resolve("KR", flatten(krCal, krSessions), now),
      us: resolve("US", flatten(usCal, usSessions), now),
    };
  } catch (e) {
    console.warn("[market] 장 상태 조회 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}
