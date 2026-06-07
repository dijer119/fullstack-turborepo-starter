import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  classifyTreasuryAction,
  isTreasuryReport,
  parseTreasuryBody,
} from "./treasury-detail";

const FIX = join(__dirname, "__fixtures__", "treasury");
const load = (name: string) => readFileSync(join(FIX, name), "utf-8");

describe("classifyTreasuryAction", () => {
  it("신탁 체결/해지를 취득/처분보다 먼저 판정한다", () => {
    expect(
      classifyTreasuryAction("주요사항보고서(자기주식취득신탁계약체결결정)"),
    ).toBe("신탁체결");
    expect(
      classifyTreasuryAction("주요사항보고서(자기주식취득신탁계약해지결정)"),
    ).toBe("신탁해지");
  });

  it("취득·처분·소각을 구분한다", () => {
    expect(classifyTreasuryAction("주요사항보고서(자기주식취득결정)")).toBe("취득");
    expect(classifyTreasuryAction("주요사항보고서(자기주식처분결정)")).toBe("처분");
    expect(classifyTreasuryAction("주식소각결정")).toBe("소각");
  });
});

describe("isTreasuryReport", () => {
  it("자사주 공시 제목을 인식한다 (소각은 '자기주식' 단어 없이도)", () => {
    expect(isTreasuryReport("주요사항보고서(자기주식취득결정)")).toBe(true);
    expect(isTreasuryReport("주식소각결정")).toBe(true);
    expect(isTreasuryReport("단일판매ㆍ공급계약체결")).toBe(false);
  });
});

describe("parseTreasuryBody", () => {
  it("취득결정 (삼성전자)", () => {
    const p = parseTreasuryBody(load("acquire.html"), "취득");
    expect(p.action).toBe("취득");
    expect(p.ostkShares).toBe(37_000_000);
    expect(p.amount).toBe(7_174_300_000_000);
    expect(p.startDate).toBe("2026-03-19");
    expect(p.endDate).toBe("2026-06-18");
    expect(p.purpose).toBe("임직원 주식보상");
    expect(p.method).toBe("유가증권시장을 통한 장내 매수");
    expect(p.boardDate).toBe("2026-03-18");
  });

  it("처분결정 (삼성전자) — 처분예정금액을 1주당 가격과 구분한다", () => {
    const p = parseTreasuryBody(load("dispose.html"), "처분");
    expect(p.action).toBe("처분");
    expect(p.ostkShares).toBe(2_039_151);
    expect(p.amount).toBe(395_391_378_900);
    expect(p.purpose).toBe("직원 대상 자기주식 지급");
    expect(p.boardDate).toBe("2026-03-18");
  });

  it("소각결정 (메리츠금융지주, EUC-KR) — 발행주식총수로 비율 계산 가능", () => {
    const p = parseTreasuryBody(load("cancel.html"), "소각");
    expect(p.action).toBe("소각");
    expect(p.ostkShares).toBe(1_654_000);
    expect(p.totalSharesBefore).toBe(169_001_273);
    expect(p.amount).toBe(199_481_164_400);
    expect(p.execDate).toBe("2026-04-09");
    expect(p.boardDate).toBe("2026-03-26");
  });

  it("신탁계약 체결결정 (NICE평가정보)", () => {
    const p = parseTreasuryBody(load("trust-open.html"), "신탁체결");
    expect(p.action).toBe("신탁체결");
    expect(p.amount).toBe(6_000_000_000);
    expect(p.startDate).toBe("2023-12-19");
    expect(p.endDate).toBe("2024-12-18");
    expect(p.purpose).toBe("주가안정 및 주주가치 제고");
    expect(p.method).toBe("한국투자증권(주)");
    expect(p.boardDate).toBe("2023-11-21");
    expect(p.heldOstk).toBe(1_546_552);
    expect(p.heldRatio).toBe(2.55);
  });

  it("신탁계약 해지결정 (NICE평가정보) — 해지 전 계약금액을 잡는다", () => {
    const p = parseTreasuryBody(load("trust-close.html"), "신탁해지");
    expect(p.action).toBe("신탁해지");
    expect(p.amount).toBe(6_000_000_000);
    expect(p.startDate).toBe("2023-12-19");
    expect(p.endDate).toBe("2024-12-18");
    expect(p.purpose).toBe("신탁계약 기간 만료에 따른 해지");
    expect(p.method).toBe("한국투자증권");
    expect(p.execDate).toBe("2024-12-18");
    expect(p.heldOstk).toBe(902_099);
    expect(p.heldRatio).toBe(1.52);
  });
});
