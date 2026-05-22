import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { spawnSync } from "node:child_process";
import { db } from "../worker/db";

type Kind = "krx_stocks" | "vip_holdings" | "operating_income" | "trade";

const SCRIPTS: Record<Kind, string[]> = {
  krx_stocks: ["scripts/regenerate-krx-stocks.ts", "scripts/smoke-load-krx.ts"],
  vip_holdings: ["scripts/refresh-vip-holdings.ts"],
  operating_income: ["scripts/refresh-operating-income.ts"],
  trade: ["scripts/ingest-trade.ts"],
};

(async () => {
  const kind = process.argv[2] as Kind;
  if (!SCRIPTS[kind]) {
    console.error(`unknown kind: ${kind}`);
    process.exit(2);
  }
  const startedAt = new Date();
  await db.refreshState.upsert({
    where: { kind },
    create: { kind, status: "running", startedAt },
    update: { status: "running", startedAt, finishedAt: null, output: null },
  });

  let output = "";
  let ok = true;
  for (const script of SCRIPTS[kind]) {
    const proc = spawnSync("npx", ["tsx", script], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 8,
    });
    const tail = (proc.stdout || "") + (proc.stderr || "");
    output += `--- ${script} (exit ${proc.status}) ---\n${tail.slice(-1500)}\n`;
    if (proc.status !== 0) {
      ok = false;
      break;
    }
  }

  await db.refreshState.update({
    where: { kind },
    data: {
      status: ok ? "done" : "failed",
      finishedAt: new Date(),
      output: output.slice(-2000),
    },
  });
  process.exit(ok ? 0 : 1);
})();
