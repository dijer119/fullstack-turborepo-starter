import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { db } from "../worker/db";

(async () => {
  const a = await db.stockMaster.count({
    where: { financialSnapshot: { opIncomeYoyPct: { not: null } } },
  });
  console.log("count via relation { opIncomeYoyPct: { not: null } }:", a);

  const b = await db.stockMaster.count({
    where: { financialSnapshot: { is: { opIncomeYoyPct: { not: null } } } },
  });
  console.log("count via relation { is: { opIncomeYoyPct: { not: null } } }:", b);

  const c = await db.stockMaster.count({
    where: { financialSnapshot: { isNot: null } },
  });
  console.log("count via { isNot: null }:", c);

  const d = await db.financialSnapshot.count({
    where: { opIncomeYoyPct: { not: null } },
  });
  console.log("direct financialSnapshot count:", d);

  const sample = await db.stockMaster.findMany({
    where: { financialSnapshot: { opIncomeYoyPct: { not: null } } },
    orderBy: [
      { financialSnapshot: { opIncomeYoyPct: "desc" } },
      { marcap: "desc" },
    ],
    take: 3,
    select: {
      code: true,
      name: true,
      financialSnapshot: { select: { opIncomeYoyPct: true } },
    },
  });
  console.log("top 3 by yoy desc:", JSON.stringify(sample, null, 2));

  process.exit(0);
})();
