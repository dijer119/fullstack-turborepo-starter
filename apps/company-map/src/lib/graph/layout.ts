import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export type LayoutNode = SimulationNodeDatum & {
  id: string;
  type: "industry" | "company";
};

export type LayoutEdge = SimulationLinkDatum<LayoutNode> & {
  kind: "mapping" | "tree";
};

export type Positioned = { id: string; x: number; y: number };

/** 동기적으로 force simulation을 N번 tick 돌려 위치를 계산. */
export function computeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts?: { width?: number; height?: number; iterations?: number },
): Positioned[] {
  const width = opts?.width ?? 800;
  const height = opts?.height ?? 600;
  const iterations = opts?.iterations ?? 200;

  // mutating copies (d3-force는 객체에 vx, vy, x, y를 직접 할당)
  const ns = nodes.map((n) => ({ ...n }));
  const es = edges.map((e) => ({ ...e }));

  const sim = forceSimulation(ns)
    .force("charge", forceManyBody().strength(-180))
    .force(
      "link",
      forceLink<LayoutNode, LayoutEdge>(es)
        .id((d) => d.id)
        .distance((l) => (l.kind === "mapping" ? 90 : 130))
        .strength(0.6),
    )
    .force("center", forceCenter(width / 2, height / 2))
    .stop();

  for (let i = 0; i < iterations; i += 1) sim.tick();

  return ns.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 }));
}
