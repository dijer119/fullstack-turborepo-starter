"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshButton({ feedId }: { feedId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRefresh() {
    setLoading(true);
    try {
      await fetch("/api/rss/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedId ? { feedId } : {}),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
    >
      {loading ? "Refreshing..." : "Refresh"}
    </button>
  );
}
