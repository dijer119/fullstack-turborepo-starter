import type { PrismaClient } from "@prisma-clients/company-map";

export async function saveWatchGroup(db: PrismaClient, id: string | null, rawName: string) {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name || name.length > 30) throw new Error("그룹 이름은 1~30자로 입력하세요.");
  try {
    return id ? await db.stockWatchGroup.update({ where: { id }, data: { name } })
      : await db.stockWatchGroup.create({ data: { name } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002")
      throw new Error("같은 이름의 그룹이 있습니다.");
    throw error;
  }
}

export async function deleteWatchGroup(db: PrismaClient, id: string) {
  await db.stockWatchGroup.deleteMany({ where: { id } });
}

export async function setWatchMembership(db: PrismaClient, groupId: string, symbol: string, selected: boolean) {
  if (typeof selected !== "boolean") throw new Error("그룹 선택값을 확인하세요.");
  if (selected) {
    await db.stockWatchMembership.upsert({ where: { groupId_symbol: { groupId, symbol } }, create: { groupId, symbol }, update: {} });
  } else await db.stockWatchMembership.deleteMany({ where: { groupId, symbol } });
}

export async function recordRecentStock(db: PrismaClient, stock: { symbol: string; name: string; market: string | null; currency: string | null }, now = new Date()) {
  await db.$transaction(async tx => {
    await tx.recentStockView.upsert({ where: { symbol: stock.symbol }, create: { ...stock, viewedAt: now }, update: { ...stock, viewedAt: now } });
    const older = await tx.recentStockView.findMany({ orderBy: [{ viewedAt: "desc" }, { symbol: "asc" }], skip: 30, select: { symbol: true } });
    if (older.length) await tx.recentStockView.deleteMany({ where: { symbol: { in: older.map(r => r.symbol) } } });
  });
}
