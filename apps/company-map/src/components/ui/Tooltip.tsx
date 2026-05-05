"use client";

import type { ReactNode } from "react";

interface Props {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  /** 'bottom' (default) | 'top' | 'left' | 'right' */
  side?: "top" | "bottom" | "left" | "right";
  /** 툴팁 최대 너비 (Tailwind max-w-* 클래스) */
  widthClass?: string;
}

const SIDE_CLASSES: Record<NonNullable<Props["side"]>, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

/**
 * 가벼운 hover/focus 기반 툴팁. portal/positioning lib 없이 group-hover로 작동.
 * 트리거 요소를 직접 감싸서 사용 (group/relative parent 자동 처리).
 */
export function Tooltip({
  content,
  children,
  className = "",
  side = "bottom",
  widthClass = "max-w-sm",
}: Props) {
  return (
    <span
      className={`group relative inline-flex items-center ${className}`}
      tabIndex={0}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 absolute z-50 ${SIDE_CLASSES[side]} ${widthClass} whitespace-normal rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100 shadow-lg transition-opacity dark:border-gray-300 dark:bg-gray-100 dark:text-gray-900`}
      >
        {content}
      </span>
    </span>
  );
}
