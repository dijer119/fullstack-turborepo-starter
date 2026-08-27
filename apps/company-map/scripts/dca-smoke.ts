// DCA 오케스트레이터 스모크 테스트. dryRun 계좌를 임시로 만들어 같은 거래일에 runDca를
// 두 번 실행하고, 적립·주문이 중복되지 않는지 실DB에서 확인한 뒤 계좌를 삭제한다.
// 실주문 경로는 타지 않는다 (dryRun: true). 토스 호출은 시세·일봉·환율 읽기 전용.
import "../worker/setup-env";
import { PrismaClient } from "@prisma-clients/company-map";
import { runDca } from "../src/lib/dca/run-dca";
import { seedPeak } from "../src/lib/dca/peak";
import { tossDcaDeps, PEAK_SEED_COUNT } from "../src/lib/dca/toss-deps";
import { getDailyCandles } from "../src/lib/toss/client";

const TRADE_DATE = process.argv[2] ?? new Date().toISOString().slice(0, 10);

async function main() {
  const db = new PrismaClient();
  const deps = tossDcaDeps();

  const candles = await getDailyCandles("QQQ", PEAK_SEED_COUNT);
  const seed = seedPeak(candles);
  if (!seed) throw new Error("QQQ 일봉을 받지 못했습니다");
  console.log(`[smoke] peak 시딩: ${seed.price} (${seed.date}), 일봉 ${candles.length}건`);

  const acc = await db.dcaAccount.create({
    data: {
      name: "[smoke] 임시 계좌",
      peakPrice: seed.price,
      peakDate: seed.date,
      startDate: TRADE_DATE,
      dailyAmountKrw: 50_000,
      dryRun: true,
    },
  });
  console.log(`[smoke] 계좌 생성: ${acc.id}`);

  try {
    const r1 = await runDca(db, deps, acc.id, TRADE_DATE, false);
    console.log("[smoke] 1회차:", r1);

    const after1 = await db.dcaAccount.findUniqueOrThrow({ where: { id: acc.id } });
    const orders1 = await db.dcaOrder.count({ where: { accountId: acc.id } });
    console.log(`[smoke] 1회차 후 cashKrw=${after1.cashKrw} 주문=${orders1}건 lastRun=${after1.lastRunDate}`);

    // lastRunDate 가드를 우회해 "지금 실행" 재호출 상황을 재현한다.
    await db.dcaAccount.update({ where: { id: acc.id }, data: { lastRunDate: null } });
    const r2 = await runDca(db, deps, acc.id, TRADE_DATE, false);
    console.log("[smoke] 2회차:", r2);

    const after2 = await db.dcaAccount.findUniqueOrThrow({ where: { id: acc.id } });
    const orders2 = await db.dcaOrder.count({ where: { accountId: acc.id } });
    console.log(`[smoke] 2회차 후 cashKrw=${after2.cashKrw} 주문=${orders2}건`);

    const ok =
      after1.cashKrw === after2.cashKrw && orders1 === orders2 && r2.accrued === false;
    console.log(ok ? "✅ 중복 적립·중복 주문 없음" : "❌ 재실행에서 상태가 변했습니다");
    if (!ok) process.exitCode = 1;
  } finally {
    await db.dcaAccount.delete({ where: { id: acc.id } });
    console.log("[smoke] 임시 계좌 삭제 완료");
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
