export type DetailTab = "progress" | "ledger" | "trades" | "settings";
const tabs = [["progress", "진행 현황"], ["ledger", "차수별 장부"], ["trades", "최근 거래"], ["settings", "설정"]] as const;

export function DetailTabs({ id, value, onChange }: { id: string; value: DetailTab; onChange: (value: DetailTab) => void }) {
  return <div role="tablist" aria-label="종목 상세 보기" className="mt-4 flex flex-wrap gap-2 border-b border-line pb-3 ">
    {tabs.map(([key, label], index) => <button key={key} type="button" role="tab" id={`${id}-${key}-tab`} aria-controls={`${id}-${key}-panel`} aria-selected={value === key} tabIndex={value === key ? 0 : -1}
      onClick={() => onChange(key)}
      onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        onChange(tabs[next][0]);
        (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
      }}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${value === key ? "bg-accent text-on-accent" : "bg-surface-inset text-muted hover:bg-line  "}`}>{label}</button>)}
  </div>;
}
