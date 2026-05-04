"use client";

import { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { IndustryTree } from "@/components/tree/IndustryTree";
import { MapGraph, type Focus, type FocusNeighborhood } from "@/components/graph/MapGraph";
import { getIndustryTree } from "@/actions/industries";
import type { IndustryNode } from "@/types/industry";
import type { Company } from "@/types/company";

const RECENT_KEY = "company-map.recentCompanies";
const RECENT_LIMIT = 10;

type RecentCompany = { id: string; name: string; ticker: string | null };

function loadRecent(): RecentCompany[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecent(c: RecentCompany) {
  if (typeof window === "undefined") return;
  const cur = loadRecent().filter((r) => r.id !== c.id);
  cur.unshift(c);
  localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_LIMIT)));
}

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tree, setTree] = useState<IndustryNode[]>([]);
  const [recents, setRecents] = useState<RecentCompany[]>([]);
  const [neighborhood, setNeighborhood] = useState<FocusNeighborhood | null>(null);

  const focus = useMemo<Focus>(() => {
    const f = searchParams.get("focus");
    if (!f) return null;
    const [type, id] = f.split(":", 2);
    if ((type === "industry" || type === "company") && id) {
      return { type, id } as Focus;
    }
    return null;
  }, [searchParams]);

  useEffect(() => {
    getIndustryTree().then(setTree);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecents(loadRecent());
  }, []);

  const setFocus = useCallback((next: Focus) => {
    if (!next) router.replace("/");
    else router.replace(`/?focus=${next.type}:${next.id}`);
  }, [router]);

  // company focus 시 최근 본 기업에 추가
  useEffect(() => {
    if (focus?.type === "company" && neighborhood?.companies) {
      const c = neighborhood.companies.find((x: Company) => x.id === focus.id);
      if (c) {
        pushRecent({ id: c.id, name: c.name, ticker: c.ticker });
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRecents(loadRecent());
      }
    }
  }, [focus, neighborhood]);

  // 트리 동기화: 그래프에서 선택된 산업과 그 조상들을 펼침
  const { selectedTreeId, expandedIds, highlightIds } = useMemo(() => {
    const expanded = new Set<string>();
    const highlight = new Set<string>();
    let selected: string | null = null;
    if (focus?.type === "industry") {
      selected = focus.id;
      // 조상 traverse를 위해 flat map 만들기
      const flat = new Map<string, IndustryNode>();
      const walk = (ns: IndustryNode[]) => ns.forEach((n) => { flat.set(n.id, n); walk(n.children); });
      walk(tree);
      let cur = flat.get(focus.id);
      while (cur) {
        expanded.add(cur.id);
        cur = cur.parent_id ? flat.get(cur.parent_id) : undefined;
      }
    } else if (focus?.type === "company" && neighborhood) {
      const flat = new Map<string, IndustryNode>();
      const walk = (ns: IndustryNode[]) => ns.forEach((n) => { flat.set(n.id, n); walk(n.children); });
      walk(tree);
      neighborhood.industries.forEach((i) => {
        highlight.add(i.id);
        let cur: IndustryNode | undefined = flat.get(i.id);
        while (cur) {
          expanded.add(cur.id);
          cur = cur.parent_id ? flat.get(cur.parent_id) : undefined;
        }
      });
    }
    return { selectedTreeId: selected, expandedIds: expanded, highlightIds: highlight };
  }, [focus, tree, neighborhood]);

  return (
    <div className="-m-3 md:-m-6 h-[calc(100vh-57px)] grid grid-cols-[260px_1fr]">
      <aside className="border-r overflow-y-auto p-3 bg-gray-50 dark:bg-gray-900 space-y-3">
        <GlobalSearch onPick={(it) => setFocus({ type: it.kind, id: it.value.id })} />
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">산업 트리</div>
          <IndustryTree
            nodes={tree}
            selectedId={selectedTreeId}
            highlightIds={highlightIds}
            expandedIds={expandedIds}
            onSelect={(id) => setFocus({ type: "industry", id })}
          />
        </div>
        {recents.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">최근 본 기업</div>
            <ul className="text-sm space-y-0.5">
              {recents.map((r) => (
                <li key={r.id}>
                  <button
                    className="w-full text-left px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => setFocus({ type: "company", id: r.id })}
                  >
                    ● {r.name} {r.ticker && <span className="text-xs text-gray-500">{r.ticker}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
      <section className="relative">
        <MapGraph focus={focus} onFocusChange={setFocus} onNeighborhoodChange={setNeighborhood} />
      </section>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageInner />
    </Suspense>
  );
}
