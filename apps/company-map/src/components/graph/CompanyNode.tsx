import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

export type CompanyNodeData = { label: string; ticker?: string | null; isFocus: boolean };

export type CompanyNode = {
  id: string;
  type: "company";
  position: { x: number; y: number };
  data: CompanyNodeData;
};

export function CompanyNode({ data }: NodeProps<CompanyNode>) {
  const d = data as CompanyNodeData;
  return (
    <div
      className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 ${
        d.isFocus
          ? "bg-emerald-600 text-white border-emerald-300 shadow-lg shadow-emerald-500/40"
          : "bg-emerald-100 text-emerald-800 border-emerald-200"
      }`}
    >
      <span>● {d.label}</span>
      {d.ticker && <span className="opacity-70 text-[10px]">{d.ticker}</span>}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}
