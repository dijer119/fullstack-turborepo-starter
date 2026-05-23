import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { db } from "../worker/db";
import { fetchDartFinancial } from "@/lib/dart/financial";
import { extractOpIncome, type ReprtCode } from "@/lib/dart/operating-income";

const CALL_DELAY_MS = 100;
const REPORT_CODES: ReprtCode[] = ["11013", "11012", "11014", "11011"];
// 최근성 순위: 3Q > 반기 > 1Q > 사업(전년). 같은 해 안에서 latest 결정용.
const REPORT_PRIORITY: Record<ReprtCode, number> = {
  "11014": 4,
  "11012": 3,
  "11013": 2,
  "11011": 1,
};

(async () => {
  const start = Date.now();
  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() - 1];

  const masters = await db.stockMaster.findMany({
    where: { corpCode: { not: null } },
    select: { code: true, corpCode: true },
  });
  console.log(
    `[op] ${masters.length} candidates × ${years.length * REPORT_CODES.length} report-slots`,
  );

  let historyUpserts = 0;
  let snapshotUpserts = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < masters.length; i++) {
    const m = masters[i];
    if (!m.corpCode) {
      skipped++;
      continue;
    }

    const collected: Array<{
      bsnsYear: number;
      reprtCode: ReprtCode;
      thstrm: bigint;
      frmtrm: bigint;
    }> = [];

    for (const year of years) {
      for (const code of REPORT_CODES) {
        try {
          const resp = await fetchDartFinancial(m.corpCode, year, code);
          await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
          if (!resp) continue;
          const op = extractOpIncome(resp);
          if (!op) continue;
          collected.push({
            bsnsYear: year,
            reprtCode: code,
            thstrm: op.thstrm,
            frmtrm: op.frmtrm,
          });
          await db.operatingIncomeHistory.upsert({
            where: {
              code_bsnsYear_reprtCode: {
                code: m.code,
                bsnsYear: year,
                reprtCode: code,
              },
            },
            create: {
              code: m.code,
              bsnsYear: year,
              reprtCode: code,
              thstrm: op.thstrm,
            },
            update: {
              thstrm: op.thstrm,
              fetchedAt: new Date(),
            },
          });
          historyUpserts++;
        } catch (e) {
          failed++;
          console.error(`[op] ${m.code} ${year}-${code} failed:`, e);
        }
      }
    }

    // FinancialSnapshot 갱신: collected 중 가장 최근 (year desc, priority desc)
    collected.sort((a, b) => {
      if (a.bsnsYear !== b.bsnsYear) return b.bsnsYear - a.bsnsYear;
      return REPORT_PRIORITY[b.reprtCode] - REPORT_PRIORITY[a.reprtCode];
    });

    if (collected.length > 0) {
      const latest = collected[0];
      const prev = collected.length > 1 ? collected[1] : null;
      // 정렬용 yoyPct 미리 계산. frmtrm=0 또는 null이면 null.
      // 흑전(base<0, curr>0)은 큰 양수, 적전(base>0, curr<0)은 큰 음수로 자연 정렬.
      const base = Number(latest.frmtrm);
      const curr = Number(latest.thstrm);
      const yoyPct =
        Number.isFinite(base) && base !== 0 && Number.isFinite(curr)
          ? ((curr - base) / Math.abs(base)) * 100
          : null;
      await db.financialSnapshot.upsert({
        where: { code: m.code },
        create: {
          code: m.code,
          latestBsnsYear: latest.bsnsYear,
          latestReprtCode: latest.reprtCode,
          opIncome: latest.thstrm,
          opIncomeYoyBase: latest.frmtrm,
          opIncomePrevReport: prev?.thstrm ?? null,
          opIncomeYoyPct: yoyPct,
        },
        update: {
          latestBsnsYear: latest.bsnsYear,
          latestReprtCode: latest.reprtCode,
          opIncome: latest.thstrm,
          opIncomeYoyBase: latest.frmtrm,
          opIncomePrevReport: prev?.thstrm ?? null,
          opIncomeYoyPct: yoyPct,
          fetchedAt: new Date(),
        },
      });
      snapshotUpserts++;
    }

    if ((i + 1) % 50 === 0) {
      console.log(
        `[op] progress ${i + 1}/${masters.length} (history=${historyUpserts}, snapshot=${snapshotUpserts}, failed=${failed})`,
      );
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(
    `[op] done in ${elapsed}s { history: ${historyUpserts}, snapshot: ${snapshotUpserts}, skipped: ${skipped}, failed: ${failed} }`,
  );
  process.exit(0);
})();
