# 전종목 페이지 데이터 업데이트 드롭다운 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks` 페이지 헤더 우측에 "데이터 업데이트" 드롭다운을 추가해 4종(KRX 마스터·VIP 지분공시·영업이익·수출입) 갱신 스크립트를 백그라운드로 실행하고 진행 상태를 표시한다.

**Architecture:** 신규 `RefreshState` 1:1 모델 per kind. Server Action `triggerRefresh`가 `scripts/run-refresh-job.ts <kind>`를 `detached: true + unref()`로 spawn — Next dev 재시작에도 살아남음. Wrapper는 `spawnSync`로 매핑된 스크립트(들)를 직렬 실행 후 `RefreshState`에 done/failed 기록. UI는 드롭다운 열린 동안만 3초 간격으로 `listRefreshStates` 폴링.

**Tech Stack:** Next.js 16, Prisma 6 + SQLite, lucide-react, Tailwind 4, node:child_process (spawn/spawnSync).

**Spec:** `docs/superpowers/specs/2026-05-22-refresh-menu-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` | `RefreshState` 모델 추가 |
| `scripts/run-refresh-job.ts` | kind → 스크립트 매핑 + spawnSync 직렬 실행 + DB 상태 기록 |
| `src/actions/refresh-jobs.ts` | Server Actions: `triggerRefresh`, `listRefreshStates` + RefreshKind 타입 |
| `src/app/stocks/RefreshMenu.tsx` | 드롭다운 UI + 3s 폴링 |
| `src/app/stocks/page.tsx` | SSR `listRefreshStates` + `<RefreshMenu />` 헤더 mount |

---

## Task 1: Prisma `RefreshState` 모델 + 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma`
- Generated: `apps/company-map/prisma/migrations/<ts>_add_refresh_state/`

- [ ] **Step 1: 모델 추가**

`apps/company-map/prisma/schema.prisma` 끝에 추가:
```prisma
model RefreshState {
  kind        String   @id
  status      String
  startedAt   DateTime @map("started_at")
  finishedAt  DateTime? @map("finished_at")
  output      String?

  @@map("refresh_states")
}
```

`StockMaster`나 다른 모델 건드리지 말 것. RefreshState는 stock_master와 무관한 독립 테이블.

- [ ] **Step 2: 마이그레이션 적용**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx prisma migrate dev --name add_refresh_state
```
Expected: 새 마이그레이션 + Prisma Client 재생성.

- [ ] **Step 3: SQL 검증**

```bash
cat prisma/migrations/*add_refresh_state*/migration.sql
```
Expected: `CREATE TABLE "refresh_states"` 한 블록만. 다른 ALTER/DROP 없음.

```bash
sqlite3 data/company-map.db ".tables refresh_states"
sqlite3 data/company-map.db "SELECT COUNT(*) FROM vip_holdings;"
sqlite3 data/company-map.db "SELECT COUNT(*) FROM operating_income_history;"
```
Expected: `refresh_states` 존재; vip_holdings 41 (또는 직전 작업 결과 그대로); operating_income_history 12545.

- [ ] **Step 4: tsc + tests**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0; 77 tests pass.

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "$(cat <<'EOF'
feat(company-map): add RefreshState model for refresh-job tracking

Single row per kind ("krx_stocks"|"vip_holdings"|"operating_income"|"trade")
captures status (running|done|failed), startedAt, finishedAt, and last
stdout/stderr tail. No history retention.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wrapper 스크립트 `run-refresh-job.ts`

**Files:**
- Create: `apps/company-map/scripts/run-refresh-job.ts`

- [ ] **Step 1: 파일 작성**

`apps/company-map/scripts/run-refresh-job.ts`:

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

- [ ] **Step 2: tsc 확인**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx tsc --noEmit
```
Expected: EXIT=0.

- [ ] **Step 3: trade kind로 dry-run 검증 (3분 이내 완료)**

```bash
npx tsx scripts/run-refresh-job.ts trade
```
Expected: 정상 종료 (exit 0). 끝나면:
```bash
sqlite3 data/company-map.db "SELECT kind, status, datetime(started_at/1000, 'unixepoch'), datetime(finished_at/1000, 'unixepoch'), substr(output, -200) FROM refresh_states WHERE kind='trade';"
```
status='done', finishedAt 채워짐, output에 ingest-trade 마지막 로그.

- [ ] **Step 4: unknown kind 가드 검증**

```bash
npx tsx scripts/run-refresh-job.ts bogus
echo "exit=$?"
```
Expected: `unknown kind: bogus`, exit=2.

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/scripts/run-refresh-job.ts
git commit -m "$(cat <<'EOF'
feat(company-map): add run-refresh-job wrapper

