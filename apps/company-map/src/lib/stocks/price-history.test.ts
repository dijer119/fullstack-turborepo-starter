import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchPriceChange3M } from "./price-history";

const fixture = readFileSync(
  path.resolve(__dirname, "../../../tests/fixtures/naver-sise-3m.json"),
  "utf-8",
);

describe("fetchPriceChange3M", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses naver siseJson into current/past prices + pctChange", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => fixture,
    } as Response);

    const r = await fetchPriceChange3M("005930");
    expect(r).not.toBeNull();
    expect(r!.currentPrice).toBe(79000);
    expect(r!.pastPrice).toBe(70500);
    expect(r!.pctChange).toBeCloseTo(((79000 - 70500) / 70500) * 100, 5);
    expect(r!.pastDate.toISOString().slice(0, 10)).toBe("2026-02-23");
  });

  it("parses single-quote-style JSON (naver actual response)", async () => {
    const single = fixture.replace(/"/g, "'");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => single,
    } as Response);
    const r = await fetchPriceChange3M("005930");
    expect(r).not.toBeNull();
    expect(r!.currentPrice).toBe(79000);
  });

  it("returns null when response is empty array", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "[]",
    } as Response);
    expect(await fetchPriceChange3M("005930")).toBeNull();
  });

  it("returns null when only header row present", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '[["날짜","시가","고가","저가","종가","거래량","외국인소진율"]]',
    } as Response);
    expect(await fetchPriceChange3M("005930")).toBeNull();
  });

  it("returns null when http status not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "",
    } as Response);
    expect(await fetchPriceChange3M("005930")).toBeNull();
  });

  it("returns null when stockCode shape invalid", async () => {
    expect(await fetchPriceChange3M("ABC")).toBeNull();
  });

  it("returns null when pastPrice is 0 (would divide by zero)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '[["날짜","시가","고가","저가","종가","거래량","외국인소진율"],["20260223",0,0,0,0,0,0],["20260521",100,100,100,100,0,0]]',
    } as Response);
    expect(await fetchPriceChange3M("005930")).toBeNull();
  });
});
