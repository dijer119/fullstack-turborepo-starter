"use client";

import { useEffect } from "react";
import { recordStockView } from "@/actions/stock-watches";

export function RecordStockView({ symbol }: { symbol: string }) {
  useEffect(() => { void recordStockView(symbol).catch(() => {}); }, [symbol]);
  return null;
}