Receives kind argv, marks RefreshState running, runs mapped script(s)
serially via spawnSync, then records done|failed plus a 2KB tail of
combined stdout/stderr.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Server Action `refresh-jobs.ts`

**Files:**
- Create: `apps/company-map/src/actions/refresh-jobs.ts`

- [ ] **Step 1: 파일 작성**

`apps/company-map/src/actions/refresh-jobs.ts`:

```ts
"use server";

import { spawn } from "node:child_process";
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
  startedAt: string | null;
  finishedAt: string | null;
  output: string | null;
}

export async function listRefreshStates(): Promise<RefreshStateView[]> {
  const rows = await db.refreshState.findMany();
  const map = new Map(rows.map((r) => [r.kind, r]));
  return Array.from(VALID_KINDS).map((kind) => {
    const r = map.get(kind);
    if (!r) {
      return {
        kind,
        status: "idle",
        startedAt: null,
        finishedAt: null,
        output: null,
      };
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

  const cwd = process.cwd();
  const child = spawn("npx", ["tsx", "scripts/run-refresh-job.ts", kind], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

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

- [ ] **Step 2: tsc + tests**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0; 77 tests pass.

- [ ] **Step 3: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/actions/refresh-jobs.ts
git commit -m "$(cat <<'EOF'
feat(company-map): add refresh-jobs Server Action

triggerRefresh spawns the wrapper detached + unref so Next dev restart
does not kill it; rejects when same kind is already running.
listRefreshStates returns one row per kind including "idle" for kinds
that have never run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `RefreshMenu` 클라이언트 컴포넌트

**Files:**
- Create: `apps/company-map/src/app/stocks/RefreshMenu.tsx`

- [ ] **Step 1: 파일 작성**

`apps/company-map/src/app/stocks/RefreshMenu.tsx`:

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
    let cancelled = false;
    const refetch = async () => {
      const next = await listRefreshStates();
      if (!cancelled) setStates(next);
    };
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
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
    const elapsed = s.startedAt
      ? Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000)
      : 0;
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

- [ ] **Step 2: tsc**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx tsc --noEmit
```
Expected: EXIT=0.

- [ ] **Step 3: 커밋 (Task 5와 함께 커밋해도 무방하지만 분리 권장)**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/app/stocks/RefreshMenu.tsx
git commit -m "$(cat <<'EOF'
feat(company-map): add RefreshMenu client component

Dropdown with 4 refresh rows: status icon, name, last-run/elapsed text,
and a Run button. Polls listRefreshStates every 3s only while open and
cleans up on close. Run button disables itself while a kind is running.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `page.tsx`에 `<RefreshMenu />` mount

**Files:**
- Modify: `apps/company-map/src/app/stocks/page.tsx`

- [ ] **Step 1: 현재 파일 확인**

`apps/company-map/src/app/stocks/page.tsx`의 헤더 영역은 다음과 같다 (아래 patch의 base):
```tsx
return (
  <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
    <header>
      <h1 className="text-2xl font-bold">전종목 조회</h1>
      <p className="mt-1 text-sm text-gray-500">
        KOSPI · KOSDAQ 전체 상장 종목. 필터·정렬로 탐색하세요.
      </p>
    </header>
    <StocksExplorerClient rows={rows} total={total} view={view} />
  </main>
);
```

- [ ] **Step 2: import + SSR fetch + header 갱신**

상단 import에 두 줄 추가:
```ts
import { listRefreshStates } from "@/actions/refresh-jobs";
import { RefreshMenu } from "./RefreshMenu";
```

`const { rows, total } = await getStocksExplorer(view);` 다음 줄에 추가:
```ts
const refreshStates = await listRefreshStates();
```

`<header>` 블록을 다음으로 교체:
```tsx
<header className="flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold">전종목 조회</h1>
    <p className="mt-1 text-sm text-gray-500">
      KOSPI · KOSDAQ 전체 상장 종목. 필터·정렬로 탐색하세요.
    </p>
  </div>
  <RefreshMenu initialStates={refreshStates} />
</header>
```

