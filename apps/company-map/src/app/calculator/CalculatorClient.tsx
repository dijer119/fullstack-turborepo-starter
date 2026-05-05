"use client";

import { useEffect, useState } from "react";
import { StockSearch } from "@/components/stocks/StockSearch";
import { StockResultCard } from "@/components/stocks/StockResultCard";
import {
  WatchlistPanel,
  readWatchlistCodes,
  toggleWatchlistCode,
} from "@/components/stocks/WatchlistPanel";
import type { TopStockRow } from "@/types/stocks";

export function CalculatorClient() {
  const [selected, setSelected] = useState<TopStockRow | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setFavorites(readWatchlistCodes());
  }, []);

  const handleToggle = (code: string) => {
    setFavorites(toggleWatchlistCode(code));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <StockSearch onSelect={setSelected} />
        {selected ? (
          <StockResultCard
            row={selected}
            isFavorite={favorites.includes(selected.code)}
            onToggleFavorite={handleToggle}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
            종목을 검색하거나 6자리 종목코드를 입력해 분석하세요.
          </p>
        )}
      </div>
      <aside>
        <WatchlistPanel
          codes={favorites}
          onRemove={(c) => setFavorites(toggleWatchlistCode(c))}
        />
      </aside>
    </div>
  );
}
