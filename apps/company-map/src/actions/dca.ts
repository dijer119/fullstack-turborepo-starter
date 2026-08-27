"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  getDailyCandles,
  getExchangeRate,
  getMarketCalendarUS,
  getPrices,
} from "@/lib/toss/client";
import { drawdownPct, pickSymbol, seedPeak } from "@/lib/dca/peak";
import { estimateQuantity, planAmountBuy, type DcaAmountPlan } from "@/lib/dca/sizing";
import { deriveHoldings } from "@/lib/dca/state";
import { runDca, type DcaNoOrderReason } from "@/lib/dca/run-dca";
import { isDcaKilled, tossDcaDeps, PEAK_SEED_COUNT } from "@/lib/dca/toss-deps";

const PAGE = "/stocks/dca";

export interface DcaAccountView {
  id: string;
  name: string;
  baseSymbol: string;
  leverSymbol: string;
  thresholdPct: number;
  dailyAmountKrw: number;
  cashKrw: number;
  peakPrice: number;
  peakDate: string;
  status: string;
  dryRun: boolean;
  note: string | null;
  startDate: string;
  lastRunDate: string | null;
  /** base 종목 현재가 (조회 실패 시 null) */
  basePrice: number | null;
  /** 현재가 기준 낙폭(%) — 판정은 워커가 전일 종가로 한다는 점을 화면에 안내 */
  currentDrawdownPct: number | null;
  /** 지금 시점 기준 매수 대상 */
  pickedSymbol: string | null;
  leveraged: boolean;
  pickedPrice: number | null;
  fxRate: number | null;
  /** 오늘 주문 미리보기. 잔액이 1센트 미만이면 null */
  plan: DcaAmountPlan | null;
  /** plan 금액으로 지금 살 수 있는 예상 수량. 시세 조회 실패 등으로 plan이나 가격이 없으면 null */
  estQuantity: number | null;
  /** 종목별 보유수량 */
  holdings: Record<string, number>;
  /** 보유 평가액 USD (시세 조회 실패 종목은 제외) */
  evalUsd: number | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listDcaAccounts(): Promise<DcaAccountView[]> {
  const accounts = await db.dcaAccount.findMany({ orderBy: { createdAt: "asc" } });
  const views: DcaAccountView[] = [];

  for (const acc of accounts) {
    // 계좌의 현재 모드와 같은 주문만 센다 — 시뮬레이션으로 몇 주 돌린 뒤 LIVE로 전환한
    // 계좌에서 종이 체결과 실제 체결이 섞여 보유·평가액이 실보유와 어긋나는 것을 막는다.
    const fills = await db.dcaOrder.findMany({
      where: {
        accountId: acc.id,
        dryRun: acc.dryRun,
        status: { in: ["simulated_filled", "filled"] },
      },
      select: { symbol: true, filledQty: true },
    });
    const holdings = deriveHoldings(fills);

    let basePrice: number | null = null;
    let leverPrice: number | null = null;
    let fxRate: number | null = null;
    try {
      const symbols = [acc.baseSymbol, acc.leverSymbol];
      const prices = await getPrices(symbols);
      basePrice = Number(prices.find((p) => p.symbol === acc.baseSymbol)?.lastPrice ?? 0) || null;
      leverPrice = Number(prices.find((p) => p.symbol === acc.leverSymbol)?.lastPrice ?? 0) || null;
      fxRate = (await getExchangeRate("USD", "KRW")) || null;
    } catch {
      // 시세·환율 실패는 화면에서 "—"로 표시한다
    }

    const currentDrawdownPct = basePrice != null ? drawdownPct(basePrice, acc.peakPrice) : null;
    const pick =
      basePrice != null
        ? pickSymbol({
            prevClose: basePrice,
            peak: acc.peakPrice,
            thresholdPct: acc.thresholdPct,
            baseSymbol: acc.baseSymbol,
            leverSymbol: acc.leverSymbol,
          })
        : null;
    const pickedPrice = pick == null ? null : pick.leveraged ? leverPrice : basePrice;

    const plan = fxRate != null ? planAmountBuy({ cashKrw: acc.cashKrw, fxRate }) : null;
    const estQuantity =
      plan != null && pickedPrice != null ? estimateQuantity(plan.amountUsd, pickedPrice) : null;

    let evalUsd: number | null = null;
    if (basePrice != null && leverPrice != null) {
      evalUsd =
        Math.round(
          ((holdings[acc.baseSymbol] ?? 0) * basePrice +
            (holdings[acc.leverSymbol] ?? 0) * leverPrice) *
            100,
        ) / 100;
    }

    views.push({
      id: acc.id,
      name: acc.name,
      baseSymbol: acc.baseSymbol,
      leverSymbol: acc.leverSymbol,
      thresholdPct: acc.thresholdPct,
      dailyAmountKrw: acc.dailyAmountKrw,
      cashKrw: acc.cashKrw,
      peakPrice: acc.peakPrice,
      peakDate: acc.peakDate,
      status: acc.status,
      dryRun: acc.dryRun,
      note: acc.note,
      startDate: acc.startDate,
      lastRunDate: acc.lastRunDate,
      basePrice,
      currentDrawdownPct,
      pickedSymbol: pick?.symbol ?? null,
      leveraged: pick?.leveraged ?? false,
      pickedPrice,
      fxRate,
      plan,
      estQuantity,
      holdings,
      evalUsd,
    });
  }
  return views;
}

/** 계좌 생성 폼에서 peak 자동 시딩 값을 미리 보여주기 위한 조회. */
export async function previewSeedPeak(
  symbol: string,
): Promise<{ price: number; date: string; candles: number } | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  try {
    const candles = await getDailyCandles(sym, PEAK_SEED_COUNT);
    const seed = seedPeak(candles);
    return seed ? { ...seed, candles: candles.length } : null;
  } catch {
    return null;
  }
}

