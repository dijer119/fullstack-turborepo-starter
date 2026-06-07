"use client";

import { useEffect, useState } from "react";

interface Item {
  id: string;
  label: string;
  dotClass: string;
}

const ITEMS: Item[] = [
  { id: "links", label: "관련 링크", dotClass: "bg-rose-500" },
  { id: "bizoverview", label: "사업개요", dotClass: "bg-teal-500" },
  { id: "sales", label: "매출", dotClass: "bg-lime-500" },
  { id: "orders", label: "수주", dotClass: "bg-fuchsia-500" },
  { id: "earnings", label: "실적", dotClass: "bg-indigo-500" },
  { id: "dividends", label: "배당", dotClass: "bg-emerald-500" },
  { id: "ownership", label: "지분", dotClass: "bg-amber-500" },
  { id: "treasury", label: "자사주", dotClass: "bg-violet-500" },
  { id: "contracts", label: "계약", dotClass: "bg-cyan-500" },
];

export function SectionNav() {
  const [active, setActive] = useState<string>("earnings");

  useEffect(() => {
    const sections = ITEMS.map((it) =>
      document.getElementById(it.id),
    ).filter((el): el is HTMLElement => el != null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 가장 위쪽에 보이는 섹션을 active로
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-40% 0px -40% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const handleClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="sticky top-6 hidden w-32 shrink-0 self-start lg:block">
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
          섹션
        </div>
        <ul className="space-y-1">
          {ITEMS.map((it) => (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                onClick={(e) => handleClick(e, it.id)}
                className={`flex items-center gap-2 rounded px-2 py-1 text-sm transition ${
                  active === it.id
                    ? "bg-gray-100 font-semibold text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-100"
                }`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${it.dotClass}`} />
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
