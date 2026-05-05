"use client";

import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

const FORMULA_CONTENT = (
  <div className="space-y-2 text-left">
    <div className="font-semibold text-sm">안전마진 계산식</div>
    <ol className="space-y-1.5 list-decimal list-inside leading-relaxed">
      <li>
        <span className="font-medium">EPS 가중평균</span>
        <div className="ml-4 mt-0.5 text-[11px] opacity-80">
          (직전년도×3 + 전년도×2 + 전전년도×1) ÷ 6
        </div>
      </li>
      <li>
        <span className="font-medium">기본 내재가치</span>
        <div className="ml-4 mt-0.5 text-[11px] opacity-80">
          (가중EPS × 10 + 최근BPS) ÷ 2
        </div>
      </li>
      <li>
        <span className="font-medium">자사주 조정</span>
        <div className="ml-4 mt-0.5 text-[11px] opacity-80">
          기본 × 100 ÷ (100 − 자사주%)
          <span className="opacity-70"> (자사주 있을 때)</span>
        </div>
      </li>
      <li>
        <span className="font-medium">안전마진</span>
        <div className="ml-4 mt-0.5 text-[11px] opacity-80">
          (내재가치 − 현재가) ÷ 현재가 × 100
        </div>
      </li>
    </ol>
    <div className="border-t border-gray-700 dark:border-gray-300 pt-1.5 text-[10px] opacity-70">
      ※ 출처: 벤자민 그레이엄 가치투자 공식 / 데이터: 네이버 금융
    </div>
  </div>
);

export function SafetyMarginFormulaTooltip() {
  return (
    <Tooltip content={FORMULA_CONTENT} widthClass="w-80 max-w-[calc(100vw-2rem)]">
      <button
        type="button"
        aria-label="안전마진 계산식 보기"
        className="cursor-help inline-flex items-center justify-center rounded-full p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800"
      >
        <Info size={16} />
      </button>
    </Tooltip>
  );
}
