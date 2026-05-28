import type { OwnershipPayload } from "./disclosure-payloads";

export function classifyOwnership(reportNm: string): OwnershipPayload {
  if (/주식등의대량보유상황보고서/.test(reportNm)) {
    return { reportType: "주식대량보유" };
  }
  if (/임원[ㆍ··.]?주요주주특정증권등소유상황보고서/.test(reportNm)) {
    return { reportType: "임원·주요주주" };
  }
  if (/자기주식/.test(reportNm)) {
    return { reportType: "자기주식" };
  }
  return { reportType: "기타" };
}
