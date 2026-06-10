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
});
