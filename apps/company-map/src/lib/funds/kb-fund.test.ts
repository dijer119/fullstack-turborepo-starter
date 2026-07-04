import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFundHoldingsHtml, parseFundNavJson } from "./kb-fund";

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, "__fixtures__/fund-holdings.html"), "utf-8");
const navJson = readFileSync(join(dir, "__fixtures__/fund-nav.json"), "utf-8");

describe("parseFundHoldingsHtml", () => {
  const page = parseFundHoldingsHtml(html);

  it("펀드 메타(이름·운용사·등급·위험)를 파싱한다", () => {
    expect(page.meta.name).toContain("VIP한국형가치투자");
    expect(page.meta.manager).toBe("브이아이피자산운용");
    expect(page.meta.grade).toBe("5등급");
    expect(page.meta.riskLevel).toBe("높은위험");
  });

  it("종목별 비중 TOP10을 순위·비중과 함께 파싱한다", () => {
    expect(page.holdings.length).toBe(10);
    expect(page.holdings[0]).toEqual({ name: "삼성전자", weight: 7.11, rank: 1 });
    expect(page.holdings[3]).toEqual({ name: "SK하이닉스", weight: 3.95, rank: 4 });
    // 비중은 내림차순(페이지가 이미 정렬해 제공)
    const ws = page.holdings.map((h) => h.weight ?? 0);
    expect([...ws].sort((a, b) => b - a)).toEqual(ws);
  });

  it("빈/형식이상 HTML은 빈 보유와 폴백 메타를 준다", () => {
    const empty = parseFundHoldingsHtml("<html></html>");
    expect(empty.holdings).toEqual([]);
    expect(empty.meta.name).toContain("VIP"); // FUND.name 폴백
  });
});

describe("parseFundNavJson", () => {
  it("기준가 시계열을 date(YYYYMMDD)·nav 숫자로 파싱한다", () => {
    const pts = parseFundNavJson(navJson);
    expect(pts.length).toBeGreaterThan(10);
    for (const p of pts) {
      expect(p.date).toMatch(/^\d{8}$/);
      expect(typeof p.nav).toBe("number");
    }
  });

  it("잘못된 JSON/형식은 빈 배열", () => {
    expect(parseFundNavJson("not json")).toEqual([]);
    expect(parseFundNavJson('{"data":[{"date":"x","fnd":"y"}]}')).toEqual([]);
  });
});
