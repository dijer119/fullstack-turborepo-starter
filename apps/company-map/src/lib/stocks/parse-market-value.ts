/** 네이버 시가총액 한국어 포맷 ("1,710조 365억") → BigInt 원 단위.
 *  매칭 안 되거나 결과 0이면 null. */
export function parseKoreanMarketValue(raw: string | null | undefined): bigint | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "N/A") return null;

  let total = 0n;

  const joMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*조/);
  if (joMatch) {
    // 1조 = 10^12. 소수점 포함 시 fractional 곱은 BigInt에서 못 하므로 Number로 곱한 뒤 BigInt.
    const jo = parseFloat(joMatch[1]);
    total += BigInt(Math.round(jo * 1_000_000_000_000));
  }

  const eokMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*억/);
  if (eokMatch) {
    const eok = parseFloat(eokMatch[1]);
    total += BigInt(Math.round(eok * 100_000_000));
  }

  return total > 0n ? total : null;
}
