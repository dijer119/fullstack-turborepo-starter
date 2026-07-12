// dryRun 가상 체결 판정. 전일 일봉(종가·고가)으로 전일 simulated 주문의 체결을 흉내낸다.
// 라이브와 동일한 적용 경로(sync.ts applyFills)를 태우기 위한 입력 생성용. 순수 함수.
export interface DryCandle {
  close: number;
  high: number;
}

export interface DryFillResult {
  filled: boolean;
  fillPrice: number | null;
}

export function judgeDryFill(
  order: { side: "BUY" | "SELL"; orderType: string; tif: string; price: number | null },
  candle: DryCandle,
): DryFillResult {
  const miss: DryFillResult = { filled: false, fillPrice: null };
  if (order.orderType !== "LIMIT" || order.price == null) return miss;

  if (order.tif === "CLS") {
    // LOC: 종가 기준, 체결가는 종가
    if (order.side === "BUY") {
      return candle.close <= order.price ? { filled: true, fillPrice: candle.close } : miss;
    }
    return candle.close >= order.price ? { filled: true, fillPrice: candle.close } : miss;
  }

  if (order.tif === "DAY" && order.side === "SELL") {
    // 지정가 매도: 장중 고가가 리밋 터치 → 리밋가 체결
    return candle.high >= order.price ? { filled: true, fillPrice: order.price } : miss;
  }

  return miss;
}
