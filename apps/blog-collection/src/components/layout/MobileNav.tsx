"use client";

import { useState } from "react";

export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 햄버거 버튼 - 모바일만 */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 -ml-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="Open menu"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>

      {/* 모바일 오버레이 */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-gray-950 shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <span className="font-bold">Feeds</span>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close menu"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>
            <div onClick={() => setOpen(false)}>{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
