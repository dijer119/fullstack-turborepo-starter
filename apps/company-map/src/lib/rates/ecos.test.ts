import { describe, it, expect } from "vitest";
import { parseEcosYield } from "./ecos";

describe("parseEcosYield", () => {
  it("마지막 행의 DATA_VALUE를 숫자로 반환", () => {
    const json = {
      StatisticSearch: {
        row: [
          { TIME: "20260608", DATA_VALUE: "3.65" },
          { TIME: "20260609", DATA_VALUE: "3.72" },
        ],
      },
    };
    expect(parseEcosYield(json)).toBeCloseTo(3.72);
  });

  it("row가 없거나 비어 있으면 null", () => {
    expect(parseEcosYield({})).toBeNull();
    expect(parseEcosYield({ StatisticSearch: { row: [] } })).toBeNull();
    expect(parseEcosYield(null)).toBeNull();
  });

  it("DATA_VALUE가 숫자가 아니거나 0 이하면 null", () => {
    expect(
      parseEcosYield({ StatisticSearch: { row: [{ DATA_VALUE: "abc" }] } }),
    ).toBeNull();
    expect(
      parseEcosYield({ StatisticSearch: { row: [{ DATA_VALUE: "0" }] } }),
    ).toBeNull();
  });
});
