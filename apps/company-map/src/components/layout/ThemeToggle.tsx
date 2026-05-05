"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import {
  type Theme,
  getStoredTheme,
  setStoredTheme,
  applyTheme,
} from "@/lib/theme";

const NEXT: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const ICON: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABEL: Record<Theme, string> = {
  light: "라이트",
  dark: "다크",
  system: "시스템",
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(getStoredTheme());
    // system 모드에서 OS 다크모드 변경 시 즉시 반영
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredTheme() === "system") applyTheme("system");
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  if (theme === null) {
    // 첫 렌더에서는 비어 있는 placeholder를 둬서 hydration 어긋남 방지
    return <div className="w-9 h-9" aria-hidden />;
  }

  const Icon = ICON[theme];
  const next = NEXT[theme];

  const handleClick = () => {
    setTheme(next);
    setStoredTheme(next);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`테마: ${LABEL[theme]} (다음: ${LABEL[next]})`}
      title={`테마: ${LABEL[theme]} → ${LABEL[next]}`}
      className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
    >
      <Icon size={18} />
    </button>
  );
}
