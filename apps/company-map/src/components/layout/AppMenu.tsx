"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Map as MapIcon,
  Rss,
  ExternalLink,
  Calculator,
  TrendingUp,
  Filter,
  Building2,
  Layers,
  Upload,
  Cpu,
  Search,
} from "lucide-react";

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

// Company Map 서비스 내부 sub-menu — 햄버거 패널의 Company Map 항목 아래에
// 들여쓰기로 노출. 같은 origin이라 next/link 사용.
const COMPANY_MAP_SUB_ITEMS: Array<{
  key: string;
  name: string;
  path: string;
  icon: typeof MapIcon;
}> = [
  { key: "map", name: "Map", path: "/map", icon: MapIcon },
  { key: "companies", name: "Companies", path: "/companies", icon: Building2 },
  { key: "industries", name: "Industries", path: "/industries", icon: Layers },
  { key: "import", name: "Import", path: "/import", icon: Upload },
];

// 같은 앱 내부 도구 — 햄버거 메뉴의 별도 섹션으로 노출.
type Tool = {
  key: string;
  name: string;
  description: string;
  path: string;
  icon: typeof MapIcon;
};

const TOOLS: Tool[] = [
  {
    key: "calculator",
    name: "내재가치 계산기",
    description: "종목 검색 및 안전마진 계산",
    path: "/calculator",
    icon: Calculator,
  },
  {
    key: "top-stocks",
    name: "안전마진 상위종목",
    description: "상위 N개 종목 + 배당 필터",
    path: "/top-stocks",
    icon: TrendingUp,
  },
  {
    key: "ncav",
    name: "NCAV 스크리닝",
    description: "청산가치 > 시가총액 종목",
    path: "/ncav",
    icon: Filter,
  },
  {
    key: "trade",
    name: "수출입 동향",
    description: "관세청 월별 통관 통계 (반도체·화장품)",
    path: "/trade",
    icon: Cpu,
  },
  {
    key: "stocks",
    name: "전종목 조회",
    description: "KOSPI/KOSDAQ 전체 상장 종목 탐색",
    path: "/stocks",
    icon: Search,
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

/** SERVICE 정의의 `localhost` host를 현재 브라우저 hostname으로 치환.
 *  포트는 SERVICE 정의 그대로, protocol은 현재 브라우저 protocol로 맞춤.
 *  → 외부에서 dijer.synology.me:3000 접근 시 메뉴 링크가 dijer.synology.me:3004 식으로 동작.
 *  → localhost 접근 시 변화 없음. */
function rewriteHostToCurrent(href: string): string {
  if (typeof window === "undefined") return href;
  try {
    const u = new URL(href);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      u.protocol = window.location.protocol;
      u.hostname = window.location.hostname;
    }
    return u.toString();
  } catch {
    return href;
  }
}

export function AppMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [services, setServices] = useState<Service[]>(SERVICES);

  // mount 이후 SERVICE URL의 localhost를 현재 브라우저 origin host로 치환.
  // SSR/CSR mismatch 방지를 위해 첫 render 후 useEffect에서 1회 갱신.
  useEffect(() => {
    setServices((prev) =>
      prev.map((s) => ({ ...s, href: rewriteHostToCurrent(s.href) })),
    );
  }, []);

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
              {services.map((s) => {
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
                const link = internal ? (
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

                // Company Map 서비스 항목 바로 아래 sub-items 들여쓰기 노출
                if (s.key === "company-map" && internal && s.enabled) {
                  return (
                    <div key={s.key}>
                      {link}
                      <div className="ml-7 mt-1 space-y-0.5">
                        {COMPANY_MAP_SUB_ITEMS.map((sub) => {
                          const SubIcon = sub.icon;
                          const subActive =
                            pathname === sub.path ||
                            (sub.path !== "/" && pathname.startsWith(sub.path));
                          return (
                            <Link
                              key={sub.key}
                              href={sub.path}
                              onClick={() => setOpen(false)}
                              className={`flex items-center gap-2 rounded px-2 py-1 text-sm transition ${
                                subActive
                                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                              }`}
                            >
                              <SubIcon size={14} className="opacity-70" />
                              {sub.name}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                return link;
              })}

              <div className="mt-6 text-xs font-semibold uppercase tracking-wider text-gray-500 px-2 mb-2">
                도구
              </div>
              {TOOLS.map((t) => {
                const Icon = t.icon;
                const active =
                  pathname === t.path ||
                  (t.path !== "/" && pathname.startsWith(t.path));
                return (
                  <Link
                    key={t.key}
                    href={t.path}
                    onClick={() => setOpen(false)}
                    className={`block rounded p-2 transition ${
                      active
                        ? "bg-blue-50 dark:bg-blue-950"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon size={18} className="mt-0.5 text-blue-600" />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{t.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {t.description}
                        </div>
                      </div>
                    </div>
                  </Link>
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
