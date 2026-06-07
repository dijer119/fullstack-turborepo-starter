export interface TreeNode {
  text: string;
  rcpNo: string;
  dcmNo: string;
  eleId: string;
  offset: string;
  length: string;
  dtd: string;
}

// main.do는 var nodeN = {}; nodeN['key']="val"; 형태로 목차를 만든다.
export function parseTreeData(mainHtml: string): TreeNode[] {
  const blocks = mainHtml.split(/var node\d+ = \{\};/);
  const grab = (b: string, k: string): string => {
    const m = b.match(new RegExp(`\\['${k}'\\]\\s*=\\s*"([^"]*)"`));
    return m ? m[1] : "";
  };
  const nodes: TreeNode[] = [];
  for (const b of blocks) {
    const text = grab(b, "text");
    const dcmNo = grab(b, "dcmNo");
    if (!text || !dcmNo) continue;
    nodes.push({
      text: text.trim(),
      rcpNo: grab(b, "rcpNo"),
      dcmNo,
      eleId: grab(b, "eleId"),
      offset: grab(b, "offset"),
      length: grab(b, "length"),
      dtd: grab(b, "dtd"),
    });
  }
  return nodes;
}

export type SectionKind = "overview" | "sales_orders";

export function findSectionNode(
  nodes: TreeNode[],
  kind: SectionKind,
): TreeNode | null {
  const norm = (s: string) => s.replace(/\s+/g, "");
  for (const n of nodes) {
    const t = norm(n.text);
    if (kind === "overview" && t.includes("사업의개요")) return n;
    if (kind === "sales_orders" && t.includes("매출") && t.includes("수주")) return n;
  }
  return null;
}
