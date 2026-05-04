"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { X } from "lucide-react";
import { getIndustry } from "@/actions/industries";
import { getCompaniesForIndustry, addMapping, removeMapping } from "@/actions/mappings";
import { searchCompanies } from "@/actions/companies";
import type { Industry } from "@/types/industry";
import type { Company } from "@/types/company";

export default function IndustryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [members, setMembers] = useState<Company[]>([]);
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Company[]>([]);

  async function reload() {
    const [i, m] = await Promise.all([getIndustry(id), getCompaniesForIndustry(id)]);
    setIndustry(i);
    setMembers(m);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [id]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (!q.trim()) { setCandidates([]); return; }
      const found = await searchCompanies(q.trim(), 10);
      if (alive) {
        const memberIds = new Set(members.map((m) => m.id));
        setCandidates(found.filter((c) => !memberIds.has(c.id)));
      }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, members]);

  if (!industry) return <div className="p-6">로딩…</div>;

  async function onAdd(companyId: string) {
    await addMapping(companyId, id);
    setQ("");
    await reload();
  }

  async function onRemove(companyId: string) {
    await removeMapping(companyId, id);
    await reload();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{industry.name}</h2>
        <Link href={`/?focus=industry:${id}`} className="border rounded px-3 py-1.5 text-sm">맵에서 보기</Link>
      </div>
      {industry.description && <p className="text-sm text-gray-500">{industry.description}</p>}

      <section className="border rounded p-3 space-y-2">
        <h3 className="font-semibold">기업 추가</h3>
        <input
          placeholder="기업명/종목코드 검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border rounded px-3 py-1.5 w-full text-sm bg-white dark:bg-gray-900"
        />
        {candidates.length > 0 && (
          <ul className="border rounded divide-y text-sm max-h-60 overflow-auto">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-3 py-1.5">
                <span>{c.name} {c.ticker && <span className="text-xs text-gray-500">{c.ticker}</span>}</span>
                <button onClick={() => onAdd(c.id)} className="text-blue-600 text-xs hover:underline">+ 추가</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border rounded p-3 space-y-2">
        <h3 className="font-semibold">매핑된 기업 ({members.length})</h3>
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">아직 매핑된 기업이 없습니다.</p>
        ) : (
          <ul className="divide-y text-sm">
            {members.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <Link href={`/companies/${c.id}`} className="hover:underline">
                  {c.name} {c.ticker && <span className="text-xs text-gray-500">{c.ticker}</span>}
                </Link>
                <button onClick={() => onRemove(c.id)} className="text-red-600 hover:opacity-80" title="매핑 제거"><X size={14}/></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
