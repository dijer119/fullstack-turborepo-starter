import { describe, it, expect } from "vitest";
import { moveCode } from "./reorder";

describe("moveCode", () => {
  it("앞 항목을 뒤로 이동하면 드롭 대상의 자리로 들어간다 (대상 바로 뒤)", () => {
    expect(moveCode(["A", "B", "C", "D"], "A", "C")).toEqual(["B", "C", "A", "D"]);
  });

  it("뒤 항목을 앞으로 이동하면 드롭 대상의 자리로 들어간다 (대상 바로 앞)", () => {
    expect(moveCode(["A", "B", "C", "D"], "D", "B")).toEqual(["A", "D", "B", "C"]);
  });

  it("인접 항목에 드롭하면 양방향 모두 교환된다", () => {
    expect(moveCode(["A", "B", "C"], "B", "C")).toEqual(["A", "C", "B"]);
    expect(moveCode(["A", "B", "C"], "C", "B")).toEqual(["A", "C", "B"]);
  });

  it("마지막 항목에 드롭하면 맨 끝으로 이동한다", () => {
    expect(moveCode(["A", "B", "C", "D"], "A", "D")).toEqual(["B", "C", "D", "A"]);
  });

  it("자기 자신에 드롭하면 변경 없다", () => {
    expect(moveCode(["A", "B", "C"], "B", "B")).toEqual(["A", "B", "C"]);
  });

  it("미존재 코드는 변경 없이 반환한다", () => {
    expect(moveCode(["A", "B"], "X", "B")).toEqual(["A", "B"]);
    expect(moveCode(["A", "B"], "A", "X")).toEqual(["A", "B"]);
  });

  it("입력 배열을 변형하지 않는다", () => {
    const input = ["A", "B", "C"];
    moveCode(input, "A", "C");
    expect(input).toEqual(["A", "B", "C"]);
  });
});
