"use client";

import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listIndustries } from "@/actions/industries";
import { getCompany } from "@/actions/companies";
import {
  getIndustriesForCompany,
  getCompaniesForIndustry,
} from "@/actions/mappings";
import { computeLayout, type LayoutEdge, type LayoutNode } from "@/lib/graph/layout";
import { CompanyNode } from "./CompanyNode";
import { IndustryNode } from "./IndustryNode";
import type { Industry } from "@/types/industry";
import type { Company } from "@/types/company";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes = { industry: IndustryNode, company: CompanyNode } as unknown as Record<string, React.ComponentType<any>>;

export type Focus = { type: "industry" | "company"; id: string } | null;

export type FocusNeighborhood = {
  focus: Focus;
  industries: Industry[];
  companies: Company[];
  /** 매핑 관계 (회사-산업 양방향 그릴 때 사용) */
  mappings: { companyId: string; industryId: string }[];
  /** 트리 부모/형제 (점선 엣지로 표시) */
  treeParent?: Industry | null;
  treeSiblings?: Industry[];
};

export function MapGraph({
  focus,
  onFocusChange,
  onNeighborhoodChange,
}: {
  focus: Focus;
  onFocusChange: (next: Focus) => void;
  /** 트리 동기화에 필요한 정보를 부모(메인 페이지)에 전달 */
  onNeighborhoodChange?: (n: FocusNeighborhood) => void;
}) {
  const [neighborhood, setNeighborhood] = useState<FocusNeighborhood>({
    focus: null, industries: [], companies: [], mappings: [],
  });

  const cbRef = useRef(onNeighborhoodChange);
  useEffect(() => { cbRef.current = onNeighborhoodChange; });

  const router = useRouter();

  // focus 바뀌면 주변 데이터 fetch
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!focus) {
        const empty: FocusNeighborhood = { focus: null, industries: [], companies: [], mappings: [] };
        if (alive) { setNeighborhood(empty); cbRef.current?.(empty); }
        return;
      }
      if (focus.type === "industry") {
        const [allIndustries, members] = await Promise.all([
          listIndustries(),
          getCompaniesForIndustry(focus.id),
        ]);
        const center = allIndustries.find((i) => i.id === focus.id);
        if (!center || !alive) return;
        const parent = center.parent_id
          ? allIndustries.find((i) => i.id === center.parent_id) ?? null
          : null;
        const siblings = parent
          ? allIndustries.filter((i) => i.parent_id === parent.id && i.id !== center.id)
          : [];
        const children = allIndustries.filter((i) => i.parent_id === center.id);
        const indSet = [center, ...(parent ? [parent] : []), ...siblings, ...children];
        const mappings = members.map((c) => ({ companyId: c.id, industryId: focus.id }));
        const next: FocusNeighborhood = {
          focus, industries: indSet, companies: members, mappings,
          treeParent: parent, treeSiblings: siblings,
        };
        if (alive) { setNeighborhood(next); cbRef.current?.(next); }
      } else {
        const [center, mappedIndustries] = await Promise.all([
          getCompany(focus.id),
          getIndustriesForCompany(focus.id),
        ]);
        if (!center || !alive) return;
        const mappings = mappedIndustries.map((i) => ({ companyId: focus.id, industryId: i.id }));
        const next: FocusNeighborhood = {
          focus, industries: mappedIndustries, companies: [center], mappings,
        };
        if (alive) { setNeighborhood(next); cbRef.current?.(next); }
      }
    })();
    return () => { alive = false; };
  }, [focus]);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    const rfNodes: Node[] = [];
    const rfEdges: Edge[] = [];
    const layoutNodes: LayoutNode[] = [];
    const layoutEdges: LayoutEdge[] = [];

    neighborhood.industries.forEach((i) => {
      const isFocus = focus?.type === "industry" && focus.id === i.id;
      rfNodes.push({
        id: `industry-${i.id}`,
        type: "industry",
        position: { x: 0, y: 0 },
        data: { label: i.name, isFocus },
      });
      layoutNodes.push({ id: `industry-${i.id}`, type: "industry" });
    });
    neighborhood.companies.forEach((c) => {
      const isFocus = focus?.type === "company" && focus.id === c.id;
      rfNodes.push({
        id: `company-${c.id}`,
        type: "company",
        position: { x: 0, y: 0 },
        data: { label: c.name, ticker: c.ticker, isFocus },
      });
      layoutNodes.push({ id: `company-${c.id}`, type: "company" });
    });

    // mapping edges (실선)
    neighborhood.mappings.forEach((m) => {
      const id = `m-${m.companyId}-${m.industryId}`;
      rfEdges.push({
        id, source: `industry-${m.industryId}`, target: `company-${m.companyId}`,
        style: { stroke: "#10b981", strokeWidth: 1.5 },
      });
      layoutEdges.push({ source: `industry-${m.industryId}`, target: `company-${m.companyId}`, kind: "mapping" });
    });

    // tree edges (점선) — 산업 포커스인 경우 부모/형제/자식 표현
    if (focus?.type === "industry" && neighborhood.treeParent) {
      const id = `t-parent-${neighborhood.treeParent.id}`;
      rfEdges.push({
        id, source: `industry-${neighborhood.treeParent.id}`, target: `industry-${focus.id}`,
        animated: false, style: { stroke: "#64748b", strokeDasharray: "4 3" },
      });
      layoutEdges.push({ source: `industry-${neighborhood.treeParent.id}`, target: `industry-${focus.id}`, kind: "tree" });
    }

    const positioned = computeLayout(layoutNodes, layoutEdges, {
      width: 800, height: 500,
    });
    const posMap = new Map(positioned.map((p) => [p.id, p]));
    rfNodes.forEach((n) => {
      const p = posMap.get(n.id);
      if (p) n.position = { x: p.x, y: p.y };
    });
    return { nodes: rfNodes, edges: rfEdges };
  }, [neighborhood, focus]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    const idx = node.id.indexOf("-");
    if (idx === -1) return;
    const type = node.id.slice(0, idx);
    const id = node.id.slice(idx + 1);
    if (type === "industry" || type === "company") {
      onFocusChange({ type: type as "industry" | "company", id });
    }
  };

  const onNodeDoubleClick: NodeMouseHandler = (_, node) => {
    const idx = node.id.indexOf("-");
    if (idx === -1) return;
    const type = node.id.slice(0, idx);
    const id = node.id.slice(idx + 1);
    router.push(`/${type === "industry" ? "industries" : "companies"}/${id}`);
  };

  if (!focus) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        좌측 트리에서 산업을 선택하거나 검색바로 시작하세요.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      fitView
    >
      <Background gap={16} size={1} />
      <Controls />
    </ReactFlow>
  );
}
