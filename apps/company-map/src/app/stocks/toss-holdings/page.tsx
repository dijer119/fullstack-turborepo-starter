import { getTossHoldings } from "@/actions/toss-holdings";
import { listWatches } from "@/actions/stock-watches";
import { getMarketStatuses } from "@/actions/market";
import { TossTabs } from "./TossTabs";

export const metadata = { title: "토스증권 — Company Map" };
export const dynamic = "force-dynamic";

export default async function TossHoldingsPage() {
  const [holdings, watches, marketStatus] = await Promise.all([
    getTossHoldings(),
    listWatches(),
    getMarketStatuses(),
  ]);
  return (
    <TossTabs holdings={holdings} watches={watches} marketStatus={marketStatus} />
  );
}
