import { XMLParser } from "fast-xml-parser";

const ENDPOINT = "https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList";

export type RawTradeItem = {
  year: string;
  hsCd: string;
  statCd: string;
  statCdCntnKor1: string;
  statKor: string;
  expDlr: string | number;
  impDlr: string | number;
  expWgt: string | number;
  impWgt: string | number;
  balPayments: string | number;
};

type RawResponse = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: RawTradeItem | RawTradeItem[] } | string };
  };
};

function getServiceKey(): string {
  const key = process.env.DATA_GO_KR_KEY_ENC;
  if (!key) {
    throw new Error("DATA_GO_KR_KEY_ENC is not set in environment");
  }
  return key;
}

export type FetchTradeParams = {
  /** "YYYYMM" e.g. "202504" */
  startYm: string;
  /** "YYYYMM" — same value as startYm for single-month query */
  endYm: string;
  /** HS code prefix. e.g. "8542" for integrated circuits */
  hsSgn: string;
};

/**
 * data.go.kr는 인코딩된 키를 URL에 그대로 붙여야 하기 때문에
 * URLSearchParams로 추가하면 이중 인코딩이 발생함. 그래서 수동 조립.
 */
export async function fetchTradeRaw(params: FetchTradeParams): Promise<RawTradeItem[]> {
  const serviceKey = getServiceKey();
  const url =
    `${ENDPOINT}?serviceKey=${serviceKey}` +
    `&strtYymm=${params.startYm}` +
    `&endYymm=${params.endYm}` +
    `&hsSgn=${params.hsSgn}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Customs API HTTP ${res.status}: ${await res.text()}`);
  }
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
  const parsed = parser.parse(xml) as RawResponse;

  const code = parsed.response?.header?.resultCode;
  if (code !== "00") {
    throw new Error(
      `Customs API result: ${code} ${parsed.response?.header?.resultMsg ?? ""}`,
    );
  }

  const items = parsed.response?.body?.items;
  if (!items || typeof items !== "object") return [];
  const raw = items.item;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}
