import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { parseTreeData, findSectionNode, splitSalesOrders, sanitizeHtml } from "./report-sections";

const mainHtml = readFileSync(
  join(__dirname, "../../../tests/fixtures/dart-report-main.html"),
  "utf-8",
);

describe("parseTreeData", () => {
  it("목차 노드를 제목→문서파라미터로 파싱한다", () => {
    const nodes = parseTreeData(mainHtml);
    const sales = nodes.find((n) => n.text.includes("매출") && n.text.includes("수주"));
    expect(sales).toBeTruthy();
    expect(sales!.dcmNo).toBe("11386164");
    expect(sales!.eleId).toBe("13");
    expect(sales!.offset).toBe("60425");
    expect(sales!.length).toBe("26562");
    expect(sales!.dtd).toBe("dart4.xsd");
  });
});

describe("findSectionNode", () => {
  it("사업개요 노드(사업의 개요)를 찾는다", () => {
    const nodes = parseTreeData(mainHtml);
    const n = findSectionNode(nodes, "overview");
    expect(n).toBeTruthy();
    expect(n!.eleId).toBe("10");
    expect(n!.offset).toBe("10807");
  });
  it("매출·수주 노드를 찾는다", () => {
    const nodes = parseTreeData(mainHtml);
    const n = findSectionNode(nodes, "sales_orders");
    expect(n!.eleId).toBe("13");
  });
  it("없으면 null", () => {
    expect(findSectionNode([], "overview")).toBeNull();
  });
});

const sectionHtml = readFileSync(
  join(__dirname, "../../../tests/fixtures/dart-report-section.html"),
  "utf-8",
);

describe("splitSalesOrders", () => {
  it("매출실적 표와 수주상황 표를 분리한다", () => {
    const { salesHtml, ordersHtml } = splitSalesOrders(sectionHtml);
    expect(salesHtml).toContain("<table");
    expect(ordersHtml).toContain("<table");
    expect(ordersHtml).toContain("수주");
  });
  it("수주상황 소제목이 없으면 ordersHtml은 빈 문자열", () => {
    const { ordersHtml } = splitSalesOrders("<p>매출실적</p><table><tr><td>1</td></tr></table>");
    expect(ordersHtml).toBe("");
  });
});

describe("sanitizeHtml", () => {
  it("script와 이벤트 핸들러를 제거하고 표는 보존한다", () => {
    const out = sanitizeHtml('<table onclick="x()"><tr><td>a</td></tr></table><script>bad()</script>');
    expect(out).toContain("<table");
    expect(out).toContain("a");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
  });

  it("문서 래퍼(html/head/body/doctype)를 제거하고 내용은 보존한다", () => {
    const out = sanitizeHtml(
      '<!DOCTYPE html><HTML><HEAD><title>x</title></HEAD><BODY bgcolor="#FFFFFF"><p>내용</p></BODY></HTML>',
    );
    expect(out).toContain("내용");
    expect(out).not.toMatch(/<body/i);
    expect(out).not.toContain("bgcolor");
    expect(out).not.toMatch(/<head/i);
    expect(out).not.toContain("<title");
    expect(out).not.toMatch(/<html/i);
  });
});
