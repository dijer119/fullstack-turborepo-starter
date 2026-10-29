import type { Metadata } from "next";
import { getCoveredCallSnapshot } from "@/lib/etf/covered-call-snapshot";
import { CoveredCallExplorer } from "./CoveredCallExplorer";

export const metadata: Metadata = {
  title: "국내 상장 커버드콜 ETF — Company Map",
};

export default async function CoveredCallPage() {
  const snapshot = await getCoveredCallSnapshot();
  return <CoveredCallExplorer etfs={snapshot.etfs} updatedAt={snapshot.updatedAt} />;
}
