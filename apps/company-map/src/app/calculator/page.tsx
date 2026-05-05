import { QuoteBanner } from "@/components/stocks/QuoteBanner";
import { CalculatorClient } from "./CalculatorClient";

export const metadata = { title: "내재가치 계산기 — Company Map" };

export default function CalculatorPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">내재가치 계산기</h1>
        <p className="mt-1 text-sm text-gray-500">
          벤자민 그레이엄의 가치투자 공식 — 가중 EPS + BPS 기반.
        </p>
      </header>
      <QuoteBanner />
      <CalculatorClient />
    </main>
  );
}
