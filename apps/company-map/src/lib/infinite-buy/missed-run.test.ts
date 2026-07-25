import { describe, it, expect } from "vitest";
import { pickLastClosedTradeDate, isMissedRun, type CalDay } from "./missed-run";

// US 정규장은 KST 22:30~익일 05:00. 아래 endTime은 ISO(UTC 표기)로 둔다.
const day = (date: string, endTime?: string): CalDay => ({
  date,
  regularMarket: endTime ? { endTime } : null,
});
const at = (iso: string) => new Date(iso).getTime();

describe("pickLastClosedTradeDate", () => {
  it("마감된 세션 중 가장 최근 거래일을 고른다", () => {
    const days = [
      day("2026-07-22", "2026-07-22T20:00:00Z"),
      day("2026-07-23", "2026-07-23T20:00:00Z"),
    ];
    expect(pickLastClosedTradeDate(days, at("2026-07-23T21:00:00Z"))).toBe("2026-07-23");
  });

  it("진행 중인 세션은 제외한다 (아직 누락이 아님)", () => {
    const days = [
      day("2026-07-23", "2026-07-23T20:00:00Z"),
      day("2026-07-24", "2026-07-24T20:00:00Z"),
    ];
    // 07-24 장중(마감 1시간 전) → 최근 '마감된' 거래일은 07-23
    expect(pickLastClosedTradeDate(days, at("2026-07-24T19:00:00Z"))).toBe("2026-07-23");
  });

  it("마감 시각 정각이면 마감된 것으로 본다", () => {
    const days = [day("2026-07-24", "2026-07-24T20:00:00Z")];
    expect(pickLastClosedTradeDate(days, at("2026-07-24T20:00:00Z"))).toBe("2026-07-24");
  });

  it("휴장일(regularMarket 없음)은 무시한다", () => {
    const days = [day("2026-07-23", "2026-07-23T20:00:00Z"), day("2026-07-24")];
    expect(pickLastClosedTradeDate(days, at("2026-07-25T00:00:00Z"))).toBe("2026-07-23");
  });

  it("마감된 세션이 하나도 없으면 null", () => {
    const days = [day("2026-07-24", "2026-07-24T20:00:00Z")];
    expect(pickLastClosedTradeDate(days, at("2026-07-24T10:00:00Z"))).toBeNull();
  });

  it("빈 배열·null 요소도 안전", () => {
    expect(pickLastClosedTradeDate([], at("2026-07-25T00:00:00Z"))).toBeNull();
    expect(pickLastClosedTradeDate([null, undefined], at("2026-07-25T00:00:00Z"))).toBeNull();
  });
});

describe("isMissedRun", () => {
  it("active인데 마지막 실행일이 최근 마감 거래일보다 뒤처지면 누락", () => {
    expect(isMissedRun("active", "2026-07-23", "2026-07-24")).toBe(true);
  });

  it("최근 마감 거래일까지 실행됐으면 정상", () => {
    expect(isMissedRun("active", "2026-07-24", "2026-07-24")).toBe(false);
  });

  it("active가 아니면 판정 대상 아님", () => {
    expect(isMissedRun("paused", "2026-07-23", "2026-07-24")).toBe(false);
    expect(isMissedRun("completed", "2026-07-01", "2026-07-24")).toBe(false);
    expect(isMissedRun("exhausted", "2026-07-01", "2026-07-24")).toBe(false);
  });

  it("실행 이력이 없거나 거래일을 못 구했으면 판정하지 않는다", () => {
    expect(isMissedRun("active", null, "2026-07-24")).toBe(false);
    expect(isMissedRun("active", "2026-07-23", null)).toBe(false);
  });
});
