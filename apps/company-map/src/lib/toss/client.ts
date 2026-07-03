// 토스증권 Open API 클라이언트.
// (worker 무인 루프와 공유하므로 `server-only` 가드를 두지 않는다. tsx worker가
//  이 모듈을 import하면 server-only가 throw하기 때문. 클라이언트 컴포넌트에서는
//  타입만 import하므로 runtime client import은 없다.)
// 인증: OAuth2 Client Credentials → access token(약 24h) → Bearer 헤더.
// 계좌·보유 API는 X-Tossinvest-Account: {accountSeq} 헤더가 추가로 필요.
// 문서: https://developers.tossinvest.com/docs

const BASE_URL = "https://openapi.tossinvest.com";

export class TossNotConfiguredError extends Error {
  constructor() {
    super("TOSS_API_KEY / TOSS_API_SECRET 가 설정되지 않았습니다.");
    this.name = "TossNotConfiguredError";
  }
}

export function isTossConfigured(): boolean {
  return Boolean(process.env.TOSS_API_KEY && process.env.TOSS_API_SECRET);
}

// 토큰 캐시: 만료 60초 전까지 재사용. 모듈 스코프(dev 재시작 시 초기화).
let cachedToken: { value: string; expiresAt: number } | null = null;
// 토큰 발급 single-flight 가드: 동시 요청은 하나의 발급을 공유한다.
// (토스는 클라이언트당 활성 토큰 1개라, 동시 다발 재발급 시 서로를 무효화함)
let tokenPromise: Promise<string> | null = null;

