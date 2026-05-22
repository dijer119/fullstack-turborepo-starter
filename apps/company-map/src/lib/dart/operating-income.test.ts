import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractOpIncome } from "./operating-income";

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../tests/fixtures/dart-fnltt-op-income.json"),
    "utf-8",
  ),
);

describe("extractOpIncome", () => {
  it("returns 연결 영업이익 when available", () => {
    const r = extractOpIncome(fixture);
    expect(r).not.toBeNull();
    expect(r!.thstrm).toBe(5_000_000_000n);
    expect(r!.frmtrm).toBe(3_800_000_000n);
  });

  it("falls back to 별도/재무제표 when 연결 missing", () => {
    const onlyStandalone = {
      status: "000",
      list: fixture.list.filter(
        (x: { fs_nm: string }) => x.fs_nm === "재무제표",
      ),
    };
    const r = extractOpIncome(onlyStandalone);
    expect(r).not.toBeNull();
    expect(r!.thstrm).toBe(1_000_000_000n);
    expect(r!.frmtrm).toBe(900_000_000n);
  });

  it("returns null when status != '000'", () => {
    expect(extractOpIncome({ status: "013", list: [] })).toBeNull();
  });

  it("returns null when 영업이익 row absent", () => {
    expect(
      extractOpIncome({
        status: "000",
        list: [{ account_nm: "매출액", thstrm_amount: "1" }],
      }),
    ).toBeNull();
  });

  it("returns null when thstrm or frmtrm cannot be parsed", () => {
    expect(
      extractOpIncome({
        status: "000",
        list: [
          {
            account_nm: "영업이익",
            fs_nm: "연결재무제표",
            thstrm_amount: "-",
            frmtrm_amount: "-",
          },
        ],
      }),
    ).toBeNull();
  });

  it("parses negative amounts (loss) correctly", () => {
    expect(
      extractOpIncome({
        status: "000",
        list: [
          {
            account_nm: "영업이익",
            fs_nm: "연결재무제표",
            thstrm_amount: "-1,500,000,000",
            frmtrm_amount: "2,000,000,000",
          },
        ],
      }),
    ).toEqual({ thstrm: -1_500_000_000n, frmtrm: 2_000_000_000n });
  });

  it("matches 영업이익(손실) used by banks/금융지주", () => {
    expect(
      extractOpIncome({
        status: "000",
        list: [
          {
            account_nm: "영업이익(손실)",
            fs_nm: "연결재무제표",
            thstrm_amount: "2,727,566,000,000",
            frmtrm_amount: "1,500,000,000,000",
          },
        ],
      }),
    ).toEqual({ thstrm: 2_727_566_000_000n, frmtrm: 1_500_000_000_000n });
  });
});
