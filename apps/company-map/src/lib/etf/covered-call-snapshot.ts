import "server-only";
import { db } from "@/lib/db";
import initialEtfs from "@/data/covered-call-etfs.json";

export interface CoveredCallEtf {
  code: string;
  name: string;
  category: string;
  manager: string;
  index: string;
  price: number;
  price_date?: string;
  amount: number;
  recent: number;
  frequency: string;
  count: number;
  base_date: string;
  pay_date: string;
  full: boolean;
  source_basis?: string;
  yield_ttm: number;
  yield_latest: number;
  url: string;
}

export interface CoveredCallSnapshot {
  etfs: CoveredCallEtf[];
  updatedAt: string | null;
}

export async function getCoveredCallSnapshot(): Promise<CoveredCallSnapshot> {
  const snapshot = await db.coveredCallSnapshot.findUnique({ where: { id: "latest" } });
  if (!snapshot) return { etfs: initialEtfs, updatedAt: null };

  try {
    const etfs = JSON.parse(snapshot.payload) as CoveredCallEtf[];
    if (Array.isArray(etfs) && etfs.length > 0) {
      return { etfs, updatedAt: snapshot.updatedAt.toISOString() };
    }
  } catch {
    // 손상된 스냅샷은 마지막으로 코드에 포함된 자료로 표시한다.
  }

  return { etfs: initialEtfs, updatedAt: null };
}

export async function saveCoveredCallSnapshot(etfs: CoveredCallEtf[]): Promise<Date> {
  const saved = await db.coveredCallSnapshot.upsert({
    where: { id: "latest" },
    create: { id: "latest", payload: JSON.stringify(etfs) },
    update: { payload: JSON.stringify(etfs) },
  });
  return saved.updatedAt;
}
