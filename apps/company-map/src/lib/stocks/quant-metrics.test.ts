import { describe, it, expect } from "vitest";
import {
  resolveRoe,
  week52Position,
  bondDividendRatio,
  seoJunsikReturn,
  isFresh,
  reprtLabel,
} from "./quant-metrics";

describe("resolveRoe", () => {
  it("수동 ROE가 있으면 우선한다", () => {
    expect(resolveRoe(12.5, 10, 1.5)).toBe(12.5);
  });
  it("수동값이 없으면 PBR/PER×100", () => {
    expect(resolveRoe(null, 10, 2)).toBeCloseTo(20);
  });
  it("per/pbr가 0 이하이거나 null이면 null", () => {
    expect(resolveRoe(null, 0, 2)).toBeNull();
    expect(resolveRoe(null, 10, -1)).toBeNull();
    expect(resolveRoe(null, null, 2)).toBeNull();
  });
  it("NaN 수동값은 무시하고 auto 계산으로 폴백", () => {
    expect(resolveRoe(NaN, 10, 2)).toBeCloseTo(20);
  });
});

describe("week52Position", () => {
  it("이미지 검산: 현재가 72900, 저가 58000, 고가 88200 → 49.3%", () => {
    expect(week52Position(72900, 58000, 88200)).toBeCloseTo(49.34, 1);
  });
  it("저가/고가 경계에서 0과 100", () => {
    expect(week52Position(58000, 58000, 88200)).toBe(0);
    expect(week52Position(88200, 58000, 88200)).toBe(100);
  });
  it("범위를 벗어나면 0~100으로 클램프", () => {
    expect(week52Position(90000, 58000, 88200)).toBe(100);
    expect(week52Position(50000, 58000, 88200)).toBe(0);
  });
  it("high<=low 또는 값 누락이면 null", () => {
    expect(week52Position(100, 200, 200)).toBeNull();
    expect(week52Position(null, 100, 200)).toBeNull();
  });
  it("NaN 입력이면 null", () => {
    expect(week52Position(NaN, 58000, 88200)).toBeNull();
  });
});

describe("bondDividendRatio", () => {
  it("배당수익률 ÷ 국채금리", () => {
    expect(bondDividendRatio(4.12, 3.7)).toBeCloseTo(1.11, 2);
  });
  it("금리가 0 이하 또는 null이면 null", () => {
    expect(bondDividendRatio(4, 0)).toBeNull();
    expect(bondDividendRatio(4, null)).toBeNull();
    expect(bondDividendRatio(null, 3)).toBeNull();
  });
  it("NaN 입력이면 null", () => {
    expect(bondDividendRatio(4, NaN)).toBeNull();
  });
});

describe("seoJunsikReturn", () => {
  it("PBR 1.0, ROE 10% → 기대수익률 정확히 10%", () => {
    expect(seoJunsikReturn(1.0, 10)).toBeCloseTo(10, 6);
  });
  it("이미지 유사값 검산: PBR 1.23, ROE 21.97% → 약 19.5%", () => {
    expect(seoJunsikReturn(1.23, 21.97)).toBeCloseTo(19.47, 1);
  });
  it("PBR이 0 이하이거나 null이면 null", () => {
    expect(seoJunsikReturn(0, 10)).toBeNull();
    expect(seoJunsikReturn(null, 10)).toBeNull();
  });
  it("ROE가 -100% 이하이거나 null이면 null", () => {
    expect(seoJunsikReturn(1, -100)).toBeNull();
    expect(seoJunsikReturn(1, null)).toBeNull();
  });
  it("NaN 입력이면 null", () => {
    expect(seoJunsikReturn(NaN, 10)).toBeNull();
  });
});

describe("isFresh", () => {
  const ttl = 24 * 60 * 60 * 1000;
  it("TTL 이내면 true", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    expect(isFresh(new Date("2026-06-10T00:00:00Z"), now, ttl)).toBe(true);
  });
  it("TTL 경과면 false", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    expect(isFresh(new Date("2026-06-09T11:59:00Z"), now, ttl)).toBe(false);
  });
  it("정확히 TTL 경과 시점이면 false", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    expect(isFresh(new Date("2026-06-09T12:00:00Z"), now, ttl)).toBe(false);
  });
});

describe("reprtLabel", () => {
  it("DART 보고서 코드를 분기 라벨로 변환", () => {
    expect(reprtLabel("11013")).toBe("1Q");
    expect(reprtLabel("11012")).toBe("2Q");
    expect(reprtLabel("11014")).toBe("3Q");
    expect(reprtLabel("11011")).toBe("FY");
  });
  it("알 수 없는 코드는 그대로 반환", () => {
    expect(reprtLabel("99999")).toBe("99999");
  });
});
