import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { fetchDisclosuresForStock } from "@/actions/disclosures";
import type { EarningsPayload } from "@/lib/dart/earnings-payload";
import type {
  OwnershipPayload,
  DividendPayload,
  ContractPayload,
} from "@/lib/dart/disclosure-payloads";
import { StockDetailHeader } from "./StockDetailHeader";
import { DisclosureTimeline } from "./DisclosureTimeline";
import { SectionNav } from "./SectionNav";
import { RelatedLinksCard } from "./RelatedLinksCard";
import { listLinksByCode } from "@/actions/stock-links";

export const dynamic = "force-dynamic";

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) notFound();

  const master = await db.stockMaster.findUnique({
    where: { code },
    include: { analysis: true, priceChange: true, override: true },
  });
  if (!master) notFound();

  let allDisclosures = await db.disclosure.findMany({
    where: { code },
    orderBy: { rceptDt: "desc" },
  });

  if (allDisclosures.length === 0 && master.corpCode) {
    await fetchDisclosuresForStock(code);
    allDisclosures = await db.disclosure.findMany({
      where: { code },
      orderBy: { rceptDt: "desc" },
    });
  }

  const earnings = allDisclosures
    .filter((d) => d.category === "실적")
    .map((d) => ({
      rcpNo: d.rcpNo,
      reportNm: d.reportNm,
      rceptDt: d.rceptDt,
      payload: d.payload ? (JSON.parse(d.payload) as EarningsPayload) : null,
    }));

  const dividends = allDisclosures
    .filter((d) => d.category === "배당")
    .map((d) => ({
      rcpNo: d.rcpNo,
      reportNm: d.reportNm,
      rceptDt: d.rceptDt,
      payload: d.payload ? (JSON.parse(d.payload) as DividendPayload) : null,
    }));

  const ownership = allDisclosures
    .filter((d) => d.category === "지분")
    .map((d) => ({
      rcpNo: d.rcpNo,
      reportNm: d.reportNm,
      rceptDt: d.rceptDt,
      payload: d.payload ? (JSON.parse(d.payload) as OwnershipPayload) : null,
    }));

  const contracts = allDisclosures
    .filter((d) => d.category === "계약")
    .map((d) => ({
      rcpNo: d.rcpNo,
      reportNm: d.reportNm,
      rceptDt: d.rceptDt,
      payload: d.payload ? (JSON.parse(d.payload) as ContractPayload) : null,
    }));

  const links = await listLinksByCode(code);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href="/stocks"
        className="text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        ← 전종목 조회
      </Link>
      <div className="mt-6 flex gap-6">
        <div className="min-w-0 flex-1 space-y-6">
          <StockDetailHeader
            code={master.code}
            name={master.name}
            market={master.market}
            currentPrice={
              master.priceChange?.currentPrice ?? master.analysis?.currentPrice ?? null
            }
            marcap={
              master.priceChange?.marcap != null
                ? Number(master.priceChange.marcap)
                : master.marcap != null
                  ? Number(master.marcap)
                  : null
            }
            per={master.analysis?.per ?? null}
            pbr={master.analysis?.pbr ?? null}
            manualRoe={master.override?.manualRoe ?? null}
          />
          <DisclosureTimeline
            earnings={earnings}
            dividends={dividends}
            ownership={ownership}
            contracts={contracts}
          />
          <RelatedLinksCard code={master.code} initialLinks={links} />
        </div>
        <SectionNav />
      </div>
    </main>
  );
}
