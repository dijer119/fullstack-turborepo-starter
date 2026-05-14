export type CategoryKey =
  | "semiconductor"
  | "cosmetics"
  | "power-equipment"
  | "transformer"
  | "defense"
  | "shipbuilding"
  | "ess"
  | "battery"
  | "nuclear"
  | "solar"
  | "automotive";

export type SubCategory = {
  /** HS code prefix — matched via `hsCode.startsWith(hsPrefix)`. */
  hsPrefix: string;
  label: string;
};

export type CategoryDef = {
  key: CategoryKey;
  label: string;
  /** 관세청 OpenAPI `hsSgn` 파라미터로 호출할 HS 코드 prefix 목록.
   *  여러 개면 호출 결과를 한 카테고리로 합산. */
  hsSgnList: string[];
  /** UI 표·차트의 sub-column 정의 (큰 비중 순). */
  subCategories: SubCategory[];
};

export const CATEGORIES: CategoryDef[] = [
  {
    key: "semiconductor",
    label: "반도체",
    hsSgnList: ["8542"],
    subCategories: [
      { hsPrefix: "854232", label: "메모리" },
      { hsPrefix: "854231", label: "프로세서" },
      { hsPrefix: "854239", label: "기타 IC" },
      { hsPrefix: "854290", label: "부분품" },
      { hsPrefix: "854233", label: "증폭기" },
    ],
  },
  {
    key: "cosmetics",
    label: "화장품",
    hsSgnList: ["33"],
    subCategories: [
      { hsPrefix: "3304", label: "기초·메이크업" },
      { hsPrefix: "3303", label: "향수" },
      { hsPrefix: "3305", label: "헤어" },
      { hsPrefix: "3307", label: "면도·욕용·탈취" },
      { hsPrefix: "3306", label: "구강위생" },
      { hsPrefix: "3302", label: "방향성 혼합물" },
      { hsPrefix: "3301", label: "정유" },
    ],
  },
  {
    key: "power-equipment",
    label: "전력기기",
    // 변압기(8504) + 1kV 개폐기(8535/8536) + 배전반(8537) + 절연전선·케이블(8544).
    hsSgnList: ["8504", "8535", "8536", "8537", "8544"],
    subCategories: [
      { hsPrefix: "8504", label: "변압기·정지형변환기" },
      { hsPrefix: "8544", label: "절연케이블" },
      { hsPrefix: "8537", label: "배전반·제어반" },
      { hsPrefix: "8536", label: "저압개폐기" },
      { hsPrefix: "8535", label: "고압개폐기" },
    ],
  },
  {
    key: "transformer",
    label: "변압기",
    hsSgnList: ["8504"],
    subCategories: [
      { hsPrefix: "85042", label: "액체유전체 변압기" },
      { hsPrefix: "85043", label: "건식 변압기" },
      { hsPrefix: "850440", label: "정지형 변환기" },
      { hsPrefix: "850450", label: "인덕터" },
      { hsPrefix: "850490", label: "부분품" },
    ],
  },
  {
    key: "defense",
    label: "방위산업",
    // HS 9301 = 군용 무기(자동·반자동 화기·박격포·곡사포·미사일/로켓 발사기 등).
    // K9 자주포는 930120(곡사포), 천무 다연장 로켓은 930120(로켓 발사기)에 분류.
    hsSgnList: ["9301"],
    subCategories: [
      { hsPrefix: "930120", label: "자주포·로켓발사기" },
      { hsPrefix: "930110", label: "군용 화기" },
      { hsPrefix: "930190", label: "기타 무기" },
    ],
  },
  {
    key: "shipbuilding",
    label: "조선",
    hsSgnList: ["89"],
    subCategories: [
      { hsPrefix: "8901", label: "여객·화물선" },
      { hsPrefix: "8906", label: "함정·기타 군용선" },
      { hsPrefix: "8905", label: "시추선·플랫폼" },
      { hsPrefix: "8902", label: "어선" },
      { hsPrefix: "8907", label: "부유구조물" },
      { hsPrefix: "8903", label: "요트·레저" },
      { hsPrefix: "8904", label: "예인선·푸쉬선" },
      { hsPrefix: "8908", label: "폐선" },
    ],
  },
  {
    key: "battery",
    label: "이차전지",
    // HS 8507 = 모든 종류의 축전지 (리튬이온·납축·니켈수소 등).
    hsSgnList: ["8507"],
    subCategories: [
      { hsPrefix: "850760", label: "리튬이온" },
      { hsPrefix: "850710", label: "납축전지(자동차)" },
      { hsPrefix: "850720", label: "납축전지(기타)" },
      { hsPrefix: "850750", label: "니켈수소" },
      { hsPrefix: "850730", label: "니켈카드뮴" },
      { hsPrefix: "850780", label: "기타 축전지" },
      { hsPrefix: "850790", label: "부분품" },
    ],
  },
  {
    key: "ess",
    label: "ESS",
    // Energy Storage System = 리튬이온 축전지(850760) + 전력변환장치 PCS(850440).
    hsSgnList: ["850760", "850440"],
    subCategories: [
      { hsPrefix: "850760", label: "리튬이온 배터리" },
      { hsPrefix: "850440", label: "정지형 변환기(PCS)" },
    ],
  },
  {
    key: "nuclear",
    label: "원자력",
    // HS 8401 = 원자로 / 동위원소 분리 / 미조사 핵연료 / 부분품.
    hsSgnList: ["8401"],
    subCategories: [
      { hsPrefix: "840110", label: "원자로" },
      { hsPrefix: "840130", label: "핵연료" },
      { hsPrefix: "840140", label: "부분품" },
      { hsPrefix: "840120", label: "동위원소 분리" },
    ],
  },
  {
    key: "solar",
    label: "태양광",
    // HS 8541.42(셀) + 8541.43(모듈) — 광전지에 한정 (LED·다이오드 등 제외).
    hsSgnList: ["854142", "854143"],
    subCategories: [
      { hsPrefix: "854143", label: "광전지 모듈" },
      { hsPrefix: "854142", label: "광전지 셀" },
    ],
  },
  {
    key: "automotive",
    label: "자동차",
    // 8703 승용차(SUV·세단·해치백) + 8708 부품 + 8704 트럭 + 8702 버스.
    // 트랙터(8701)·모터사이클(8711)·자전거(8712) 등은 별개 산업이라 제외.
    hsSgnList: ["8703", "8708", "8704", "8702"],
    subCategories: [
      { hsPrefix: "8703", label: "승용차" },
      { hsPrefix: "8708", label: "자동차 부품" },
      { hsPrefix: "8704", label: "화물자동차" },
      { hsPrefix: "8702", label: "버스·승합차" },
    ],
  },
];

export function getCategory(key: string): CategoryDef {
  const def = CATEGORIES.find((c) => c.key === key);
  if (!def) throw new Error(`Unknown trade category: ${key}`);
  return def;
}
