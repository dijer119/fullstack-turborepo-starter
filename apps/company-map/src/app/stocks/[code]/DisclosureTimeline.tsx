import type { EarningsPayload } from "@/lib/dart/earnings-payload";
import type {
  OwnershipPayload,
  DividendPayload,
  TreasuryPayload,
  ContractPayload,
  SectionPayload,
} from "@/lib/dart/disclosure-payloads";
import { EarningsCard } from "./EarningsCard";
import { OwnershipCard } from "./OwnershipCard";
import { TreasuryCard } from "./TreasuryCard";
import { DividendCard } from "./DividendCard";
import { ContractCard } from "./ContractCard";
import { SectionCard } from "./SectionCard";

interface BaseItem {
  rcpNo: string;
  reportNm: string;
  rceptDt: Date;
}
export interface EarningsItem extends BaseItem {
  payload: EarningsPayload | null;
}
export interface OwnershipItem extends BaseItem {
  payload: OwnershipPayload | null;
}
export interface TreasuryItem extends BaseItem {
  payload: TreasuryPayload | null;
}
export interface ContractItem extends BaseItem {
  payload: ContractPayload | null;
}
export interface DividendItem extends BaseItem {
  payload: DividendPayload | null;
}
export interface SectionItem extends BaseItem {
  payload: SectionPayload | null;
}

interface Props {
  earnings: EarningsItem[];
  dividends: DividendItem[];
  ownership: OwnershipItem[];
  treasury: TreasuryItem[];
  contracts: ContractItem[];
  bizOverview: SectionItem[];
  sales: SectionItem[];
  orders: SectionItem[];
}

function Section({
  id,
  pinBg,
  label,
  empty,
  children,
}: {
  id: string;
  pinBg: string;
  label: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${pinBg}`}
        >
          📌
        </span>
        <h2 className="text-lg font-semibold">{label}</h2>
      </div>
      {empty ? (
        <p className="text-sm text-gray-500">공시 없음</p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

export function DisclosureTimeline({
  earnings,
  dividends,
  ownership,
  treasury,
  contracts,
  bizOverview,
  sales,
  orders,
}: Props) {
  return (
    <div className="space-y-8">
      <Section id="bizoverview" pinBg="bg-teal-500" label="사업개요" empty={bizOverview.length === 0}>
        {bizOverview.map((s) => (
          <SectionCard key={s.rcpNo} reportNm={s.reportNm} payload={s.payload} accent="bg-teal-900/80" linkClass="text-teal-200" />
        ))}
      </Section>
      <Section id="sales" pinBg="bg-lime-500" label="매출" empty={sales.length === 0}>
        {sales.map((s) => (
          <SectionCard key={s.rcpNo} reportNm={s.reportNm} payload={s.payload} accent="bg-lime-900/80" linkClass="text-lime-200" />
        ))}
      </Section>
      <Section id="orders" pinBg="bg-fuchsia-500" label="수주" empty={orders.length === 0}>
        {orders.map((s) => (
          <SectionCard key={s.rcpNo} reportNm={s.reportNm} payload={s.payload} accent="bg-fuchsia-900/80" linkClass="text-fuchsia-200" />
        ))}
      </Section>
      <Section id="earnings" pinBg="bg-indigo-500" label="실적" empty={earnings.length === 0}>
        {earnings.map((e) => (
          <EarningsCard
            key={e.rcpNo}
            reportNm={e.reportNm}
            rceptDt={e.rceptDt}
            payload={e.payload}
          />
        ))}
      </Section>
      <Section id="dividends" pinBg="bg-emerald-500" label="배당" empty={dividends.length === 0}>
        {dividends.map((d) => (
          <DividendCard
            key={d.rcpNo}
            reportNm={d.reportNm}
            rceptDt={d.rceptDt}
            payload={d.payload}
          />
        ))}
      </Section>
      <Section id="ownership" pinBg="bg-amber-500" label="지분" empty={ownership.length === 0}>
        {ownership.map((o) => (
          <OwnershipCard
            key={o.rcpNo}
            rcpNo={o.rcpNo}
            reportNm={o.reportNm}
            rceptDt={o.rceptDt}
            payload={o.payload}
          />
        ))}
      </Section>
      <Section id="treasury" pinBg="bg-violet-500" label="자사주" empty={treasury.length === 0}>
        {treasury.map((t) => (
          <TreasuryCard
            key={t.rcpNo}
            rcpNo={t.rcpNo}
            reportNm={t.reportNm}
            rceptDt={t.rceptDt}
            payload={t.payload}
          />
        ))}
      </Section>
      <Section id="contracts" pinBg="bg-cyan-500" label="계약" empty={contracts.length === 0}>
        {contracts.map((c) => (
          <ContractCard
            key={c.rcpNo}
            rcpNo={c.rcpNo}
            reportNm={c.reportNm}
            rceptDt={c.rceptDt}
            payload={c.payload}
          />
        ))}
      </Section>
    </div>
  );
}
