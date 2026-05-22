# 전종목 페이지 데이터 업데이트 드롭다운

## Context

`/stocks` 페이지는 4종의 데이터 소스에 의존한다: KRX 종목 마스터, VIP 자산운용 지분공시, 영업이익 시계열, 수출입 동향. 현재는 사용자가 갱신하려면 각 갱신 스크립트(`scripts/regenerate-krx-stocks.ts`, `refresh-vip-holdings.ts`, `refresh-operating-income.ts`, `ingest-trade.ts`)를 터미널에서 직접 실행해야 한다. 분기 보고가 새로 올라오거나 VIP 신규 5% 보고가 떴을 때 즉시 갱신할 방법이 화면 안에 없다.

해결: `/stocks` 페이지 헤더 우측에 "데이터 업데이트" 드롭다운을 추가한다. 각 항목은 마지막 실행 시각·상태와 함께 [실행] 버튼을 노출. 클릭 시 Server Action이 wrapper 스크립트를 detached child process로 spawn하고, wrapper가 `RefreshState` 테이블에 진행 상태를 기록한다. 드롭다운이 열려 있는 동안만 UI가 3초 간격으로 폴링해 진행률을 보여준다.

전제:
- 4종 갱신 스크립트는 이미 존재하고 안정적으로 동작 (직전 작업에서 모두 검증됨).
- DART_API_KEY 등 환경변수는 `.env`/`.env.local`에 설정되어 있고 각 스크립트가 dotenv로 로드.
- Next dev 서버에서 spawn한 child는 `detached: true` + `unref()`로 dev 재시작에도 살아남음. tsx도 동일하게 동작.

비고: 동시 실행은 같은 kind만 잠그고 다른 kind는 병렬 허용. 4종을 동시에 돌려도 DART rate limit (분당 1,000회) 안에서 동작 (영업이익 ~600/min, VIP ~500/min, 합쳐도 한계 밑).

## 사용자 결정사항 요약
- 트리거: **서버 백그라운드 spawn + 폴링 기반 진행 표시**
- 노출 작업: **4종 모두** (KRX 마스터, VIP, 영업이익, 수출입)
- 위치: **`/stocks` 헤더 우측 드롭다운**
- 이력: **마지막 1건만** (per-kind, YAGNI)

## 변경 파일 목록

| 영역 | 파일 | 상태 |
|---|---|---|
| Prisma | `apps/company-map/prisma/schema.prisma` | 수정 — `RefreshState` 모델 추가 |
| Migration | `apps/company-map/prisma/migrations/<ts>_add_refresh_state/` | 신규 |
| Wrapper | `apps/company-map/scripts/run-refresh-job.ts` | 신규 |
| Server Action | `apps/company-map/src/actions/refresh-jobs.ts` | 신규 (`triggerRefresh`, `listRefreshStates`) |
| 클라이언트 | `apps/company-map/src/app/stocks/RefreshMenu.tsx` | 신규 (드롭다운 UI + 폴링) |
| 페이지 | `apps/company-map/src/app/stocks/page.tsx` | header에 `<RefreshMenu />` 추가 |

## 단계별 설계

### 1. Prisma 모델

`schema.prisma` 끝에 추가:
```prisma
model RefreshState {
  kind        String   @id
  status      String                          // "running" | "done" | "failed"
  startedAt   DateTime @map("started_at")
  finishedAt  DateTime? @map("finished_at")
  output      String?                          // 마지막 stdout/stderr tail (~2000자)
  @@map("refresh_states")
}
```

마이그레이션: `npx prisma migrate dev --name add_refresh_state`. 새 테이블만, 기존 데이터 무관.

`kind` 허용 값 (코드 enum):
```ts
export type RefreshKind = "krx_stocks" | "vip_holdings" | "operating_income" | "trade";
```

### 2. Wrapper 스크립트: `scripts/run-refresh-job.ts`