export interface CreateDcaInput {
  name: string;
  baseSymbol: string;
  leverSymbol: string;
  thresholdPct: number;
  dailyAmountKrw: number;
  /** 비우면 base 종목 일봉 최고 종가로 자동 시딩 */
  peakPrice: number | null;
  initialCashKrw: number;
}

export async function createDcaAccount(
  input: CreateDcaInput,
): Promise<{ ok: boolean; error?: string }> {
  const base = input.baseSymbol.trim().toUpperCase();
  const lever = input.leverSymbol.trim().toUpperCase();
  if (!base || !lever) return { ok: false, error: "기준·레버리지 종목을 모두 입력하세요" };
  if (base === lever) return { ok: false, error: "기준 종목과 레버리지 종목이 같습니다" };
  if (!(input.thresholdPct > 0) || input.thresholdPct >= 100) {
    return { ok: false, error: "하락 임계%는 0~100 사이여야 합니다" };
  }
  // Infinity 방어 — Number("Infinity")는 `> 0` 검사를 통과한다. dailyAmountKrw가 Infinity면
  // accrue가 영구 무동작이 되고, peakPrice가 Infinity면 낙폭이 항상 −100%라 매일 레버리지를 산다.
  if (!(input.dailyAmountKrw > 0) || !Number.isFinite(input.dailyAmountKrw)) {
    return { ok: false, error: "거래일당 적립액은 0보다 커야 합니다" };
  }
  if (!(input.initialCashKrw >= 0) || !Number.isFinite(input.initialCashKrw)) {
    return { ok: false, error: "초기 잔액은 음수 불가" };
  }

  const today = todayIso();
  let peakPrice = input.peakPrice;
  let peakDate = today;
  if (peakPrice == null || !(peakPrice > 0) || !Number.isFinite(peakPrice)) {
    const seed = await previewSeedPeak(base);
    if (!seed) {
      return { ok: false, error: `${base} 일봉을 받지 못했습니다 — 최고가를 직접 입력하세요` };
    }
    peakPrice = seed.price;
    peakDate = seed.date;
  }

  await db.dcaAccount.create({
    data: {
      name: input.name.trim() || `${base}·${lever} 적립식`,
      baseSymbol: base,
      leverSymbol: lever,
      thresholdPct: input.thresholdPct,
      dailyAmountKrw: input.dailyAmountKrw,
      cashKrw: input.initialCashKrw,
      peakPrice,
      peakDate,
      startDate: today,
      dryRun: true, // LIVE 전환은 생성 후 사용자가 직접
    },
  });
  revalidatePath(PAGE);
  return { ok: true };
}

export async function setDcaStatus(
  id: string,
  status: "active" | "paused" | "stopped",
): Promise<void> {
  await db.dcaAccount.update({ where: { id }, data: { status } });
  revalidatePath(PAGE);
}

