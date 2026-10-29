import { describe, it, expect } from "vitest";
import { parseNaverEtfAnalysis } from "./naver";

// Naver etfAnalysis 실응답에서 발췌한 형태
const sample = {
  itemCode: "0074K0",
  itemName: "KoAct K수출핵심기업TOP30액티브",
  marketValue: "1,128억",
  etfTop10MajorConstituentAssets: [
    { seq: 1, itemCode: "000660", itemName: "SK하이닉스", stockCount: "74", etfWeight: "15.83%" },
    { seq: 2, itemCode: "005930", itemName: "삼성전자", stockCount: "331", etfWeight: "10.82%" },
    { seq: 3, itemCode: "080220", itemName: "제주반도체", stockCount: "1,958", etfWeight: "8.77%" },
  ],
};

describe("parseNaverEtfAnalysis", () => {
  it("ETF명과 상위 구성종목을 Holding[]로 파싱한다", () => {
    const { name, holdings } = parseNaverEtfAnalysis(sample);
    expect(name).toBe("KoAct K수출핵심기업TOP30액티브");
    expect(holdings).toHaveLength(3);
    expect(holdings[0]).toEqual({
      constituentCode: "000660",
      constituentName: "SK하이닉스",
      weight: 15.83,
      shares: 74,
      amount: null,
    });
  });

  it("'%'와 콤마를 숫자로 변환한다", () => {
    const { holdings } = parseNaverEtfAnalysis(sample);
    expect(holdings[1].weight).toBeCloseTo(10.82);
    expect(holdings[2].shares).toBe(1958); // "1,958" → 1958
  });

  it("구성종목이 없으면 빈 배열", () => {
    const { holdings } = parseNaverEtfAnalysis({ itemName: "x" });
    expect(holdings).toEqual([]);
  });

  it("marketValue를 BigInt 원 단위로 파싱한다", () => {
    const { marketValue } = parseNaverEtfAnalysis(sample);
    expect(marketValue).toBe(112_800_000_000n);
  });

  it("marketValue 필드가 없으면 null", () => {
    const { marketValue } = parseNaverEtfAnalysis({ itemName: "x" });
    expect(marketValue).toBeNull();
  });

  it("조 단위 marketValue도 파싱한다", () => {
    const { marketValue } = parseNaverEtfAnalysis({ itemName: "x", marketValue: "1.2조" });
    expect(marketValue).toBe(1_200_000_000_000n);
  });

  it("기간별 수익률(시장가·NAV)과 기준일을 파싱한다", () => {
    const { returns } = parseNaverEtfAnalysis({
      itemName: "x",
      returnPerformanceReferenceDate: "2026.10.01",
      returnPerformanceList: [
        { periodTypeCode: "D1", value: -0.5 },
        { periodTypeCode: "Y10", value: 13.72 },
      ],
      navPerformanceReferenceDate: "2026.10.01",
      navPerformanceList: [{ periodTypeCode: "D1", value: -0.5 }],
    });
    expect(returns).toEqual({
      referenceDate: "20261001",
      market: [
        { period: "D1", value: -0.5 },
        { period: "Y10", value: 13.72 },
      ],
      nav: [{ period: "D1", value: -0.5 }],
    });
  });

  it("값이 숫자가 아니거나 기간 코드가 없는 수익률 항목은 버린다", () => {
    const { returns } = parseNaverEtfAnalysis({
      itemName: "x",
      returnPerformanceReferenceDate: "2026.10.01",
      returnPerformanceList: [
        { periodTypeCode: "D1", value: null },
        { periodTypeCode: "M1", value: "-3.53" },
        { value: 1 },
      ],
    });
    expect(returns).toEqual({
      referenceDate: "20261001",
      market: [{ period: "M1", value: -3.53 }],
      nav: [],
    });
  });

  it("분배금 요약(TTM 분배금·분배율·올해 횟수·지급월)을 파싱한다", () => {
    const { dividend } = parseNaverEtfAnalysis({
      itemName: "x",
      dividend: {
        dividendYieldTtm: 1.22,
        dividendPerShareTtm: 400,
        dividendCountThisYear: 3,
        dividendMonthThisYear: "1,4,7",
      },
    });
    expect(dividend).toEqual({ perShareTtm: 400, yieldTtm: 1.22, countThisYear: 3, monthsThisYear: [1, 4, 7] });
  });

  it("분배가 없는 ETF는 0과 빈 지급월로 파싱한다", () => {
    const { dividend } = parseNaverEtfAnalysis({
      itemName: "x",
      dividend: { dividendYieldTtm: 0, dividendPerShareTtm: 0, dividendCountThisYear: 0, dividendMonthThisYear: "" },
    });
    expect(dividend).toEqual({ perShareTtm: 0, yieldTtm: 0, countThisYear: 0, monthsThisYear: [] });
  });

  it("dividend 필드가 없으면 null", () => {
    const { dividend } = parseNaverEtfAnalysis({ itemName: "x" });
    expect(dividend).toBeNull();
  });

  it("수익률 목록이 둘 다 없으면 returns는 null", () => {
    const { returns } = parseNaverEtfAnalysis({ itemName: "x" });
    expect(returns).toBeNull();
  });
});
