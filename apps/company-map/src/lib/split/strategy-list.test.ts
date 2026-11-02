import { describe, expect, it } from "vitest";
import { filterStrategyRows, monitoringWarning } from "./strategy-list";
const rows = [
  { id: "1", name: "삼성전자", symbol: "005930", market: "KR", status: "active", accountLabel: "계좌 1" },
  { id: "2", name: "Apple", symbol: "AAPL", market: "US", status: "paused", accountLabel: "계좌 2" },
  { id: "3", name: "삼성전자", symbol: "005930", market: "KR", status: "completed", accountLabel: "계좌 2" },
];
describe("분할매매 종목 목록", () => {
  it("실행 중·예약 감시의 미실행과 지연을 구분하고 정지·종료는 경고하지 않는다", () => {
    const asOf = Date.parse("2026-11-02T01:00:00Z");
    for (const status of ["active", "reserved"]) {
      expect(monitoringWarning({ status, lastCheckedAt: null }, asOf)).toBe("감시 실행 기록 없음");
      expect(monitoringWarning({ status, lastCheckedAt: "invalid" }, asOf)).toBe("감시 실행 기록 없음");
      expect(monitoringWarning({ status, lastCheckedAt: new Date(asOf - 89_999).toISOString() }, asOf)).toBeNull();
      expect(monitoringWarning({ status, lastCheckedAt: new Date(asOf - 90_000).toISOString() }, asOf)).toBe("감시 지연 · 90초 이상");
    }
    for (const status of ["paused", "completed"]) {
      expect(monitoringWarning({ status, lastCheckedAt: null }, asOf)).toBeNull();
      expect(monitoringWarning({ status, lastCheckedAt: "2026-11-01T01:00:00Z" }, asOf)).toBeNull();
    }
  });
  it("이름·코드·계좌를 검색하고 시장과 상태를 함께 제한한다", () => {
    expect(filterStrategyRows(rows, " 삼성 ", "ALL", "active").map(r => r.id)).toEqual(["1"]);
    expect(filterStrategyRows(rows, "aapl", "US", "ALL").map(r => r.id)).toEqual(["2"]);
    expect(filterStrategyRows(rows, "계좌 2", "KR", "ALL").map(r => r.id)).toEqual(["3"]);
    expect(filterStrategyRows(rows, "없는종목", "ALL", "ALL")).toEqual([]);
  });
  it("종목명 오름차순으로 정렬하고 같은 종목은 계좌순으로 표시하며 원본은 보존한다", () => {
    const unsorted = [
      { ...rows[0], id: "s10", accountLabel: "계좌 10" },
      { ...rows[0], id: "s2", accountLabel: "계좌 2" },
      { ...rows[0], id: "a", name: "가나다" },
      { ...rows[0], id: "h", name: "하나" },
    ];
    expect(filterStrategyRows(unsorted, "", "ALL", "ALL").map(r => r.id)).toEqual(["a", "s2", "s10", "h"]);
    expect(filterStrategyRows(unsorted, "삼성", "KR", "active").map(r => r.id)).toEqual(["s2", "s10"]);
    expect(unsorted.map(r => r.id)).toEqual(["s10", "s2", "a", "h"]);
  });
});
