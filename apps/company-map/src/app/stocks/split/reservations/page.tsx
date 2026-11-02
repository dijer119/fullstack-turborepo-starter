import { listSplitReservations } from "@/actions/split-reservations";
import { SplitNavigation } from "../SplitNavigation";
import { ReservationDashboard } from "./ReservationDashboard";

export const dynamic = "force-dynamic";
export default async function ReservationsPage() {
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <header><h1 className="text-2xl font-bold">예약 매수</h1><p className="mt-2 text-sm text-muted">가격 조건을 기다렸다가 1차 매수 후 차수별 분할매매로 이어갑니다.</p></header>
    <SplitNavigation />
    <ReservationDashboard data={await listSplitReservations()} />
  </div>;
}
