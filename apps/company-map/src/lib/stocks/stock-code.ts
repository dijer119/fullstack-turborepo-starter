// KRX 종목 단축코드: 숫자 6자리 또는 영문 대문자가 섞인 6자리 (2024년~ 코드 고갈로 영숫자 발급, 예: 0120G0)
const STOCK_CODE_RE = /^[0-9A-Z]{6}$/;

export function isValidStockCode(code: string): boolean {
  return STOCK_CODE_RE.test(code);
}
