import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { db } from "../worker/db";
import { fetchDartList } from "../src/lib/dart/list";
import { classifyOwnership } from "../src/lib/dart/ownership-classify";
import { buildElestockMap } from "../src/lib/dart/elestock";
import { buildMajorstockMap } from "../src/lib/dart/majorstock-detail";
import type { OwnershipDetail } from "../src/lib/dart/disclosure-payloads";

const code = process.argv[2] ?? "005930";

(async () => {
  const master = await db.stockMaster.findUnique({ where: { code } });
  if (!master?.corpCode) {
    console.log("no corpCode");
    process.exit(1);
  }
  const corpCode = master.corpCode;

  const now = new Date();
  const bgnDe = `${now.getFullYear() - 4}0101`;
  const endDe = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const resp = await fetchDartList({
    corpCode,
    pblntfTy: "D",
    bgnDe,
    endDe,
    pageCount: 100,
  });
  console.log("list:", resp?.status, "count:", resp?.list?.length);

  const [eMap, mMap] = await Promise.all([
    buildElestockMap({ corpCode, bgnDe, endDe }),
    buildMajorstockMap({ corpCode, bgnDe, endDe }),
  ]);
  console.log("elestockMap size:", eMap.size, "majorMap size:", mMap.size);

  const rows = (resp?.list ?? []).slice(0, 16);
  let inserted = 0;
  for (const it of rows) {
    const base = classifyOwnership(it.report_nm);
    let detail: OwnershipDetail | null = null;
    if (base.reportType === "임원·주요주주") detail = eMap.get(it.rcept_no) ?? null;
    else if (base.reportType === "주식대량보유") detail = mMap.get(it.rcept_no) ?? null;

    const payload = { ...base, detail };
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
  console.log("inserted/upserted:", inserted);

  const sample = await db.disclosure.findMany({
    where: { code, category: "지분" },
    orderBy: { rceptDt: "desc" },
    take: 3,
  });
  for (const d of sample) {
    console.log(d.reportNm, "→", d.payload?.slice(0, 250));
  }
  process.exit(0);
})();
