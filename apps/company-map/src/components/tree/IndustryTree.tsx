"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { IndustryNode } from "@/types/industry";

export function IndustryTree({
  nodes,
  selectedId,
  highlightIds,
  expandedIds,
  onSelect,
}: {
  nodes: IndustryNode[];
  /** 현재 단일 선택된 산업 (그래프 중심이면 표시) */
  selectedId?: string | null;
  /** 추가 하이라이트 (예: 기업 포커스 시 매핑된 산업들) */
  highlightIds?: Set<string>;
  /** 강제로 펼친 상태로 표시할 산업들. 위로 traverse한 조상 모두 포함되어야 함. */
  expandedIds?: Set<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="text-sm font-mono">
      {nodes.map((n) => (
        <TreeNode
          key={n.id}
          node={n}
          depth={0}
          selectedId={selectedId}
          highlightIds={highlightIds}
          expandedIds={expandedIds}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedId,
  highlightIds,
  expandedIds,
  onSelect,
}: {
  node: IndustryNode;
  depth: number;
  selectedId?: string | null;
  highlightIds?: Set<string>;
  expandedIds?: Set<string>;
  onSelect: (id: string) => void;
}) {
  const forced = expandedIds?.has(node.id) ?? false;
  const [open, setOpen] = useState(forced || depth < 1);
  const isOpen = forced || open;
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const isHighlight = highlightIds?.has(node.id) ?? false;

  return (
    <div>
      <div
        style={{ paddingLeft: 8 + depth * 12 }}
        className={`flex items-center gap-1 py-0.5 cursor-pointer rounded ${
          isSelected
            ? "bg-blue-600 text-white"
            : isHighlight
              ? "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100"
              : "hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
        onClick={() => onSelect(node.id)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="w-4 h-4 flex items-center justify-center"
        >
          {hasChildren ? (
            isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="opacity-30">·</span>
          )}
        </button>
        <span className="truncate">{node.name}</span>
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              highlightIds={highlightIds}
              expandedIds={expandedIds}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
