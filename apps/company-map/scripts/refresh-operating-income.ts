import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { db } from "../worker/db";
import {
  findLatestOpIncomeReport,
  fetchPrevOpIncomeReport,
} from "@/lib/dart/operating-income";

const CALL_DELAY_MS = 100;

(async () => {
  const start = Date.now();
  const masters = await db.stockMaster.findMany({
    where: { corpCode: { not: null } },
    select: { code: true, corpCode: true },
  });
  console.log(`[op] ${masters.length} candidates`);

  let upserted = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < masters.length; i++) {
    const m = masters[i];
    if (!m.corpCode) {
      skipped++;
      continue;
    }
    try {
      const latest = await findLatestOpIncomeReport(m.corpCode);
      await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
      if (!latest) {
        skipped++;
        continue;
      }
      const prev = await fetchPrevOpIncomeReport(m.corpCode, latest);
      await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
      await db.financialSnapshot.upsert({
        where: { code: m.code },
        create: {
          code: m.code,
          latestBsnsYear: latest.bsnsYear,
          latestReprtCode: latest.reprtCode,
          opIncome: latest.thstrm,
          opIncomeYoyBase: latest.frmtrm,
          opIncomePrevReport: prev?.thstrm ?? null,
        },
        update: {
          latestBsnsYear: latest.bsnsYear,
          latestReprtCode: latest.reprtCode,
          opIncome: latest.thstrm,
          opIncomeYoyBase: latest.frmtrm,
          opIncomePrevReport: prev?.thstrm ?? null,
          fetchedAt: new Date(),
        },
      });
      upserted++;
    } catch (e) {
      failed++;
      console.error(`[op] ${m.code} failed:`, e);
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[op] progress ${i + 1}/${masters.length} (upserted=${upserted}, skipped=${skipped}, failed=${failed})`,
      );
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(
    `[op] done in ${elapsed}s { upserted: ${upserted}, skipped: ${skipped}, failed: ${failed} }`,
  );
  process.exit(0);
})();
