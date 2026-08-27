// DCA 오케스트레이터 스모크 테스트. dryRun 계좌를 임시로 만들어 같은 거래일에 runDca를
// 두 번 실행하고, 적립·주문·차감이 중복되지 않는지 실DB에서 확인한 뒤 계좌를 삭제한다.
// 실주문 경로는 타지 않는다 (dryRun: true). 토스 호출은 시세·일봉·환율·캘린더 읽기 전용.
// 금액 기반 주문은 시장가라 1회차에서 주문이 만들어지고 그 자리에서 체결·차감까지 끝난다.
// 단 주문 접수 창(정규장 종료 1시간 전)이 닫혀 있으면 1회차는 적립만 하고 넘어간다 — 그
// 경우에도 "재실행이 상태를 바꾸지 않는다"는 이 스모크의 검증 대상은 그대로 성립한다.
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

  // 조회 실패는 "닫힘"이 아니라 별개 상태다(run-dca는 이 경우 block으로 재시도를 남긴다).
  let windowOpen: boolean | null = null;
  try {
    windowOpen = await deps.isAmountOrderWindowOpen();
  } catch (e) {
    console.log(`[smoke] 금액 기반 주문 접수 창: 확인 실패 — ${e instanceof Error ? e.message : e}`);
  }
  if (windowOpen !== null) {
    console.log(`[smoke] 금액 기반 주문 접수 창: ${windowOpen ? "열림" : "닫힘(적립만 예상)"}`);
  }

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
    const orders1 = await db.dcaOrder.findMany({ where: { accountId: acc.id } });
    console.log(
      `[smoke] 1회차 후 cashKrw=${after1.cashKrw} 주문=${orders1.length}건 lastRun=${after1.lastRunDate}`,
    );
    for (const o of orders1) {
      console.log(
        `[smoke]   → ${o.symbol} ${o.status} $${o.amountUsd} (${o.amountKrw}원) ` +
          `수량≈${o.filledQty ?? o.quantity} 체결가=${o.filledPrice ?? "-"} 반영=${o.stateApplied}`,
      );
    }
    if (windowOpen === true && r1.simulated !== 1) {
      console.log(
        `[smoke] ⚠️ 창이 열려 있는데 1회차 주문이 생기지 않았습니다 ` +
          `(blocked=${r1.blocked} noOrderReason=${r1.noOrderReason})`,
      );
    }

    // lastRunDate 가드를 우회해 "지금 실행" 재호출 상황을 재현한다.
    await db.dcaAccount.update({ where: { id: acc.id }, data: { lastRunDate: null } });
    const r2 = await runDca(db, deps, acc.id, TRADE_DATE, false);
    console.log("[smoke] 2회차:", r2);

    const after2 = await db.dcaAccount.findUniqueOrThrow({ where: { id: acc.id } });
    const orders2 = await db.dcaOrder.count({ where: { accountId: acc.id } });
    console.log(`[smoke] 2회차 후 cashKrw=${after2.cashKrw} 주문=${orders2}건`);

    const ok =
      after1.cashKrw === after2.cashKrw &&
      orders1.length === orders2 &&
      r2.accrued === false &&
      r2.simulated === 0 &&
      r2.placed === 0;
    console.log(ok ? "✅ 중복 적립·중복 주문·중복 차감 없음" : "❌ 재실행에서 상태가 변했습니다");
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