async function fetchNewToken(): Promise<string> {
  const clientId = process.env.TOSS_API_KEY;
  const clientSecret = process.env.TOSS_API_SECRET;
  if (!clientId || !clientSecret) throw new TossNotConfiguredError();

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const resp = await fetch(`${BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!resp.ok) {
    throw new Error(`토스 토큰 발급 실패 (${resp.status}): ${await resp.text()}`);
  }
  const json = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return json.access_token;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  // 진행 중인 발급이 있으면 그 결과를 공유 (동시 재발급으로 인한 상호 무효화 방지).
  if (!tokenPromise) {
    tokenPromise = fetchNewToken().finally(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
}

interface CallOpts {
  accountSeq?: number;
  method?: "GET" | "POST";
  body?: unknown;
}

async function callOnce(
  path: string,
  token: string,
  opts?: CallOpts,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (opts?.accountSeq != null) {
    headers["X-Tossinvest-Account"] = String(opts.accountSeq);
  }
  const method = opts?.method ?? "GET";
  if (method === "POST") headers["Content-Type"] = "application/json";
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
}

async function tossFetch<T>(path: string, opts?: CallOpts): Promise<T> {
  let resp = await callOnce(path, await getAccessToken(), opts);
  // 401: 캐시된 토큰이 외부 재발급 등으로 무효화됐을 수 있음. 토큰 강제 갱신 후 1회 재시도.
  if (resp.status === 401) {
    resp = await callOnce(path, await getAccessToken(true), opts);
  }
  if (!resp.ok) {
    // 에러 본문(JSON)을 그대로 던져 호출측에서 코드 분기 가능하게 함.
    throw new TossApiError(resp.status, await resp.text());
  }
  return (await resp.json()) as T;
}

// 토스 API 에러. body에 { error: { code, message, data } } JSON이 담긴다.
export class TossApiError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, body: string) {
    let code: string | null = null;
    let message = body;
    try {
      const parsed = JSON.parse(body) as {
        error?: { code?: string; message?: string };
      };
      code = parsed.error?.code ?? null;
      message = parsed.error?.message ?? body;
    } catch {
      // body가 JSON이 아니면 원문 유지
    }
    super(message);
    this.name = "TossApiError";
    this.status = status;
    this.code = code;
  }
}

export type TossAccountType =
  | "BROKERAGE"
  | "OVERSEAS_DERIVATIVES"
  | "PENSION_SAVINGS"
  | "RESHORING_INVESTMENT";

export interface TossAccount {
  accountNo: string;
  accountSeq: number;
  accountType: TossAccountType;
}

// 계좌 목록은 거의 변하지 않고 ACCOUNT 그룹은 초당 1회 제한이라, 짧게 캐싱해
// 잦은 새로고침 시 429(rate-limit)를 피한다.
let cachedAccounts: { value: TossAccount[]; expiresAt: number } | null = null;

export async function getAccounts(): Promise<TossAccount[]> {
  if (cachedAccounts && Date.now() < cachedAccounts.expiresAt) {
    return cachedAccounts.value;
  }
  const json = await tossFetch<{ result: TossAccount[] }>("/api/v1/accounts");
  cachedAccounts = { value: json.result, expiresAt: Date.now() + 60_000 };
  return json.result;
}

// holdings 원본 응답 (금액·수량은 모두 string, null 가능).
interface RawMoney {
  krw: string;
  usd: string | null;
}
export interface RawHoldingsItem {
  symbol: string;
  name: string;
  marketCountry: "KR" | "US";
  currency: "KRW" | "USD";
  quantity: string;
  lastPrice: string;
  averagePurchasePrice: string;
  marketValue: { purchaseAmount: string; amount: string; amountAfterCost: string };
  profitLoss: { amount: string; amountAfterCost: string; rate: string; rateAfterCost: string };
  dailyProfitLoss: { amount: string; rate: string };
  cost: { commission: string; tax: string | null };
}
export interface RawHoldingsOverview {
  totalPurchaseAmount: RawMoney;
  marketValue: { amount: RawMoney; amountAfterCost: RawMoney };
  profitLoss: { amount: RawMoney; amountAfterCost: RawMoney; rate: string; rateAfterCost: string };
  dailyProfitLoss: { amount: RawMoney; rate: string };
  items: RawHoldingsItem[];
}

export async function getHoldings(accountSeq: number): Promise<RawHoldingsOverview> {
  const json = await tossFetch<{ result: RawHoldingsOverview }>(
    "/api/v1/holdings",
    { accountSeq },
  );
  return json.result;
}

interface RawExchangeRate {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
}

// 환율 조회. base→quote 1단위 환율(string). 예: USD→KRW "1540.23".
export async function getExchangeRate(
  baseCurrency: "USD" | "KRW",
  quoteCurrency: "USD" | "KRW",
): Promise<number> {
  const json = await tossFetch<{ result: RawExchangeRate }>(
    `/api/v1/exchange-rate?baseCurrency=${baseCurrency}&quoteCurrency=${quoteCurrency}`,
  );
  return Number(json.result.rate);
}

export interface TossStockInfo {
  symbol: string;
  name: string;
  englishName: string | null;
  market: string; // KOSPI/KOSDAQ/NASDAQ/NYSE 등
  currency: "KRW" | "USD";
  status: string; // ACTIVE 등
}

// 종목 기본정보 조회(배치). 존재하지 않는 심볼은 결과에서 빠진다(에러 아님).
export async function getStocksInfo(symbols: string[]): Promise<TossStockInfo[]> {
  if (symbols.length === 0) return [];
  const q = encodeURIComponent(symbols.join(","));
  const json = await tossFetch<{ result: TossStockInfo[] }>(
    `/api/v1/stocks?symbols=${q}`,
  );
  return json.result;
}

export interface TossPrice {
  symbol: string;
  lastPrice: string;
  currency: "KRW" | "USD";
  timestamp: string;
}

// 현재가 조회(배치). 존재하지 않는 심볼은 결과에서 빠진다.
export async function getPrices(symbols: string[]): Promise<TossPrice[]> {
  if (symbols.length === 0) return [];
  const q = encodeURIComponent(symbols.join(","));
  const json = await tossFetch<{ result: TossPrice[] }>(
    `/api/v1/prices?symbols=${q}`,
  );
  return json.result;
}

interface CalSession {
  startTime: string;
  endTime: string;
}
interface KRCalDay {
  date: string;
  integrated: {
    preMarket: CalSession;
    regularMarket: CalSession;
    afterMarket: CalSession;
  };
}
interface USCalDay {
  date: string;
  dayMarket: CalSession;
  preMarket: CalSession;
  regularMarket: CalSession;
  afterMarket: CalSession;
}
export interface MarketCalendar<D> {
  today: D;
  previousBusinessDay: D;
  nextBusinessDay: D;
}

export async function getMarketCalendarKR(): Promise<MarketCalendar<KRCalDay>> {
  const json = await tossFetch<{ result: MarketCalendar<KRCalDay> }>(
    "/api/v1/market-calendar/KR",
  );
  return json.result;
}

export async function getMarketCalendarUS(): Promise<MarketCalendar<USCalDay>> {
  const json = await tossFetch<{ result: MarketCalendar<USCalDay> }>(
    "/api/v1/market-calendar/US",
  );
  return json.result;
}

interface RawCandle {
  timestamp: string;
  closePrice: string;
}

export interface DailyCandle {
  date: string; // YYYY-MM-DD (KST)
  close: number;
}

// 일봉 종가 시계열(오름차순). 차트용. 토스 candles는 최신순이라 정렬해서 반환.
export async function getDailyCandles(
  symbol: string,
  count = 90,
): Promise<DailyCandle[]> {
  const json = await tossFetch<{ result: { candles: RawCandle[] } }>(
    `/api/v1/candles?symbol=${encodeURIComponent(symbol)}&interval=1d&count=${count}`,
  );
  return (json.result.candles ?? [])
    .map((c) => ({ date: c.timestamp.slice(0, 10), close: Number(c.closePrice) }))
    .filter((c) => Number.isFinite(c.close))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 정규장 기준가(상·하한가의 중앙값). KR은 ±30% 대칭이라 (상한+하한)/2 = 기준가.
// 미국 종목은 가격제한이 없어 null 필드 → 0 반환.
export async function getPriceLimitBase(symbol: string): Promise<number> {
  const json = await tossFetch<{
    result: { upperLimitPrice: string | null; lowerLimitPrice: string | null };
  }>(`/api/v1/price-limits?symbol=${encodeURIComponent(symbol)}`);
  const upper = Number(json.result.upperLimitPrice);
  const lower = Number(json.result.lowerLimitPrice);
  return upper > 0 && lower > 0 ? (upper + lower) / 2 : 0;
}

// 전일종가(표시용) = 직전 거래일 일봉 종가. 일봉은 최신순. 날짜 규칙으로 산출:
//  - candles[0]가 현재가와 같은 날짜(오늘 형성중)면 전일종가=candles[1]
//  - 형성중 세션이 자정을 넘긴 미국 야간 정규장 대비: candles[0].종가≈현재가면 형성중으로 봄
export async function getPreviousClose(
  symbol: string,
  lastPrice: number,
  priceTimestamp: string,
): Promise<number | null> {
  const json = await tossFetch<{ result: { candles: RawCandle[] } }>(
    `/api/v1/candles?symbol=${encodeURIComponent(symbol)}&interval=1d&count=2`,
  );
  const candles = json.result.candles ?? [];
  if (candles.length < 2) return null;
  const c0 = Number(candles[0].closePrice);
  const c1 = Number(candles[1].closePrice);
  const c0Date = candles[0].timestamp.slice(0, 10); // 둘 다 +09:00 → KST 날짜
  const priceDate = priceTimestamp.slice(0, 10);
  const eps = Math.abs(lastPrice) * 1e-4; // 형성중 캔들은 종가==현재가(차이 0)
  const c0IsCurrentSession = c0Date >= priceDate || Math.abs(c0 - lastPrice) < eps;
  return c0IsCurrentSession ? c1 : c0;
}

export interface OrderbookLevel {
  price: string;
  volume: string;
}
export interface RawOrderbook {
  timestamp: string;
  currency: "KRW" | "USD";
  asks: OrderbookLevel[]; // 매도호가 (오름차순, asks[0]=최우선 매도호가)
  bids: OrderbookLevel[]; // 매수호가 (내림차순, bids[0]=최우선 매수호가)
}

// 호가 조회. 토큰만 필요(MARKET_DATA 그룹). symbol 단건.
export async function getOrderbook(symbol: string): Promise<RawOrderbook> {
  const json = await tossFetch<{ result: RawOrderbook }>(
    `/api/v1/orderbook?symbol=${encodeURIComponent(symbol)}`,
  );
  return json.result;
}

// 사용할 기본 계좌 seq. TOSS_ACCOUNT_SEQ 환경변수 우선, 없으면 첫 계좌.
export async function getDefaultAccountSeq(): Promise<number> {
  const accounts = await getAccounts();
  if (accounts.length === 0) throw new Error("토스증권 계좌가 없습니다.");
  const envSeq = Number(process.env.TOSS_ACCOUNT_SEQ);
  const picked =
    (Number.isFinite(envSeq) && accounts.find((a) => a.accountSeq === envSeq)) ||
    accounts[0];
  return picked.accountSeq;
}

// 매수 가능 금액(현금). currency별 조회. 반환: cashBuyingPower(숫자).
export async function getBuyingPower(
  accountSeq: number,
  currency: "KRW" | "USD",
): Promise<number> {
  const json = await tossFetch<{ result: { currency: string; cashBuyingPower: string } }>(
    `/api/v1/buying-power?currency=${currency}`,
    { accountSeq },
  );
  return Number(json.result.cashBuyingPower);
}

// 종목별 매도 가능 수량.
export async function getSellableQuantity(
  accountSeq: number,
  symbol: string,
): Promise<number> {
  const json = await tossFetch<{ result: { sellableQuantity: string } }>(
    `/api/v1/sellable-quantity?symbol=${encodeURIComponent(symbol)}`,
    { accountSeq },
  );
  return Number(json.result.sellableQuantity);
}

export type OrderSide = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";

export interface CreateOrderInput {
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: string; // 수량(문자열). 미국주식은 소수 가능
  price?: string; // LIMIT 시 필수
  timeInForce?: "DAY" | "CLS";
  confirmHighValueOrder?: boolean; // 1억원 이상 주문 확인
}

export interface CreateOrderResult {
  orderId: string;
  clientOrderId: string | null;
}

// 주문 생성(매수/매도). 실제 체결되는 동작. 에러 시 TossApiError throw.
export async function createOrder(
  accountSeq: number,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const body: Record<string, unknown> = {
    symbol: input.symbol,
    side: input.side,
    orderType: input.orderType,
    quantity: input.quantity,
    timeInForce: input.timeInForce ?? "DAY",
  };
  if (input.orderType === "LIMIT") body.price = input.price;
  if (input.confirmHighValueOrder) body.confirmHighValueOrder = true;

  const json = await tossFetch<{ result: CreateOrderResult }>("/api/v1/orders", {
    accountSeq,
    method: "POST",
    body,
  });
  return json.result;
}

// 주문 목록 조회(체결 확인용). status는 필수(OPEN=미체결/진행, CLOSED=완료/취소).
export interface TossOrder {
  orderId: string;
  symbol: string;
  side: OrderSide;
  status: string; // FILLED | PARTIAL_FILLED | CANCELED | REJECTED | ...
  filledQuantity: number; // 체결 수량(미체결이면 0)
  averageFilledPrice: number | null; // 평균 체결가
  filledAmount: number | null;
  commission: number | null;
  tax: number | null;
  filledAt: string | null; // 최종 체결 시각 (ISO, KST)
}

interface RawOrder {
  orderId: string;
  symbol: string;
  side: OrderSide;
  status: string;
  execution?: {
    filledQuantity?: string;
    averageFilledPrice?: string | null;
    filledAmount?: string | null;
    commission?: string | null;
    tax?: string | null;
    filledAt?: string | null;
  };
}

function num(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getOrders(
  accountSeq: number,
  opts: { status: "OPEN" | "CLOSED"; symbol?: string; from?: string; to?: string; limit?: number },
): Promise<TossOrder[]> {
  const qs = new URLSearchParams({ status: opts.status });
  if (opts.symbol) qs.set("symbol", opts.symbol);
  if (opts.from) qs.set("from", opts.from);
  if (opts.to) qs.set("to", opts.to);
  qs.set("limit", String(opts.limit ?? 100));
  const json = await tossFetch<{ result: { orders: RawOrder[] } }>(
    `/api/v1/orders?${qs.toString()}`,
    { accountSeq },
  );
  return (json.result.orders ?? []).map((o) => ({
    orderId: o.orderId,
    symbol: o.symbol,
    side: o.side,
    status: o.status,
    filledQuantity: num(o.execution?.filledQuantity) ?? 0,
    averageFilledPrice: num(o.execution?.averageFilledPrice),
    filledAmount: num(o.execution?.filledAmount),
    commission: num(o.execution?.commission),
    tax: num(o.execution?.tax),
    filledAt: o.execution?.filledAt ?? null,
  }));
}