```ts
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { spawnSync } from "node:child_process";
import { db } from "../worker/db";

type Kind = "krx_stocks" | "vip_holdings" | "operating_income" | "trade";

const SCRIPTS: Record<Kind, string[]> = {
  krx_stocks: ["scripts/regenerate-krx-stocks.ts", "scripts/smoke-load-krx.ts"],
  vip_holdings: ["scripts/refresh-vip-holdings.ts"],
  operating_income: ["scripts/refresh-operating-income.ts"],
  trade: ["scripts/ingest-trade.ts"],
};

(async () => {
  const kind = process.argv[2] as Kind;
  if (!SCRIPTS[kind]) {
    console.error(`unknown kind: ${kind}`);
    process.exit(2);
  }
  const startedAt = new Date();
  await db.refreshState.upsert({
    where: { kind },
    create: { kind, status: "running", startedAt },
    update: { status: "running", startedAt, finishedAt: null, output: null },
  });

  let output = "";
  let ok = true;
  for (const script of SCRIPTS[kind]) {
    const proc = spawnSync("npx", ["tsx", script], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 8,
    });
    const tail = (proc.stdout || "") + (proc.stderr || "");
    output += `--- ${script} (exit ${proc.status}) ---\n${tail.slice(-1500)}\n`;
    if (proc.status !== 0) {
      ok = false;
      break;
    }
  }

  await db.refreshState.update({
    where: { kind },
    data: {
      status: ok ? "done" : "failed",
      finishedAt: new Date(),
      output: output.slice(-2000),
    },
  });
  process.exit(ok ? 0 : 1);
})();
```

핵심: `spawnSync`로 직렬 실행 (krx_stocks는 2단계). 실패 시 즉시 중단 + 상태 'failed'. stdout/stderr는 합쳐서 마지막 2000자만 저장.

### 3. Server Action: `src/actions/refresh-jobs.ts`

```ts
"use server";

import { spawn } from "node:child_process";
import path from "node:path";
import { db } from "@/lib/db";

export type RefreshKind = "krx_stocks" | "vip_holdings" | "operating_income" | "trade";

const VALID_KINDS = new Set<RefreshKind>([
  "krx_stocks",
  "vip_holdings",
  "operating_income",
  "trade",
]);

export interface RefreshStateView {
  kind: RefreshKind;
  status: "running" | "done" | "failed" | "idle";
  startedAt: string | null;        // ISO
  finishedAt: string | null;       // ISO
  output: string | null;
}

export async function listRefreshStates(): Promise<RefreshStateView[]> {
  const rows = await db.refreshState.findMany();
  const map = new Map(rows.map((r) => [r.kind, r]));
  return Array.from(VALID_KINDS).map((kind) => {
    const r = map.get(kind);
    if (!r) {
      return { kind, status: "idle", startedAt: null, finishedAt: null, output: null };
    }
    return {
      kind,
      status: r.status as "running" | "done" | "failed",
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      output: r.output,
    };
  });
}

export async function triggerRefresh(
  kind: RefreshKind,
): Promise<{ ok: boolean; reason?: string }> {
  if (!VALID_KINDS.has(kind)) return { ok: false, reason: "unknown kind" };

  const current = await db.refreshState.findUnique({ where: { kind } });
  if (current?.status === "running") {
    return { ok: false, reason: "이미 실행 중" };
  }

  // app cwd는 apps/company-map (Next 실행 위치). wrapper도 cwd 안에서 detached로 spawn.
  const cwd = process.cwd();
  const child = spawn("npx", ["tsx", "scripts/run-refresh-job.ts", kind], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  // race 방지를 위해 즉시 running 마킹. wrapper가 시작 시 또 마킹하지만 idempotent.
  await db.refreshState.upsert({
    where: { kind },
    create: { kind, status: "running", startedAt: new Date() },
    update: {
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      output: null,
    },
  });
  return { ok: true };
}
```

### 4. 클라이언트: `src/app/stocks/RefreshMenu.tsx`

`"use client"`. 초기 mount 시 `listRefreshStates`로 fetch + 드롭다운이 **열려 있는 동안만** `setInterval(3000)` 폴링.

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, RefreshCw, Check, X, Clock } from "lucide-react";
import {
  listRefreshStates,
  triggerRefresh,
  type RefreshKind,
  type RefreshStateView,
} from "@/actions/refresh-jobs";

const LABELS: Record<RefreshKind, { name: string; estimate: string }> = {
  krx_stocks: { name: "KRX 종목 마스터", estimate: "~2분" },
  vip_holdings: { name: "VIP 지분공시", estimate: "~6분" },
  operating_income: { name: "영업이익 시계열", estimate: "~60분" },
  trade: { name: "수출입 동향", estimate: "~3분" },
};

const POLL_MS = 3000;

