"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getCompany, updateCompany, deleteCompany } from "@/actions/companies";
import { getIndustriesForCompany, setMappingsForCompany } from "@/actions/mappings";
import { getIndustryTree } from "@/actions/industries";
import { IndustryPicker } from "@/components/tree/IndustryPicker";
import type { Company } from "@/types/company";
import type { Industry, IndustryNode } from "@/types/industry";

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [company, setCompany] = useState<Company | null>(null);
  const [tree, setTree] = useState<IndustryNode[]>([]);
  const [mapped, setMapped] = useState<Industry[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const [c, t, m] = await Promise.all([
        getCompany(id),
        getIndustryTree(),
        getIndustriesForCompany(id),
      ]);
      setCompany(c);
      setTree(t);
      setMapped(m);
      setPicked(new Set(m.map((i) => i.id)));
    })();
  }, [id]);

  if (!company) return <div className="p-6">로딩…</div>;

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await updateCompany(id, {
      name: String(fd.get("name") ?? "").trim(),
      ticker: String(fd.get("ticker") ?? "").trim() || null,
      market: String(fd.get("market") ?? "").trim() || null,
      description: String(fd.get("description") ?? "").trim() || null,
    });
    await setMappingsForCompany(id, [...picked]);
    const [c, m] = await Promise.all([getCompany(id), getIndustriesForCompany(id)]);
    setCompany(c);
    setMapped(m);
    setEditing(false);
  }

  async function onDelete() {
    if (!confirm(`${company.name}을(를) 삭제하시겠습니까? 매핑도 함께 삭제됩니다.`)) return;
    await deleteCompany(id);
    router.push("/companies");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{company.name}</h2>
        <div className="flex gap-2">
          {!editing && (
            <button onClick={() => setEditing(true)} className="border rounded px-3 py-1.5 text-sm">편집</button>
          )}
          <button onClick={onDelete} className="border border-red-300 text-red-600 rounded px-3 py-1.5 text-sm">삭제</button>
          <Link href={`/?focus=company:${id}`} className="border rounded px-3 py-1.5 text-sm">맵에서 보기</Link>
        </div>
      </div>

      {!editing ? (
        <dl className="border rounded p-4 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-gray-500">종목코드</dt><dd>{company.ticker ?? "—"}</dd>
          <dt className="text-gray-500">시장</dt><dd>{company.market ?? "—"}</dd>
          <dt className="text-gray-500">설명</dt><dd>{company.description ?? "—"}</dd>
          <dt className="text-gray-500">매핑된 산업</dt>
          <dd className="flex flex-wrap gap-1">
            {mapped.length === 0 && <span className="text-gray-500">없음</span>}
            {mapped.map((i) => (
              <Link key={i.id} href={`/industries/${i.id}`} className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:underline">{i.name}</Link>
            ))}
          </dd>
        </dl>
      ) : (
        <form onSubmit={onSave} className="border rounded p-4 space-y-3 text-sm">
          <Row label="이름"><input name="name" defaultValue={company.name} required className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900" /></Row>
          <Row label="종목코드"><input name="ticker" defaultValue={company.ticker ?? ""} className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900" /></Row>
          <Row label="시장">
            <select name="market" defaultValue={company.market ?? ""} className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900">
              <option value="">—</option>
              <option value="KOSPI">KOSPI</option>
              <option value="KOSDAQ">KOSDAQ</option>
              <option value="KONEX">KONEX</option>
            </select>
          </Row>
          <Row label="설명"><textarea name="description" defaultValue={company.description ?? ""} rows={2} className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900" /></Row>
          <Row label="산업 매핑"><IndustryPicker nodes={tree} selectedIds={picked} onChange={setPicked} /></Row>
          <div className="flex gap-2">
            <button className="bg-blue-600 text-white rounded px-3 py-1.5">저장</button>
            <button type="button" onClick={() => setEditing(false)} className="border rounded px-3 py-1.5">취소</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
      <span className="text-gray-500 pt-1">{label}</span>
      {children}
    </div>
  );
}
