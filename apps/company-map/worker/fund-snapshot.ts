import { db } from "./db";
import { snapshotFundWith, fundStamp } from "@/lib/funds/snapshot";

// 워커 PrismaClient로 펀드 스냅샷을 수집한다. 코어 로직은 src/lib/funds/snapshot.ts.
export function snapshotFund(
  trdDd = fundStamp(),
): Promise<"saved" | "skipped" | "failed"> {
  return snapshotFundWith(db, trdDd);
}
