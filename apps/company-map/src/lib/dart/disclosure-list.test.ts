import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchDisclosurePage } from "./disclosure-list";

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../tests/fixtures/dart-disclosure-list-vip.json"),
    "utf-8",
  ),
);

describe("fetchDisclosurePage", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.DART_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses DART list.json response into typed rows", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    } as Response);

    const result = await fetchDisclosurePage({
      bgnDe: "20251121",
      endDe: "20260521",
      pblntfTy: "D",
      pageNo: 1,
      pageCount: 100,
    });

    expect(result.totalPage).toBe(1);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      corpCode: "00567890",
      corpName: "한라IMS",
      reportNm: "주식등의대량보유상황보고서(약식)",
      rcpNo: "20260518000285",
      flrNm: "브이아이피자산운용",
      rceptDt: "20260518",
      stockCode: "017250",
    });
  });

  it("returns empty rows when DART status is '013' (no data)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "013", message: "조회된 데이타가 없습니다" }),
    } as Response);

    const result = await fetchDisclosurePage({
      bgnDe: "20251121",
      endDe: "20260521",
      pblntfTy: "D",
      pageNo: 1,
      pageCount: 100,
    });

    expect(result.totalPage).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it("throws when DART status is unexpected error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "020", message: "인증 오류" }),
    } as Response);

    await expect(
      fetchDisclosurePage({
        bgnDe: "20251121",
        endDe: "20260521",
        pblntfTy: "D",
        pageNo: 1,
        pageCount: 100,
      }),
    ).rejects.toThrow(/020/);
  });

  it("throws when DART_API_KEY is missing", async () => {
    delete process.env.DART_API_KEY;
    await expect(
      fetchDisclosurePage({
        bgnDe: "20251121",
        endDe: "20260521",
        pblntfTy: "D",
        pageNo: 1,
        pageCount: 100,
      }),
    ).rejects.toThrow(/DART_API_KEY/);
  });
});
