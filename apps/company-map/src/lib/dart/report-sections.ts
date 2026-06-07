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

// 완전한 <table>...</table> 블록을 위치와 함께 추출.
function tablesWithPos(html: string): Array<{ html: string; pos: number }> {
  const out: Array<{ html: string; pos: number }> = [];
  const re = /<table[\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push({ html: m[0], pos: m.index });
  return out;
}

// 소제목 텍스트의 첫 등장 위치(-1 없음).
function headingIndex(html: string, re: RegExp): number {
  const m = html.match(re);
  return m && m.index != null ? m.index : -1;
}

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(link|meta)\b[^>]*>/gi, "")
    // 문서 래퍼 제거: viewer.do는 전체 문서(<body bgcolor=...>)를 반환하므로
    // html/head/body/doctype를 제거하지 않으면 페이지 body 속성과 충돌해 hydration 불일치 발생.
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?(?:html|body)\b[^>]*>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    // Normalize tag names to lowercase for consistent HTML.
    .replace(/<\/?[A-Z][A-Z0-9]*/g, (m) => m.toLowerCase());
}

// "4. 매출 및 수주상황" 섹션을 매출실적 표 / 수주상황 표로 분리.
// 소제목 패턴: "가. 매출실적", "바. 수주상황" 형태(한글 가나다 접두 + 마침표)를 찾아
// 섹션 제목("4. 매출 및 수주상황")과 구별한다.
export function splitSalesOrders(sectionHtml: string): {
  salesHtml: string;
  ordersHtml: string;
} {
  const ordersIdx = headingIndex(sectionHtml, /[가-힣]\.\s*수주\s*상황/);
  const salesIdx = headingIndex(sectionHtml, /[가-힣]\.\s*매출\s*실적/);
  const tables = tablesWithPos(sectionHtml);

  const orderTables = ordersIdx >= 0
    ? tables.filter((t) => t.pos > ordersIdx).map((t) => t.html)
    : [];
  const salesTables = tables
    .filter((t) => (salesIdx < 0 || t.pos >= salesIdx) && (ordersIdx < 0 || t.pos < ordersIdx))
    .map((t) => t.html);

  return {
    salesHtml: salesTables.length ? sanitizeHtml(salesTables.join("\n")) : "",
    ordersHtml: orderTables.length ? sanitizeHtml(orderTables.join("\n")) : "",
  };
}

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
