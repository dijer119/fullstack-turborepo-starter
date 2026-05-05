import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractBalanceSheet } from "./financial";

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../tests/fixtures/dart-fnltt-sample.json"),
    "utf-8",
  ),
);

describe("extractBalanceSheet", () => {
  it("prefers 연결재무제표 over 재무제표", () => {
    const result = extractBalanceSheet(fixture);
    expect(result).not.toBeNull();
    expect(result!.currentAssets).toBe(100_000_000_000n);
    expect(result!.totalLiabilities).toBe(30_000_000_000n);
    expect(result!.totalAssets).toBe(200_000_000_000n);
    expect(result!.totalEquity).toBe(170_000_000_000n);
  });

  it("falls back to 재무제표 when 연결 is absent", () => {
    const onlyStandalone = {
      status: "000",
      list: fixture.list.filter(
        (x: { fs_nm: string }) => x.fs_nm === "재무제표",
      ),
    };
    const result = extractBalanceSheet(onlyStandalone);
    expect(result).not.toBeNull();
    expect(result!.currentAssets).toBe(50_000_000_000n);
    expect(result!.totalLiabilities).toBe(20_000_000_000n);
  });

  it("returns null when 유동자산 or 부채총계 is missing", () => {
    const incomplete = {
      status: "000",
      list: [
        {
          sj_nm: "재무상태표",
          fs_nm: "연결재무제표",
          account_nm: "자산총계",
          thstrm_amount: "1,000",
        },
      ],
    };
    expect(extractBalanceSheet(incomplete)).toBeNull();
  });

  it("returns null when DART status != '000'", () => {
    expect(
      extractBalanceSheet({
        status: "013",
        message: "조회된 데이타가 없습니다",
        list: [],
      }),
    ).toBeNull();
  });
});
