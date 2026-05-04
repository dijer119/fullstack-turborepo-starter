"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createCompany } from "@/actions/companies";
import { setMappingsForCompany } from "@/actions/mappings";
import { getIndustryTree } from "@/actions/industries";
import { IndustryPicker } from "@/components/tree/IndustryPicker";
import type { IndustryNode } from "@/types/industry";

export default function NewCompanyPage() {
  const [tree, setTree] = useState<IndustryNode[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getIndustryTree().then(setTree);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const created = await createCompany({
        name: String(fd.get("name") ?? "").trim(),
        ticker: String(fd.get("ticker") ?? "").trim() || null,
        market: String(fd.get("market") ?? "").trim() || null,
        description: String(fd.get("description") ?? "").trim() || null,
      });
      if (picked.size > 0) {
        await setMappingsForCompany(created.id, [...picked]);
      }
      router.push(`/companies/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl mx-auto space-y-3">
      <h2 className="text-2xl font-bold">새 기업</h2>
      <Field label="이름 *">
        <input name="name" required className="border rounded px-3 py-1.5 w-full bg-white dark:bg-gray-900" />
      </Field>
      <Field label="종목코드">
        <input name="ticker" className="border rounded px-3 py-1.5 w-full bg-white dark:bg-gray-900" />
      </Field>
      <Field label="시장">
        <select name="market" defaultValue="" className="border rounded px-3 py-1.5 w-full bg-white dark:bg-gray-900">
          <option value="">—</option>
          <option value="KOSPI">KOSPI</option>
          <option value="KOSDAQ">KOSDAQ</option>
          <option value="KONEX">KONEX</option>
        </select>
      </Field>
      <Field label="설명">
        <textarea name="description" rows={2} className="border rounded px-3 py-1.5 w-full bg-white dark:bg-gray-900" />
      </Field>
      <Field label="산업 매핑">
        <IndustryPicker nodes={tree} selectedIds={picked} onChange={setPicked} />
      </Field>
      <div className="flex gap-2">
        <button disabled={submitting} className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
          {submitting ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
