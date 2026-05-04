"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { IndustryNode } from "@/types/industry";

export function IndustryPicker({
  nodes,
  selectedIds,
  multi = true,
  onChange,
}: {
  nodes: IndustryNode[];
  selectedIds: Set<string>;
  multi?: boolean;
  onChange: (next: Set<string>) => void;
}) {
  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else {
      if (!multi) next.clear();
      next.add(id);
    }
    onChange(next);
  }

  return (
    <div className="border rounded max-h-72 overflow-auto p-1 text-sm">
      {nodes.map((n) => (
        <PickerNode key={n.id} node={n} depth={0} selected={selectedIds} onToggle={toggle} />
      ))}
    </div>
  );
}

function PickerNode({
  node,
  depth,
  selected,
  onToggle,
}: {
  node: IndustryNode;
  depth: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const checked = selected.has(node.id);

  return (
    <div>
      <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-4 h-4 flex items-center justify-center"
        >
          {hasChildren ? (
            open ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="opacity-30">·</span>
          )}
        </button>
        <label className="flex items-center gap-1 cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(node.id)}
          />
          <span className="truncate">{node.name}</span>
        </label>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <PickerNode key={c.id} node={c} depth={depth + 1} selected={selected} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
