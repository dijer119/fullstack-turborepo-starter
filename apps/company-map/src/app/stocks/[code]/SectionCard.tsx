import type { SectionPayload } from "@/lib/dart/disclosure-payloads";

interface Props {
  reportNm: string;
  payload: SectionPayload | null;
  accent: string;
  linkClass: string;
}

const PROSE =
  "text-sm leading-6 break-words overflow-x-auto " +
  "[&_table]:w-full [&_table]:my-2 [&_table]:border-collapse " +
  "[&_td]:border [&_td]:border-white/20 [&_td]:p-1 [&_td]:align-top " +
  "[&_th]:border [&_th]:border-white/20 [&_th]:p-1 " +
  "[&_p]:my-2 [&_img]:hidden";

export function SectionCard({ reportNm, payload, accent, linkClass }: Props) {
  if (!payload) return null;
  const dartUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${payload.sourceRcpNo}`;
  return (
    <article className={`rounded-lg ${accent} p-5 text-gray-100 shadow`}>
      <h3 className="text-base font-bold">{reportNm}</h3>
      {payload.reportNm && (
        <p className="mt-1 text-xs text-gray-300">기준: {payload.reportNm}</p>
      )}
      <div className={`mt-3 ${PROSE}`} dangerouslySetInnerHTML={{ __html: payload.html }} />
      <a href={dartUrl} target="_blank" rel="noopener noreferrer" className={`mt-3 inline-block text-xs ${linkClass} hover:underline`}>
        DART 원본 ↗
      </a>
    </article>
  );
}
