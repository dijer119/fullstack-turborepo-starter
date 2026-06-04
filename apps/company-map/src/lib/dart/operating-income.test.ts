import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractOpIncome, extractNetIncome } from "./operating-income";

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

describe("extractNetIncome", () => {
  it("returns 연결 당기순이익(손실), 별도/세전이익/포괄손익은 제외", () => {
    const r = extractNetIncome({
      status: "000",
      list: [
        { account_nm: "영업이익", fs_nm: "연결재무제표", thstrm_amount: "5,000,000,000", frmtrm_amount: "3,800,000,000" },
        { account_nm: "법인세차감전 순이익", fs_nm: "연결재무제표", thstrm_amount: "13,545,563,000,000", frmtrm_amount: "10,320,412,000,000" },
        { account_nm: "당기순이익(손실)", fs_nm: "재무제표", thstrm_amount: "10,668,573,000,000", frmtrm_amount: "5,694,610,000,000" },
        { account_nm: "당기순이익(손실)", fs_nm: "연결재무제표", thstrm_amount: "12,225,747,000,000", frmtrm_amount: "10,100,904,000,000" },
        { account_nm: "총포괄손익", fs_nm: "연결재무제표", thstrm_amount: "999", frmtrm_amount: "999" },
      ],
    });
    expect(r).toEqual({ thstrm: 12_225_747_000_000n, frmtrm: 10_100_904_000_000n });
  });

  it("연결이 없으면 별도(재무제표)로 폴백", () => {
    const r = extractNetIncome({
      status: "000",
      list: [
        { account_nm: "당기순이익(손실)", fs_nm: "재무제표", thstrm_amount: "1,000,000,000", frmtrm_amount: "900,000,000" },
      ],
    });
    expect(r).toEqual({ thstrm: 1_000_000_000n, frmtrm: 900_000_000n });
  });

  it("'당기순이익' (괄호 없음) 표기도 매칭", () => {
    const r = extractNetIncome({
      status: "000",
      list: [
        { account_nm: "당기순이익", fs_nm: "연결재무제표", thstrm_amount: "-1,500", frmtrm_amount: "2,000" },
      ],
    });
    expect(r).toEqual({ thstrm: -1_500n, frmtrm: 2_000n });
  });

  it("당기순이익 행이 없으면 null", () => {
    expect(
      extractNetIncome({ status: "000", list: [{ account_nm: "영업이익", thstrm_amount: "1", frmtrm_amount: "1" }] }),
    ).toBeNull();
  });

  it("status != '000'이면 null", () => {
    expect(extractNetIncome({ status: "013", list: [] })).toBeNull();
  });
});
