"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS: Array<{ path: string; label: string }> = [
  { path: "/map", label: "Map" },
  { path: "/calculator", label: "계산기" },
  { path: "/top-stocks", label: "상위종목" },
  { path: "/ncav", label: "NCAV" },
  { path: "/stocks/etf", label: "ETF" },
];

/** 현재 경로에 해당하는 nav 항목 1개만 노출. 그 외에는 아무것도 렌더하지 않는다. */
export function ActiveNav() {
  const pathname = usePathname();
  const active = NAV_ITEMS.find(
    (item) =>
      pathname === item.path ||
      (item.path !== "/" && pathname.startsWith(item.path + "/")),
  );
  if (!active) return null;
  return (
    <Link
      href={active.path}
      className="font-medium text-gray-900 dark:text-gray-100 hover:underline"
    >
      {active.label}
    </Link>
  );
}