export function RefreshMenu({ initialStates }: { initialStates: RefreshStateView[] }) {
  const [open, setOpen] = useState(false);
  const [states, setStates] = useState(initialStates);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const refetch = async () => {
      const next = await listRefreshStates();
      setStates(next);
    };
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => clearInterval(id);
  }, [open]);

  const onRun = (kind: RefreshKind) => {
    startTransition(async () => {
      await triggerRefresh(kind);
      const next = await listRefreshStates();
      setStates(next);
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        <RefreshCw size={14} />
        데이터 업데이트
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-96 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {states.map((s) => (
              <RefreshRow key={s.kind} s={s} onRun={onRun} pending={pending} />
            ))}
          </ul>
          <div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-800">
            ⓘ 백그라운드로 진행되며 닫아도 됩니다
          </div>
        </div>
      )}
    </div>
  );
}

function RefreshRow({
  s,
  onRun,
  pending,
}: {
  s: RefreshStateView;
  onRun: (k: RefreshKind) => void;
  pending: boolean;
}) {
  const label = LABELS[s.kind];
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <StatusIcon status={s.status} />
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label.name}</div>
        <div className="text-xs text-gray-500">
          {statusDescription(s)} · {label.estimate}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRun(s.kind)}
        disabled={pending || s.status === "running"}
        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        {s.status === "running" ? "실행 중…" : "실행"}
      </button>
    </li>
  );
}

function StatusIcon({ status }: { status: RefreshStateView["status"] }) {
  if (status === "running") return <Clock size={16} className="text-blue-600 animate-pulse" />;
  if (status === "done") return <Check size={16} className="text-green-600" />;
  if (status === "failed") return <X size={16} className="text-red-600" />;
  return <span className="inline-block w-4 text-gray-400">—</span>;
}

function statusDescription(s: RefreshStateView): string {
  if (s.status === "idle") return "미실행";
  if (s.status === "running") {
    const elapsed = s.startedAt ? Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0;
    return `실행 중 (${formatElapsed(elapsed)})`;
  }
  const at = s.finishedAt ?? s.startedAt;
  if (!at) return s.status;
  return s.status === "done"
    ? `완료 · ${formatShort(at)}`
    : `실패 · ${formatShort(at)}`;
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}초`;
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1);
  const dd = String(d.getDate());
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}/${dd} ${hh}:${mm}`;
}
```

### 5. `page.tsx` 통합

```tsx
import { listRefreshStates } from "@/actions/refresh-jobs";
import { RefreshMenu } from "./RefreshMenu";

// ... StocksPage 안에서
const refreshStates = await listRefreshStates();

return (
  <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">전종목 조회</h1>
        <p className="mt-1 text-sm text-gray-500">
          KOSPI · KOSDAQ 전체 상장 종목. 필터·정렬로 탐색하세요.
        </p>
      </div>
      <RefreshMenu initialStates={refreshStates} />
    </header>
    <StocksExplorerClient rows={rows} total={total} view={view} />
  </main>
);
```

SSR에서 1회 fetch해서 첫 렌더에 last-run 정보 즉시 보임 (드롭다운 닫혀 있어도 버튼 hover 시 "마지막 실행: ..." 보여줄 수 있는 데이터 확보).

## Verification

### 1. 마이그레이션
```bash
cd apps/company-map
npx prisma migrate dev --name add_refresh_state
sqlite3 data/company-map.db "SELECT name FROM sqlite_master WHERE type='table' AND name='refresh_states';"
```

### 2. 단일 wrapper dry-run
```bash
cd apps/company-map
npx tsx scripts/run-refresh-job.ts trade
# 1-3분 대기
sqlite3 data/company-map.db "SELECT * FROM refresh_states WHERE kind='trade';"
```
status='done', output에 ingest-trade.ts 로그 마지막 줄.

### 3. UI 동작 (dev 재시작 후)
- `/stocks` 헤더 우측에 "데이터 업데이트 ▾" 버튼 노출
- 클릭 시 드롭다운 4개 행: idle/done/failed 상태 + [실행]
- 짧은 작업(KRX, trade) [실행] 클릭 → 즉시 "실행 중" + 폴링으로 시간 카운트 → 완료 시 ✓
- 드롭다운 닫고 다시 열어도 상태 그대로 (DB 저장)
- 같은 kind 더블 클릭 → 두 번째는 reject (Server Action `reason: "이미 실행 중"`, UI는 button disabled로 1차 방어)

### 4. 회귀
- `/stocks` 기본 동작 (필터·정렬·페이지네이션) 정상
- 다른 페이지 (`/companies`, `/top-stocks`, ...) 영향 없음
- RefreshState relation은 StockMaster와 무관 — 기존 Prisma 쿼리에 영향 없음
