import { snapshotAllEtfs } from "./etf-snapshot";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30분 폴
const SCHEDULE_HOUR_KST = 19;             // 18시 PDF 확정 후

let lastRunDay = "";

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export async function etfPdfLoop(): Promise<void> {
  console.log("[etf-pdf-loop] starting (30min poll, schedule 19:00 KST)");
  while (true) {
    try {
      const now = new Date();
      if (now.getHours() >= SCHEDULE_HOUR_KST && lastRunDay !== todayKey(now)) {
        console.log("[etf-pdf-loop] running at", now.toISOString());
        await snapshotAllEtfs();
        lastRunDay = todayKey(now);
      }
    } catch (e) {
      console.error("[etf-pdf-loop] iteration failed:", e);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}
