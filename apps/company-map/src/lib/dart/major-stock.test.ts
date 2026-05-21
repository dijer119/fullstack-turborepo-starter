import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchMajorStockByCorp } from "./major-stock";

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../tests/fixtures/dart-majorstock-sample.json"),
    "utf-8",
  ),
);

describe("fetchMajorStockByCorp", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.DART_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses majorstock.json into typed rows with numeric ratio", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    } as Response);

    const rows = await fetchMajorStockByCorp("00567890");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      rcpNo: "20260518000285",
      stockRatio: 5.12,
      stockRatioChange: 0.34,
      reportResn: "신규보고",
    });
    expect(rows[1].stockRatioChange).toBeNull();
  });

  it("returns [] on DART status 013 (no data)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "013", message: "조회된 데이타가 없습니다" }),
    } as Response);
    const rows = await fetchMajorStockByCorp("00111111");
    expect(rows).toEqual([]);
  });

  it("throws on other DART error status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "020", message: "인증 오류" }),
    } as Response);
    await expect(fetchMajorStockByCorp("00111111")).rejects.toThrow(/020/);
  });

  it("throws when DART_API_KEY is missing", async () => {
    delete process.env.DART_API_KEY;
    await expect(fetchMajorStockByCorp("00111111")).rejects.toThrow(/DART_API_KEY/);
  });
});
