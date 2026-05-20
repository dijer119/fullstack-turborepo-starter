import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

let cachedMap: Map<string, string> | null = null;

/**
 * 종목코드 → corp_code 매핑을 DART에서 1회 다운로드해 메모리에 캐싱.
 * 워커 1회 실행당 1번만 호출.
 */
export async function loadCorpCodeMap(): Promise<Map<string, string>> {
  if (cachedMap) return cachedMap;
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY not set");

  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`DART corpCode fetch failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());

  const zip = new AdmZip(buffer);
  const entry = zip.getEntries()[0];
  const xml = entry.getData().toString("utf-8");

  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const parsed = parser.parse(xml);
  const list: Array<{ stock_code?: string; corp_code?: string }> =
    parsed?.result?.list ?? [];

  const map = new Map<string, string>();
  for (const item of list) {
    const stock = (item.stock_code ?? "").trim();
    const corp = (item.corp_code ?? "").trim();
    if (stock && corp) map.set(stock, corp);
  }
  cachedMap = map;
  console.log(`[dart] corp_code map loaded: ${map.size} listed companies`);
  return map;
}

/** Generic map inversion. Pure function — testable in isolation. */
export function invertMap(forward: Map<string, string>): Map<string, string> {
  const reverse = new Map<string, string>();
  for (const [k, v] of forward) reverse.set(v, k);
  return reverse;
}

let cachedReverseMap: Map<string, string> | null = null;

/** corp_code → stock_code 매핑. loadCorpCodeMap() 결과를 invert + 캐싱. */
export async function loadCorpCodeReverseMap(): Promise<Map<string, string>> {
  if (cachedReverseMap) return cachedReverseMap;
  cachedReverseMap = invertMap(await loadCorpCodeMap());
  return cachedReverseMap;
}
