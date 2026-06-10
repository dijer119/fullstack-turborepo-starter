"use client";

import { PieChart, Pie, Cell } from "recharts";

interface Props {
  /** 실제 값 (null이면 빈 게이지 + "—") */
  value: number | null;
  min: number;
  max: number;
  /** 중앙에 표시할 포맷된 값 텍스트 (예: "21.97%", "1.23x") */
  display: string;
  /** Tailwind가 아닌 실제 색상값 (SVG fill용) */
  color: string;
  /** 좌측 하단 보조 텍스트 (예: "저가: 58,000") */
  subLeft?: string;
  /** 우측 하단 보조 텍스트 (예: "고가: 88,200") */
  subRight?: string;
}

export function GaugeChart({
  value,
  min,
  max,
  display,
  color,
  subLeft,
  subRight,
}: Props) {
  const ratio =
    value == null || max <= min
      ? 0
      : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const data = [{ v: ratio }, { v: 1 - ratio }];

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[120px] w-[220px]">
        <PieChart width={220} height={120}>
          <Pie
            data={data}
            dataKey="v"
            startAngle={180}
            endAngle={0}
            cx="50%"
            cy="100%"
            innerRadius={72}
            outerRadius={86}
            stroke="none"
            cornerRadius={6}
            isAnimationActive={false}
          >
            <Cell fill={color} />
            <Cell fill="rgba(128, 128, 128, 0.18)" />
          </Pie>
        </PieChart>
        <div className="absolute inset-x-0 bottom-1 text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
          {value != null ? display : "—"}
        </div>
        <div className="absolute bottom-1 left-0 text-[10px] text-gray-400">
          {min}
        </div>
        <div className="absolute bottom-1 right-0 text-[10px] text-gray-400">
          {max}
        </div>
      </div>
      {(subLeft || subRight) && (
        <div className="mt-1 flex w-full justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{subLeft}</span>
          <span>{subRight}</span>
        </div>
      )}
    </div>
  );
}
