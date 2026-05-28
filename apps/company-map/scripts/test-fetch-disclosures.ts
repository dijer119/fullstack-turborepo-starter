import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { db } from "../worker/db";
import { fetchDartList } from "../src/lib/dart/list";
import { fetchAlotMatter, extractDividendPayload } from "../src/lib/dart/alotMatter";
import { classifyOwnership } from "../src/lib/dart/ownership-classify";

const code = process.argv[2] ?? "005930";

(async () => {
  const master = await db.stockMaster.findUnique({ where: { code } });
  if (!master?.corpCode) {
    console.log("no corpCode for", code);
    process.exit(1);
  }
  const corpCode = master.corpCode;
  console.log(`[${code}] ${master.name} corpCode=${corpCode}`);

  // 지분
  const now = new Date();
  const bgnDe = `${now.getFullYear() - 4}0101`;
  const endDe = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const ownership = await fetchDartList({
    corpCode,
    pblntfTy: "D",
    bgnDe,
    endDe,
    pageCount: 100,
  });
  console.log(`[ownership] status=${ownership?.status} count=${ownership?.list?.length ?? 0}`);

  let inserted = 0;
  for (const it of (ownership?.list ?? []).slice(0, 16)) {
    const payload = classifyOwnership(it.report_nm);
    const rceptDt = new Date(
      `${it.rcept_dt.slice(0, 4)}-${it.rcept_dt.slice(4, 6)}-${it.rcept_dt.slice(6, 8)}`,
    );
    await db.disclosure.upsert({
      where: { rcpNo: it.rcept_no },
      create: {
        rcpNo: it.rcept_no,
        code,
        corpCode,
        reportNm: it.report_nm,
        pblntfTy: "D",
        rceptDt,
        category: "지분",
        payload: JSON.stringify(payload),
      },
      update: {
        payload: JSON.stringify(payload),
        fetchedAt: new Date(),
      },
    });
    inserted++;
  }
  console.log(`[ownership] inserted/updated ${inserted}`);

  // 배당
  for (let i = 0; i < 4; i++) {
    const bsnsYear = now.getFullYear() - 1 - i;
    const resp = await fetchAlotMatter({
      corpCode,
      bsnsYear,
      reprtCode: "11011",
    });
    console.log(`[dividend ${bsnsYear}] status=${resp?.status} items=${resp?.list?.length ?? 0}`);
    if (resp?.list && resp.list.length > 0) {
      console.log(`  sample se: ${resp.list.slice(0, 3).map(it => it.se).join(" | ")}`);
    }
    const payload = extractDividendPayload(resp);
    if (!payload) continue;
    const rcpNo = `alotMatter-${code}-${bsnsYear}-11011`;
    await db.disclosure.upsert({
      where: { rcpNo },
      create: {
        rcpNo,
        code,
        corpCode,
        reportNm: `${bsnsYear}년 현금배당`,
        pblntfTy: "alotMatter",
        rceptDt: new Date(`${bsnsYear + 1}-03-31`),
        category: "배당",
        payload: JSON.stringify(payload),
      },
      update: {
        payload: JSON.stringify(payload),
        fetchedAt: new Date(),
      },
    });
    console.log(`  → payload divPerShare=${payload.divPerShare} yield=${payload.dividendYieldPct} record=${payload.recordDate}`);
  }

  // 결과 카운트
  const counts = await db.disclosure.groupBy({
    by: ["category"],
    where: { code },
    _count: true,
  });
  console.log("[result counts]", counts);

  process.exit(0);
})();
