import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

export type IndustryNodeData = { label: string; isFocus: boolean };

export type IndustryNode = {
  id: string;
  type: "industry";
  position: { x: number; y: number };
  data: IndustryNodeData;
};

export function IndustryNode({ data }: NodeProps<IndustryNode>) {
  const d = data as IndustryNodeData;
  return (
    <div
      className={`px-3 py-1 rounded-full text-xs font-semibold border ${
        d.isFocus
          ? "bg-blue-600 text-white border-blue-300 shadow-lg shadow-blue-500/40"
          : "bg-blue-100 text-blue-800 border-blue-200"
      }`}
    >
      {d.label}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}
