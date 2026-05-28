"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchDisclosuresForStock } from "@/actions/disclosures";

export function RefreshButton({ code }: { code: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handle = () => {
    startTransition(async () => {
      try {
        await fetchDisclosuresForStock(code);
        router.refresh();
      } catch (err) {
        console.error("[disclosures] refresh failed", err);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="rounded border border-blue-500 bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "갱신 중…" : "공시 갱신"}
    </button>
  );
}
