import { db } from "./db";
import seed from "@/data/krx_stocks.json" with { type: "json" };
import type { KrxStockSeed } from "@/types/stocks";

/** Seed JSON → StockMaster upsert. 기존 corpCode는 보존. */
export async function loadKrxStocks(): Promise<number> {
  const stocks = seed as KrxStockSeed[];
  let upserted = 0;
  for (const s of stocks) {
    if (!s.Code) continue;
    const marcap = s.Marcap != null ? BigInt(Math.round(s.Marcap)) : null;
    const market = s.Market ?? null;
    await db.stockMaster.upsert({
      where: { code: s.Code },
      create: { code: s.Code, name: s.Name, market, marcap },
      update: { name: s.Name, market, marcap },
    });
    upserted++;
  }
  console.log(`[krx] upserted ${upserted} stock masters`);
  return upserted;
}
