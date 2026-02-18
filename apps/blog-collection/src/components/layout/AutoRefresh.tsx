"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL = 10 * 60 * 1000; // 10분

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await fetch("/api/rss/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        router.refresh();
      } catch {
        // 실패 시 무시 — 다음 주기에 재시도
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [router]);

  return null;
}
