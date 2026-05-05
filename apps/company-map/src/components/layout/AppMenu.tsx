"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Map as MapIcon, Rss, ExternalLink } from "lucide-react";

type Service = {
  key: string;
  name: string;
  description: string;
  /** 절대 URL. 현재 origin과 같으면 internal navigation, 다르면 외부 link로 새 탭에서 열림. */
  href: string;
  icon: typeof MapIcon;
  enabled: boolean;
};

// 모든 금융 포털 서비스 — 두 앱(company-map / blog-collection) 모두 같은 list 공유.
// 새 서비스 추가 시 양쪽 AppMenu.tsx에 동일하게 한 줄 추가.
const SERVICES: Service[] = [
  {
    key: "company-map",
    name: "Company Map",
    description: "산업·기업 N:M 매핑 시각화",
    href: "http://localhost:3004/map",
    icon: MapIcon,
    enabled: true,
  },
  {
    key: "blog-collection",
    name: "Blog Collection",
    description: "RSS 피드 기반 블로그 글 큐레이션",
    href: "http://localhost:3002",
    icon: Rss,
    enabled: true,
  },
];

/** 현재 브라우저 origin과 비교해 internal navigation 여부 판단. SSR에서는 false. */
function isInternal(href: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function AppMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="메뉴 열기"
        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <Menu size={20} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="fixed top-0 left-0 h-full w-72 bg-white dark:bg-gray-900 z-40 shadow-xl border-r border-gray-200 dark:border-gray-800 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <span className="font-semibold">금융 포털</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="메뉴 닫기"
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-2 mb-2">
                서비스
              </div>
              {SERVICES.map((s) => {
                const Icon = s.icon;
                const internal = isInternal(s.href);
                // internal 서비스는 pathname으로 active 판정. 절대 URL 기반이라 path 추출.
                let active = false;
                if (s.enabled && internal) {
                  try {
                    const url = new URL(s.href);
                    active =
                      pathname === url.pathname ||
                      (url.pathname !== "/" && pathname.startsWith(url.pathname));
                    // 현재 site의 root("/")가 서비스 root이면 active
                    if (url.pathname === "/" && pathname === "/") active = true;
                  } catch {
                    /* noop */
                  }
                }
                const inner = (
                  <div className="flex items-start gap-3">
                    <Icon size={18} className="mt-0.5 text-blue-600" />
                    <div className="flex-1">
                      <div className="font-medium text-sm flex items-center gap-1">
                        {s.name}
                        {!internal && s.enabled && (
                          <ExternalLink size={11} className="text-gray-400" />
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {s.description}
                      </div>
                    </div>
                  </div>
                );
                const cls = `block rounded p-2 transition ${
                  active
                    ? "bg-blue-50 dark:bg-blue-950"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800"
                }`;
                if (!s.enabled) {
                  return (
                    <div
                      key={s.key}
                      className="block rounded p-2 opacity-50 cursor-not-allowed"
                      title="준비 중"
                    >
                      {inner}
                    </div>
                  );
                }
                return internal ? (
                  <Link
                    key={s.key}
                    href={(() => {
                      try { return new URL(s.href).pathname; } catch { return s.href; }
                    })()}
                    onClick={() => setOpen(false)}
                    className={cls}
                  >
                    {inner}
                  </Link>
                ) : (
                  <a
                    key={s.key}
                    href={s.href}
                    onClick={() => setOpen(false)}
                    className={cls}
                  >
                    {inner}
                  </a>
                );
              })}
            </nav>
            <div className="border-t border-gray-200 dark:border-gray-800 p-3 text-xs text-gray-400">
              본인용 금융 포털 · v0.1
            </div>
          </aside>
        </>
      )}
    </>
  );
}
