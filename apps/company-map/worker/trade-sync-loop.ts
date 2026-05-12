import { db } from "./db";
import { syncMonth } from "../src/lib/trade/upsert";
import { CATEGORIES, type CategoryKey } from "../src/lib/trade/categories";

/** 매월 잠정치(1~5일경) + 확정치(15일경) 동기화 트리거 일자. */
const SYNC_DAYS = new Set([1, 2, 3, 4, 5, 15]);

/** TRADE_SYNC_FORCE=1 환경변수로 날짜 체크 무시 (수동 테스트용). */
const FORCE = process.env.TRADE_SYNC_FORCE === "1";

type TickResult = {
  category: CategoryKey;
  ym6: string;
  skipped: boolean;
  reason?: string;
  saved?: number;
};

function previousMonth(d: Date = new Date()): { ym6: string; ymDot: string } {
  const x = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const y = x.getFullYear();
  const m = x.getMonth() + 1;
  return {
    ym6: `${y}${String(m).padStart(2, "0")}`,
    ymDot: `${y}.${String(m).padStart(2, "0")}`,
  };
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

async function syncIfDue(category: CategoryKey): Promise<TickResult> {
  const today = new Date();
  const { ym6, ymDot } = previousMonth(today);

  if (!FORCE && !SYNC_DAYS.has(today.getDate())) {
    return { category, ym6, skipped: true, reason: "not a sync day" };
  }

  // 오늘 이미 같은 (category, prev month) 동기화 실행했다면 skip.
  // FORCE 모드에서도 의도된 재실행이므로 이 체크는 무시.
  if (!FORCE) {
    const recent = await db.tradeStat.findFirst({
      where: { category, yearMonth: ymDot },
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    });
    if (recent && isSameLocalDay(recent.fetchedAt, today)) {
      return { category, ym6, skipped: true, reason: "already synced today" };
    }
  }

  const r = await syncMonth(db, category, ym6);
  return { category, ym6, skipped: false, saved: r.saved };
}

/** worker 메인 루프에서 매 사이클마다 호출. CATEGORIES 전체 순회. */
export async function tradeSyncTick(): Promise<TickResult[]> {
  const results: TickResult[] = [];
  for (const c of CATEGORIES) {
    try {
      const r = await syncIfDue(c.key);
      results.push(r);
      if (r.skipped) {
        console.log(`[trade-sync] ${c.key} ${r.ym6}: skip (${r.reason})`);
      } else {
        console.log(`[trade-sync] ${c.key} ${r.ym6}: ${r.saved} rows`);
      }
    } catch (err) {
      console.error(`[trade-sync] ${c.key} error:`, err);
      results.push({
        category: c.key,
        ym6: previousMonth().ym6,
        skipped: true,
        reason: (err as Error).message,
      });
    }
  }
  return results;
}
