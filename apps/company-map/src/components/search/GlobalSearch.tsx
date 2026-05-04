"use client";

import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { searchCompanies } from "@/actions/companies";
import { listIndustries } from "@/actions/industries";
import type { Company } from "@/types/company";
import type { Industry } from "@/types/industry";

type Item =
  | { kind: "industry"; value: Industry }
  | { kind: "company"; value: Company };

export function GlobalSearch({
  onPick,
  placeholder = "산업 또는 기업 검색…",
}: {
  /** 결과 클릭 시 라우팅 대신 부모에 통보. 미지정 시 메인 페이지로 focus 이동. */
  onPick?: (item: Item) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const trimmed = q.trim();
      if (!trimmed) {
        if (alive) setItems([]);
        return;
      }
      const [companies, allIndustries] = await Promise.all([
        searchCompanies(trimmed, 15),
        listIndustries(),
      ]);
      const indMatches = allIndustries
        .filter((i) => i.name.toLowerCase().includes(trimmed.toLowerCase()))
        .slice(0, 10);
      if (!alive) return;
      const merged: Item[] = [
        ...indMatches.map<Item>((i) => ({ kind: "industry", value: i })),
        ...companies.map<Item>((c) => ({ kind: "company", value: c })),
      ];
      setItems(merged);
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  function pick(item: Item) {
    setOpen(false);
    setQ("");
    if (onPick) onPick(item);
    else router.push(`/?focus=${item.kind}:${item.value.id}`);
  }

  return (
    <div className="relative w-full max-w-md">
      <Command shouldFilter={false}>
        <Command.Input
          value={q}
          onValueChange={(v) => {
            setQ(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full border rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-900 outline-none"
        />
        {open && q.trim() && (
          <Command.List className="absolute top-full left-0 right-0 mt-1 border rounded bg-white dark:bg-gray-900 shadow z-30 max-h-80 overflow-auto">
            {items.length === 0 && (
              <div className="text-xs text-gray-500 p-3">결과 없음</div>
            )}
            {items.map((it) => (
              <Command.Item
                key={`${it.kind}-${it.value.id}`}
                value={`${it.kind}-${it.value.id}`}
                onSelect={() => pick(it)}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer aria-selected:bg-blue-50 dark:aria-selected:bg-blue-950"
              >
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    it.kind === "industry"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {it.kind === "industry" ? "산업" : "기업"}
                </span>
                <span className="font-medium">{it.value.name}</span>
                {it.kind === "company" && it.value.ticker && (
                  <span className="text-xs text-gray-500">{it.value.ticker}</span>
                )}
              </Command.Item>
            ))}
          </Command.List>
        )}
      </Command>
    </div>
  );
}
