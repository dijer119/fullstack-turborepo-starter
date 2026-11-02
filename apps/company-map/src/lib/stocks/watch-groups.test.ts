import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma-clients/company-map";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveWatchGroup, deleteWatchGroup, setWatchMembership, recordRecentStock } from "./watch-groups";

let db: PrismaClient, folder: string;
beforeEach(async () => {
  folder = mkdtempSync(path.join(tmpdir(), "watch-groups-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(folder, "test.db")}` } } });
  for (const migration of ["20260623112611_add_stock_watch", "20260623120047_add_watch_purchase_price", "20261031020000_add_watch_groups_recent"]) {
    const sql = readFileSync(path.resolve(__dirname, `../../../prisma/migrations/${migration}/migration.sql`), "utf8");
    for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
  }
  await db.stockWatch.create({ data: { symbol: "005930", name: "삼성전자", currency: "KRW", purchasePrice: 100 } });
});
afterEach(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }); });

describe("관심 그룹과 최근 본 종목", () => {
  it("여러 그룹에 중복 없이 등록하고 그룹 삭제 시 종목·구매가를 보존한다", async () => {
    const first = await saveWatchGroup(db, null, "  반도체  ");
    const second = await saveWatchGroup(db, null, "배당");
    await setWatchMembership(db, first.id, "005930", true);
    await setWatchMembership(db, first.id, "005930", true);
    await setWatchMembership(db, second.id, "005930", true);
    expect(await db.stockWatchMembership.count()).toBe(2);
    expect((await saveWatchGroup(db, first.id, "기술주")).name).toBe("기술주");
    await deleteWatchGroup(db, first.id);
    expect(await db.stockWatchMembership.count()).toBe(1);
    expect(await db.stockWatch.findUniqueOrThrow({ where: { symbol: "005930" } })).toMatchObject({ purchasePrice: 100 });
    await setWatchMembership(db, second.id, "005930", false);
    expect(await db.stockWatchMembership.count()).toBe(0);
  });
  it("빈 이름·긴 이름·중복 이름·없는 종목을 거절한다", async () => {
    await expect(saveWatchGroup(db, null, " ")).rejects.toThrow();
    await expect(saveWatchGroup(db, null, "가".repeat(31))).rejects.toThrow();
    const group = await saveWatchGroup(db, null, "반도체");
    await expect(saveWatchGroup(db, null, "반도체")).rejects.toThrow();
    await expect(setWatchMembership(db, group.id, "UNKNOWN", true)).rejects.toThrow();
    await expect(setWatchMembership(db, "missing", "005930", true)).rejects.toThrow();
  });
  it("관심종목 삭제는 그룹 연결만 정리하고 최근 기록은 유지한다", async () => {
    const group = await saveWatchGroup(db, null, "반도체");
    await setWatchMembership(db, group.id, "005930", true);
    await recordRecentStock(db, { symbol: "005930", name: "삼성전자", currency: "KRW", market: "KOSPI" });
    await db.stockWatch.delete({ where: { symbol: "005930" } });
    expect(await db.stockWatchMembership.count()).toBe(0);
    expect(await db.recentStockView.count()).toBe(1);
  });
  it("최근 본은 최신순·종목 중복 없이 30개만 보존한다", async () => {
    for (let i = 0; i < 32; i++) await recordRecentStock(db, { symbol: String(i).padStart(6, "0"), name: `종목${i}`, market: "KOSPI", currency: "KRW" }, new Date(1000 + i));
    expect(await db.recentStockView.count()).toBe(30);
    expect(await db.recentStockView.findUnique({ where: { symbol: "000000" } })).toBeNull();
    await recordRecentStock(db, { symbol: "000002", name: "변경 이름", market: "KOSPI", currency: "KRW" }, new Date(5000));
    expect(await db.recentStockView.count()).toBe(30);
    expect(await db.recentStockView.findFirst({ orderBy: { viewedAt: "desc" } })).toMatchObject({ symbol: "000002", name: "변경 이름" });
  });
});
