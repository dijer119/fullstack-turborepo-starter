import { db } from "../../../worker/db";
import { fetchPriceChange3M } from "./price-history";

const KIND = "price_changes";
const CALL_DELAY_MS = 100;

export interface RefreshPriceChangesResult {
  total: number;
  upserted: number;
  skipped: number;
  failed: number;
}

export async function refreshPriceChanges(): Promise<RefreshPriceChangesResult> {
  const startedAt = new Date();
  await db.refreshState.upsert({
    where: { kind: KIND },
    create: { kind: KIND, status: "running", startedAt },
    update: { status: "running", startedAt, finishedAt: null, output: null },
  });

  const masters = await db.stockMaster.findMany({ select: { code: true } });
  const total = masters.length;
  let upserted = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < masters.length; i++) {
    const code = masters[i].code;
    try {
      const r = await fetchPriceChange3M(code);
      await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
      if (!r) {
        skipped++;
        continue;
      }
      await db.priceChange.upsert({
        where: { code },
        create: {
          code,
          currentPrice: r.currentPrice,
          pastPrice: r.pastPrice,
          pastDate: r.pastDate,
          pctChange: r.pctChange,
        },
        update: {
          currentPrice: r.currentPrice,
          pastPrice: r.pastPrice,
          pastDate: r.pastDate,
          pctChange: r.pctChange,
          fetchedAt: new Date(),
        },
      });
      upserted++;
    } catch (e) {
      failed++;
      if (failures.length < 5) failures.push(`${code}: ${String(e).slice(0, 100)}`);
    }
    if ((i + 1) % 200 === 0) {
      console.log(
        `[price-change] progress ${i + 1}/${total} (upserted=${upserted}, skipped=${skipped}, failed=${failed})`,
      );
    }
  }

  const outputLine = `total=${total} upserted=${upserted} skipped=${skipped} failed=${failed}`;
  const output =
    failed > 0 ? `${outputLine}\nsample failures:\n${failures.join("\n")}` : outputLine;
  await db.refreshState.update({
    where: { kind: KIND },
    data: {
      status: "done",
      finishedAt: new Date(),
      output: output.slice(-2000),
    },
  });

  return { total, upserted, skipped, failed };
}
