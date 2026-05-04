"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createIndustry, deleteIndustry, getIndustryTree, updateIndustry } from "@/actions/industries";
import type { IndustryNode } from "@/types/industry";

export default function IndustriesPage() {
  const [tree, setTree] = useState<IndustryNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function reload() {
    setTree(await getIndustryTree());
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, []);

  const selected = selectedId ? findNode(tree, selectedId) : null;

  async function onAddRoot() {
    const name = prompt("새 산업 이름 (최상위)");
    if (!name) return;
    await createIndustry({ name: name.trim(), parent_id: null });
    await reload();
  }

  async function onAddChild(parentId: string) {
    const name = prompt("새 자식 산업 이름");
    if (!name) return;
    await createIndustry({ name: name.trim(), parent_id: parentId });
    await reload();
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`"${name}"과(와) 모든 하위 산업·매핑을 삭제하시겠습니까?`)) return;
    await deleteIndustry(id);
    if (selectedId === id) setSelectedId(null);
    await reload();
  }

  async function onSaveSelected(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const fd = new FormData(e.currentTarget);
    const newParent = String(fd.get("parent_id") ?? "");
    try {
      await updateIndustry(selected.id, {
        name: String(fd.get("name") ?? "").trim(),
        description: String(fd.get("description") ?? "").trim() || null,
        parent_id: newParent || null,
      });
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "저장 실패");
    }
  }

  const allFlat = flattenTree(tree);

  return (
    <div className="max-w-5xl mx-auto grid md:grid-cols-[1fr_1fr] gap-4">
      <section className="border rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">산업 트리</h2>
          <button onClick={onAddRoot} className="border rounded px-2 py-1 text-xs flex items-center gap-1"><Plus size={12}/> 최상위 추가</button>
        </div>
        <TreeAdmin nodes={tree} depth={0} onSelect={setSelectedId} onAddChild={onAddChild} onDelete={onDelete} selectedId={selectedId} />
        {tree.length === 0 && <p className="text-sm text-gray-500">아직 산업이 없습니다. 최상위부터 추가하세요.</p>}
      </section>

      <section className="border rounded p-3 space-y-2">
        <h2 className="text-xl font-bold">선택된 산업</h2>
        {!selected ? (
          <p className="text-sm text-gray-500">좌측에서 산업을 선택하세요.</p>
        ) : (
          <form onSubmit={onSaveSelected} className="space-y-2 text-sm">
            <Field label="이름"><input name="name" defaultValue={selected.name} required className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900"/></Field>
            <Field label="설명"><textarea name="description" defaultValue={selected.description ?? ""} rows={2} className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900"/></Field>
            <Field label="부모">
              <select name="parent_id" defaultValue={selected.parent_id ?? ""} className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900">
                <option value="">— 최상위 —</option>
                {allFlat.filter((n) => n.id !== selected.id).map((n) => (
                  <option key={n.id} value={n.id}>{n.path}</option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2">
              <button className="bg-blue-600 text-white rounded px-3 py-1.5">저장</button>
              <Link href={`/industries/${selected.id}`} className="border rounded px-3 py-1.5">상세</Link>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function TreeAdmin({
  nodes, depth, onSelect, onAddChild, onDelete, selectedId,
}: {
  nodes: IndustryNode[]; depth: number; onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void; onDelete: (id: string, name: string) => void;
  selectedId: string | null;
}) {
  return (
    <div>
      {nodes.map((n) => (
        <div key={n.id}>
          <div
            style={{ paddingLeft: 8 + depth * 14 }}
            className={`flex items-center gap-1 py-0.5 text-sm ${selectedId === n.id ? "bg-blue-100 dark:bg-blue-900" : ""}`}
          >
            <button className="flex-1 text-left truncate" onClick={() => onSelect(n.id)}>
              {n.children.length > 0 ? "📁" : "·"} {n.name}
            </button>
            <button onClick={() => onAddChild(n.id)} className="opacity-60 hover:opacity-100" title="자식 추가"><Plus size={12}/></button>
            <button onClick={() => onDelete(n.id, n.name)} className="opacity-60 hover:opacity-100 text-red-600" title="삭제"><Trash2 size={12}/></button>
          </div>
          {n.children.length > 0 && (
            <TreeAdmin nodes={n.children} depth={depth + 1} onSelect={onSelect} onAddChild={onAddChild} onDelete={onDelete} selectedId={selectedId}/>
          )}
        </div>
      ))}
    </div>
  );
}

function findNode(nodes: IndustryNode[], id: string): IndustryNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inner = findNode(n.children, id);
    if (inner) return inner;
  }
  return null;
}

function flattenTree(nodes: IndustryNode[], prefix = ""): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = [];
  for (const n of nodes) {
    const path = prefix ? `${prefix} / ${n.name}` : n.name;
    out.push({ id: n.id, path });
    out.push(...flattenTree(n.children, path));
  }
  return out;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