- [ ] **Step 3: tsc + lint + tests**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx tsc --noEmit
npx eslint src/app/stocks src/actions/refresh-jobs.ts
npx vitest run
```
Expected: tsc EXIT=0; 77 tests pass; eslint는 기존 `AppMenu.tsx` react-hooks 경고 1건만(무관). 새 에러 없음.

- [ ] **Step 4: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/app/stocks/page.tsx
git commit -m "$(cat <<'EOF'
feat(company-map): mount RefreshMenu in /stocks header right

SSR fetch listRefreshStates once for first-paint state; client component
takes over polling when opened.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 통합 검증

**Files:** 검증만 — 코드 변경 없음.

- [ ] **Step 1: dev 서버 재시작 (사용자 액션 필요)**

Prisma schema 변경 + Server Action 추가로 dev 서버 재시작 필수:
```
사용자 액션 필요:
1) 기존 npm run dev 중지 (Ctrl+C)
2) cd apps/company-map && npm run dev 재실행
3) ready 메시지 확인
```

- [ ] **Step 2: 페이지 로드 검증**

브라우저: `http://localhost:3004/stocks`
- HTTP 200 정상 로드
- 헤더 우측에 "데이터 업데이트 ▾" 버튼 노출
- 표가 기존대로 11컬럼 (안전마진까지 + VIP + YoY)

- [ ] **Step 3: 드롭다운 행 4개 노출**

버튼 클릭 → 4개 행 표시:
- KRX 종목 마스터 (idle 또는 직전 상태)
- VIP 지분공시
- 영업이익 시계열 (직전 작업으로 done 상태일 것)
- 수출입 동향 (Task 2의 dry-run 결과 done)

- [ ] **Step 4: 가벼운 kind 실행 (trade)**

수출입 동향 [실행] 클릭:
- 즉시 행이 "실행 중 (0초)" → 3초 간격으로 카운트 증가
- 1-3분 후 ✓ + "완료 · M/D HH:MM" 표시
- 드롭다운 닫고 다시 열어도 상태 유지

- [ ] **Step 5: 동시 실행 동일 kind 잠금**

같은 kind [실행] 두 번 빠르게 클릭:
- 두 번째 클릭은 disabled (button.disabled로 1차 방어)
- 디스에이블 풀린 후라도 server는 `reason: "이미 실행 중"` 반환 (running 가드)

- [ ] **Step 6: 폴링 중단 확인 (devtools network)**

드롭다운 열린 동안 `listRefreshStates` Server Action 호출이 3초 간격으로 보임.
드롭다운 닫으면 호출 멈춤 (cleanup 동작).

- [ ] **Step 7: 실패 경로 sanity (선택)**

`.env`에서 `DART_API_KEY`를 일시 잘못된 값으로 → VIP [실행]:
- 짧은 시간 내 ❌ + "실패 · M/D HH:MM" 표시
- 마우스 hover 시 title 또는 별도 UI 없이도 DB의 output 컬럼에 에러 tail 저장됨 (사용자가 sqlite로 확인 가능)
- 검증 후 `DART_API_KEY` 원복

- [ ] **Step 8: 회귀**

다음 페이지 모두 정상 로드:
- `/stocks` (필터 없이), `/stocks?vip=1`
- `/companies`, `/top-stocks`, `/ncav`, `/trade`, `/calculator`

전체 테스트:
```bash
cd apps/company-map
npx vitest run
```
Expected: 77 tests pass across 10 files.

검증만 — 별도 커밋 없음. plan 완료.

---

## Self-Review Notes

**Spec coverage:**
- RefreshState 모델 → Task 1 ✓
- Wrapper 스크립트 + spawnSync 직렬 실행 + DB 상태 기록 → Task 2 ✓
- Server Action `triggerRefresh` (detached spawn + unref) + `listRefreshStates` (idle 포함) → Task 3 ✓
- 같은 kind 중복 클릭 reject → Task 3 (`if (current?.status === "running")`) ✓
- 드롭다운 UI + 4 kind 행 + 3s 폴링 + cleanup → Task 4 ✓
- page.tsx SSR fetch + 헤더 mount → Task 5 ✓
- 통합 검증 (UI 동작, 동시 실행 잠금, 폴링 중단, 회귀) → Task 6 ✓

**Type consistency:**
- `RefreshKind = "krx_stocks"|"vip_holdings"|"operating_income"|"trade"` — Task 2 (Kind type), Task 3 (export type), Task 4 (import) 모두 동일
- `RefreshStateView { kind, status: "running"|"done"|"failed"|"idle", startedAt: string|null, finishedAt: string|null, output: string|null }` — Task 3 export, Task 4 import 일치
- SCRIPTS 매핑 (Task 2) ↔ LABELS (Task 4) 모두 4개 kind 일치
- `triggerRefresh(kind): { ok, reason? }` — Task 3 정의, Task 4 `onRun`에서 호출 (ok 무시하고 항상 refetch — 단순화로 OK)

**Placeholder scan:** 없음. 각 step에 코드/명령어/예상 출력 포함. `<ts>_add_refresh_state`는 Prisma 자동 생성 placeholder.
