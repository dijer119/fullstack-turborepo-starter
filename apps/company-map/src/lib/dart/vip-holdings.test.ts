import { describe, it, expect } from "vitest";
import {
  VIP_FLR_NM,
  classifyReportType,
  isVipDisclosure,
  toVipHoldingInput,
  dateChunks,
} from "./vip-holdings";
import type { DartDisclosureRow } from "./disclosure-list";

const baseRow: DartDisclosureRow = {
  corpCode: "00567890",
  corpName: "한라IMS",
  reportNm: "주식등의대량보유상황보고서(약식)",
  rcpNo: "20260518000285",
  flrNm: "브이아이피자산운용",
  rceptDt: "20260518",
  stockCode: "017250",
};

describe("VIP_FLR_NM", () => {
  it("equals exactly 브이아이피자산운용", () => {
    expect(VIP_FLR_NM).toBe("브이아이피자산운용");
  });
});

describe("classifyReportType", () => {
  it("returns D001 for 대량보유 reports", () => {
    expect(classifyReportType("주식등의대량보유상황보고서")).toBe("D001");
    expect(classifyReportType("주식등의대량보유상황보고서(약식)")).toBe("D001");
  });

  it("returns D002 for 임원·주요주주 reports", () => {
    expect(classifyReportType("임원ㆍ주요주주특정증권등소유상황보고서")).toBe("D002");
    expect(classifyReportType("임원·주요주주특정증권등소유상황보고서")).toBe("D002");
  });

  it("returns null for non-D reports", () => {
    expect(classifyReportType("분기보고서")).toBeNull();
    expect(classifyReportType("감사보고서")).toBeNull();
  });
});

describe("isVipDisclosure", () => {
  it("true when flr_nm matches and report is D001 or D002", () => {
    expect(isVipDisclosure(baseRow)).toBe(true);
  });

  it("false when flr_nm differs", () => {
    expect(isVipDisclosure({ ...baseRow, flrNm: "다른제출인" })).toBe(false);
  });

  it("false for non-D report names", () => {
    expect(isVipDisclosure({ ...baseRow, reportNm: "분기보고서" })).toBe(false);
  });
});

describe("toVipHoldingInput", () => {
  it("converts DartDisclosureRow + stockCode to Prisma input", () => {
    const input = toVipHoldingInput(baseRow, "017250");
    expect(input).toEqual({
      rcpNo: "20260518000285",
      code: "017250",
      corpCode: "00567890",
      corpName: "한라IMS",
      reportNm: "주식등의대량보유상황보고서(약식)",
      reportType: "D001",
      flrNm: "브이아이피자산운용",
      rceptDt: new Date("2026-05-18T00:00:00.000Z"),
    });
  });

  it("throws if report cannot be classified (caller bug guard)", () => {
    expect(() =>
      toVipHoldingInput({ ...baseRow, reportNm: "분기보고서" }, "017250"),
    ).toThrow(/classify/i);
  });
});

describe("dateChunks", () => {
  it("splits 180-day window into two ≤90-day chunks ending today", () => {
    const now = new Date("2026-05-21T00:00:00.000Z");
    const cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const chunks = dateChunks(cutoff, now, 90);
    expect(chunks).toHaveLength(3); // 180 days needs ceil(180/90)+1 = 3 chunks because endpoints are inclusive
    expect(chunks[0].endDe).toBe("20260521");
    // last chunk's bgnDe must be >= cutoff date
    const lastBgn = chunks[chunks.length - 1].bgnDe;
    const cutoffStr =
      cutoff.getFullYear().toString() +
      String(cutoff.getMonth() + 1).padStart(2, "0") +
      String(cutoff.getDate()).padStart(2, "0");
    expect(lastBgn >= cutoffStr).toBe(true);
  });

  it("returns one chunk when window is smaller than chunkDays", () => {
    const now = new Date("2026-05-21T00:00:00.000Z");
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const chunks = dateChunks(cutoff, now, 90);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].bgnDe).toBe("20260421");
    expect(chunks[0].endDe).toBe("20260521");
  });
});
