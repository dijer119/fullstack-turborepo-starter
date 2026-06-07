import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { parseTreeData, findSectionNode } from "./report-sections";

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