export async function updateDcaSettings(
  id: string,
  patch: {
    thresholdPct?: number;
    dailyAmountKrw?: number;
    cashKrw?: number;
    peakPrice?: number;
    dryRun?: boolean;
    /** dryRun: false로 전환할 때만 확인용 — DB에는 저장하지 않는다 */
    confirmLive?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (patch.thresholdPct !== undefined && (!(patch.thresholdPct > 0) || patch.thresholdPct >= 100)) {
    return { ok: false, error: "하락 임계%는 0~100 사이여야 합니다" };
  }
  // Infinity 방어 — createDcaAccount와 같은 이유(Number("Infinity")가 `> 0`을 통과한다).
  if (
    patch.dailyAmountKrw !== undefined &&
    (!(patch.dailyAmountKrw > 0) || !Number.isFinite(patch.dailyAmountKrw))
  ) {
    return { ok: false, error: "거래일당 적립액은 0보다 커야 합니다" };
  }
  if (
    patch.cashKrw !== undefined &&
    (!(patch.cashKrw >= 0) || !Number.isFinite(patch.cashKrw))
  ) {
    return { ok: false, error: "이월 잔액은 음수 불가" };
  }
  if (
    patch.peakPrice !== undefined &&
    (!(patch.peakPrice > 0) || !Number.isFinite(patch.peakPrice))
  ) {
    return { ok: false, error: "최고가는 0보다 커야 합니다" };
  }
  const { confirmLive, ...data } = patch;
  if (data.dryRun === false) {
    const acc = await db.dcaAccount.findUniqueOrThrow({ where: { id } });
    if (acc.dryRun && !confirmLive) {
      return { ok: false, error: "실거래(LIVE) 전환은 명시적 확인이 필요합니다" };
    }
  }
  await db.dcaAccount.update({ where: { id }, data });
  revalidatePath(PAGE);
  return { ok: true };
}

/** 현재 열린 US 정규장 세션의 거래일. 없으면 null. (worker/us-market.ts와 동일 판정) */
async function currentUsTradeDate(): Promise<string | null> {
  const cal = await getMarketCalendarUS();
  const now = Date.now();
  for (const day of [cal.previousBusinessDay, cal.today, cal.nextBusinessDay]) {
    const reg = day?.regularMarket as { startTime?: string; endTime?: string } | undefined;
    if (!reg?.startTime || !reg?.endTime) continue;
    const open = new Date(reg.startTime).getTime();
    const close = new Date(reg.endTime).getTime();
    if (now >= open && now < close) return day.date;
  }
  return null;
}

/** noOrderReason별 사용자 안내 문구. 계좌 note(마지막 경고 배지)는 재사용하지 않는다 —
 * note는 alreadyToday 경로에서 의도적으로 보존되므로 이번 실행과 무관한 과거 경고일 수 있다. */
function noOrderMessage(reason: DcaNoOrderReason): string {
  switch (reason) {
    case "window_closed":
      return "정규장 종료 1시간 전이 지나 오늘은 적립만 반영됐습니다";
    case "below_min_amount":
      return "잔액 환산액이 1센트 미만이라 적립만 반영됐습니다";
    case "already_ordered":
      return "오늘 이미 주문이 접수돼 추가 주문 없이 종료했습니다";
    case "submit_unknown":
      return "주문을 제출했지만 결과가 확인되지 않았습니다 — 토스 앱에서 체결 여부를 직접 확인하세요";
  }
}

export async function runDcaNow(id: string): Promise<{ ok: boolean; message: string }> {
  const tradeDate = await currentUsTradeDate();
  if (!tradeDate) return { ok: false, message: "US 정규장이 열려있지 않습니다" };
  const r = await runDca(db, tossDcaDeps(), id, tradeDate, isDcaKilled());
  revalidatePath(PAGE);
  if (r.blocked) return { ok: false, message: `보류: ${r.blocked}` };
  const parts = [
    r.symbol ? `대상 ${r.symbol}` : null,
    r.drawdownPct != null ? `낙폭 ${r.drawdownPct}%` : null,
    r.accrued ? "적립 반영" : "적립 이미 완료",
    r.placed > 0
      ? "실주문 1건 제출"
      : r.simulated > 0
        ? "시뮬레이션 1건 기록"
        : r.noOrderReason
          ? noOrderMessage(r.noOrderReason)
          : "주문 없음",
  ].filter(Boolean);
  return { ok: true, message: parts.join(" · ") };
}

export async function getDcaOrders(id: string, limit = 100) {
  return db.dcaOrder.findMany({
    where: { accountId: id },
    orderBy: [{ tradeDate: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}
