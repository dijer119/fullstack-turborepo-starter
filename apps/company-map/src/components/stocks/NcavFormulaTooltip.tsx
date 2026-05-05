"use client";

import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

const FORMULA_CONTENT = (
  <div className="space-y-2 text-left">
    <div className="font-semibold text-sm">NCAV 스크리닝 계산식</div>
    <ol className="space-y-1.5 list-decimal list-inside leading-relaxed">
      <li>
        <span className="font-medium">NCAV (청산가치)</span>
        <div className="ml-4 mt-0.5 text-[11px] opacity-80">
          유동자산 − 부채총계
        </div>
      </li>
      <li>
        <span className="font-medium">NCAV 비율</span>
        <div className="ml-4 mt-0.5 text-[11px] opacity-80">
          NCAV ÷ 시가총액 × 100
        </div>
      </li>
      <li>
        <span className="font-medium">NCAV &gt; 시총</span>
        <div className="ml-4 mt-0.5 text-[11px] opacity-80">
          청산가치가 시가총액보다 큰 종목
          <span className="opacity-70"> (그레이엄 net-net 전략)</span>
        </div>
      </li>
    </ol>
    <div className="border-t border-gray-700 dark:border-gray-300 pt-1.5 text-[10px] opacity-70 space-y-0.5">
      <div>※ 재무 데이터: DART OpenAPI · 연결재무제표 우선, 없으면 별도</div>
      <div>※ 사업보고서 기준 (4월 이후 전년도, 그 외 전전년도)</div>
    </div>
  </div>
);

export function NcavFormulaTooltip() {
  return (
    <Tooltip content={FORMULA_CONTENT} widthClass="w-80 max-w-[calc(100vw-2rem)]">
      <button
        type="button"
        aria-label="NCAV 계산식 보기"
        className="cursor-help inline-flex items-center justify-center rounded-full p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800"
      >
        <Info size={16} />
      </button>
    </Tooltip>
  );
}
