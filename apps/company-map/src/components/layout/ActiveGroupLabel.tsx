"use client";

import { usePathname } from "next/navigation";

/** Company Map 그룹에 속하는 라우트들 — 햄버거 메뉴의 sub-items와 1:1. */
const COMPANY_MAP_PATHS = ["/map", "/companies", "/industries", "/import"];

/**
 * 헤더 좌측 "금융 포털" 옆에 활성 그룹 이름을 노출.
 * 현재는 Company Map 그룹만 — 다른 도구는 ActiveNav가 자체 라벨로 처리.
 */
export function ActiveGroupLabel() {
  const pathname = usePathname();
  const inCompanyMap = COMPANY_MAP_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (!inCompanyMap) return null;
  return (
    <>
      <span className="text-gray-300 dark:text-gray-700 select-none">|</span>
      <span className="text-sm text-gray-600 dark:text-gray-400">
        Company Map
      </span>
    </>
  );
}
