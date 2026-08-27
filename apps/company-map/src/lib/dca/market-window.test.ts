import { describe, expect, it } from "vitest";
import { isWindowOpenAt, ORDER_CUTOFF_MS, type WindowCalendar } from "./market-window";

// 2026-08-27(수) 미국 정규장 = KST 22:30 ~ 익일 05:00 (서머타임 기준).
const OPEN = "2026-08-27T22:30:00+09:00";
const CLOSE = "2026-08-28T05:00:00+09:00";
const openMs = new Date(OPEN).getTime();
const closeMs = new Date(CLOSE).getTime();
/** 접수 마감 = 종료 1시간 전 (KST 04:00) */
const cutoffMs = closeMs - ORDER_CUTOFF_MS;

const session = (startTime: string, endTime: string) => ({ regularMarket: { startTime, endTime } });

/** 창이 열려 있는 세션은 previousBusinessDay에만 둔다 — US 세션이 KST 자정을 넘기는 상황 재현. */
const cal: WindowCalendar = {
  previousBusinessDay: session(OPEN, CLOSE),
  today: session("2026-08-28T22:30:00+09:00", "2026-08-29T05:00:00+09:00"),
  nextBusinessDay: session("2026-08-31T22:30:00+09:00", "2026-09-01T05:00:00+09:00"),
};

describe("isWindowOpenAt", () => {
  it("정규장 한복판이면 열림", () => {
    expect(isWindowOpenAt(cal, new Date("2026-08-28T01:00:00+09:00").getTime())).toBe(true);
  });

  it("개장 직전은 닫힘, 개장 시각 정각은 열림 (경계 포함)", () => {
    expect(isWindowOpenAt(cal, openMs - 1)).toBe(false);
    expect(isWindowOpenAt(cal, openMs)).toBe(true);
  });

  it("마감 1시간 전 정각은 닫힘, 그 1ms 전은 열림 (경계 배타)", () => {
    expect(isWindowOpenAt(cal, cutoffMs - 1)).toBe(true);
    expect(isWindowOpenAt(cal, cutoffMs)).toBe(false);
  });

  it("종료 1시간 전 구간은 정규장 중이어도 닫힘 (금액 기반 주문 접수 마감)", () => {
    // KST 04:30 — 정규장은 열려 있지만 금액 기반 주문은 이미 마감
    const t = new Date("2026-08-28T04:30:00+09:00").getTime();
    expect(t > openMs && t < closeMs).toBe(true); // 정규장 중임을 먼저 확인
    expect(isWindowOpenAt(cal, t)).toBe(false);
  });

  it("장 마감 후는 닫힘", () => {
    expect(isWindowOpenAt(cal, closeMs + 1)).toBe(false);
  });

  it("전·당·익일 세 세션을 모두 훑는다 — 어느 자리에 있든 찾아낸다", () => {
    const mid = new Date("2026-08-28T01:00:00+09:00").getTime();
    const only = (key: keyof WindowCalendar): WindowCalendar => ({ [key]: session(OPEN, CLOSE) });
    expect(isWindowOpenAt(only("previousBusinessDay"), mid)).toBe(true);
    expect(isWindowOpenAt(only("today"), mid)).toBe(true);
    expect(isWindowOpenAt(only("nextBusinessDay"), mid)).toBe(true);
  });

  it("열린 세션이 하나도 없으면 닫힘 (휴장)", () => {
    const holiday: WindowCalendar = {
      previousBusinessDay: { regularMarket: {} },
      today: {},
      nextBusinessDay: undefined,
    };
    expect(isWindowOpenAt(holiday, new Date("2026-08-28T01:00:00+09:00").getTime())).toBe(false);
  });

  it("endTime이 없는 세션은 건너뛴다 — startTime만으로 창을 열어주지 않는다", () => {
    const noEnd: WindowCalendar = { today: { regularMarket: { startTime: OPEN } } };
    expect(isWindowOpenAt(noEnd, new Date("2026-08-28T01:00:00+09:00").getTime())).toBe(false);
  });

  it("startTime이 없는 세션도 건너뛴다", () => {
    const noStart: WindowCalendar = { today: { regularMarket: { endTime: CLOSE } } };
    expect(isWindowOpenAt(noStart, new Date("2026-08-28T01:00:00+09:00").getTime())).toBe(false);
  });

  it("파싱할 수 없는 시각은 창을 열어주는 근거가 되지 않는다", () => {
    const broken: WindowCalendar = { today: session("not-a-date", "also-not-a-date") };
    expect(isWindowOpenAt(broken, new Date("2026-08-28T01:00:00+09:00").getTime())).toBe(false);
    // 한쪽만 깨진 경우도 마찬가지
    expect(isWindowOpenAt({ today: session(OPEN, "??") }, openMs + 1000)).toBe(false);
    expect(isWindowOpenAt({ today: session("??", CLOSE) }, openMs + 1000)).toBe(false);
  });

  it("빈 캘린더면 닫힘", () => {
    expect(isWindowOpenAt({}, Date.now())).toBe(false);
  });
});
