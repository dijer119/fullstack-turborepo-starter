# Company Map — SQLite Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/company-map`의 DB layer를 Supabase(Postgres)에서 Prisma + SQLite로 전환한다. 100% 로컬 도구 (외부 의존성 0). UI / 그래프 / CSV import 등 비-DB 코드는 그대로 유지.

**Architecture:** Prisma client singleton을 server-only `lib/db.ts`에서 export. 4개 server actions(`industries`, `companies`, `mappings`, `import`)를 Prisma API로 재작성. SQLite 파일은 `apps/company-map/data/company-map.db`. UI/types/components는 인터페이스 호환되도록 그대로 둠 (시그니처 유지).

**Tech Stack:** Next.js 16 + React 19 + TypeScript 5 + Tailwind v4 (그대로). 신규: `prisma`, `@prisma/client`. 제거: `@supabase/ssr`, `@supabase/supabase-js`.

**Spec:** [docs/superpowers/specs/2026-04-29-company-map-design.md](../specs/2026-04-29-company-map-design.md) (v2 — Prisma + SQLite)

**Note on testing:** spec §8 따라 자동화 테스트 없음. lint + build + 수동 검증만.

**Important constraints:**
- **Worktree**: `/Users/dijer/dev/workspace/fullstack-turborepo-starter-company-map-sqlite`, branch `feat/company-map-sqlite`. 모든 작업 worktree에서. master 절대 직접 commit 금지.
- **`apps/api`도 Prisma를 사용 중** — 같은 monorepo이므로 prisma 버전 align 권장.
- **`@prisma/client`는 server-only**. client component에서 import 절대 금지.

---

## File Structure (변경 영향)

```
apps/company-map/
├── package.json                              # T1: deps swap
├── .env.example                              # T2: DATABASE_URL
├── .env.local                                # 사용자가 수정 (untracked)
├── .gitignore                                # T2: data/ 추가
├── prisma/
│   └── schema.prisma                         # T2: 신규 (spec §2.1)
├── data/                                     # T3: prisma migrate dev로 자동 생성
│   └── company-map.db                        # gitignored
├── supabase/                                 # T8: 디렉토리 전체 제거
├── src/
│   ├── lib/
│   │   ├── db.ts                             # T2: 신규 (Prisma singleton)
│   │   └── supabase/                         # T8: 디렉토리 제거
│   ├── actions/
│   │   ├── industries.ts                     # T4: 재작성
│   │   ├── companies.ts                      # T5: 재작성
│   │   ├── mappings.ts                       # T6: 재작성
│   │   └── import.ts                         # T7: 재작성
│   └── types/
│       └── (그대로 유지 — string 형태 ISO timestamp)
└── README.md                                 # T8: setup 갱신
```

**그대로 유지 (변경 0)**: `src/components/**` (graph, tree, search, layout), `src/app/**` (모든 페이지), `src/lib/csv/parser.ts`, `src/lib/graph/layout.ts`, `src/types/**`.

---

## Phase A — 환경

### Task 1: 의존성 교체

**Files:** Modify `apps/company-map/package.json`, `yarn.lock`

- [ ] **Step 1**: Supabase 제거

```bash
yarn workspace company-map remove @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 2**: Prisma 추가

```bash
yarn workspace company-map add @prisma/client
yarn workspace company-map add -D prisma
```

`apps/api`의 prisma 버전과 align 권장. 차이 있으면 root에서 `yarn install`로 정리.

- [ ] **Step 3**: 빌드는 아직 깨진 상태 (Supabase import 실패) — 다음 task에서 정상화. lint 도 마찬가지. 본 task는 deps만 변경.

- [ ] **Step 4**: 커밋

```bash
git add apps/company-map/package.json yarn.lock
git commit -m "deps(company-map): swap Supabase for Prisma + SQLite"
```

### Task 2: Prisma schema + db.ts singleton + .env

**Files:**
- Create `apps/company-map/prisma/schema.prisma`
- Create `apps/company-map/src/lib/db.ts`
- Modify `apps/company-map/.env.example`
- Modify `apps/company-map/.gitignore`

- [ ] **Step 1**: `apps/company-map/prisma/schema.prisma`

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Industry {
  id          String   @id @default(uuid())
  name        String
  parentId    String?  @map("parent_id")
  parent      Industry?  @relation("IndustryTree", fields: [parentId], references: [id], onDelete: Cascade)
  children    Industry[] @relation("IndustryTree")
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt       @map("updated_at")
  companyMappings CompanyIndustry[]

  @@index([parentId])
  @@index([name])
  @@map("industries")
}

model Company {
  id          String   @id @default(uuid())
  name        String
  ticker      String?  @unique
  market      String?
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt       @map("updated_at")
  industryMappings CompanyIndustry[]

  @@index([name])
  @@map("companies")
}

model CompanyIndustry {
  companyId  String   @map("company_id")
  industryId String   @map("industry_id")
  createdAt  DateTime @default(now()) @map("created_at")
  company    Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  industry   Industry @relation(fields: [industryId], references: [id], onDelete: Cascade)

  @@id([companyId, industryId])
  @@index([industryId])
  @@map("company_industries")
}
```

- [ ] **Step 2**: `apps/company-map/src/lib/db.ts` (server-only Prisma singleton)

```typescript
import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
```

(`server-only` import — Prisma client가 client bundle로 새는 것을 빌드 단계에서 차단.)

`server-only` 패키지는 Next.js에 기본 포함됨 (별도 설치 불필요).

- [ ] **Step 3**: `apps/company-map/.env.example` 교체

```bash
# Prisma + SQLite Configuration
# DB 파일 경로 — schema.prisma 기준 상대경로 (Prisma 관례)
DATABASE_URL="file:../data/company-map.db"

# Environment
NODE_ENV=development
```

- [ ] **Step 4**: `apps/company-map/.gitignore`에 다음 추가 (없으면)

```
# SQLite DB 파일 (사용자별 로컬 데이터)
/data
```

- [ ] **Step 5**: `prisma generate`로 client 타입 생성

```bash
yarn workspace company-map prisma generate
```

기대: `node_modules/.prisma/client`에 생성됨.

- [ ] **Step 6**: 커밋

```bash
git add apps/company-map/prisma/ apps/company-map/src/lib/db.ts apps/company-map/.env.example apps/company-map/.gitignore
git commit -m "feat(company-map): add Prisma schema and db client singleton"
```

### Task 3: 마이그레이션 적용 + dev.db 생성 (사용자 또는 자동)

**Files:** Created by Prisma in `apps/company-map/prisma/migrations/`, `apps/company-map/data/company-map.db`

- [ ] **Step 1**: `.env.local` 작성 (사용자 액션, 또는 controller가 처리)

```bash
echo 'DATABASE_URL="file:../data/company-map.db"' > apps/company-map/.env.local
```

- [ ] **Step 2**: `prisma migrate dev`로 첫 마이그레이션 + DB 파일 생성

```bash
cd apps/company-map && yarn prisma migrate dev --name init
```

기대:
- `apps/company-map/prisma/migrations/<timestamp>_init/migration.sql` 생성됨
- `apps/company-map/data/company-map.db` 생성됨 (gitignored)
- 3개 테이블 (`industries`, `companies`, `company_industries`) 생성됨

- [ ] **Step 3**: 마이그레이션 SQL 파일은 git tracked. data/ 디렉토리는 untracked. 커밋

```bash
git add apps/company-map/prisma/migrations/
git commit -m "feat(company-map): add init migration"
```

---

## Phase B — Server Actions 재작성

### Task 4: industries action 재작성

**Files:** Replace `apps/company-map/src/actions/industries.ts`

- [ ] **Step 1**: 전체 교체

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { Industry, IndustryNode } from "@/types/industry";

function toDomainIndustry(row: {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Industry {
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parentId,
    description: row.description,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function listIndustries(): Promise<Industry[]> {
  const rows = await db.industry.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] });
  return rows.map(toDomainIndustry);
}

export async function getIndustry(id: string): Promise<Industry | null> {
  const row = await db.industry.findUnique({ where: { id } });
  return row ? toDomainIndustry(row) : null;
}

export async function getIndustryTree(): Promise<IndustryNode[]> {
  const all = await listIndustries();
  const byId = new Map<string, IndustryNode>();
  all.forEach((i) => byId.set(i.id, { ...i, children: [] }));
  const roots: IndustryNode[] = [];
  byId.forEach((node) => {
    if (node.parent_id && node.parent_id !== node.id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export async function createIndustry(input: {
  name: string;
  parent_id: string | null;
  description?: string | null;
}): Promise<Industry> {
  const row = await db.industry.create({
    data: {
      name: input.name,
      parentId: input.parent_id,
      description: input.description ?? null,
    },
  });
  revalidatePath("/industries");
  revalidatePath("/");
  return toDomainIndustry(row);
}

export async function updateIndustry(
  id: string,
  input: { name?: string; parent_id?: string | null; description?: string | null },
): Promise<Industry> {
  if (input.parent_id !== undefined && input.parent_id !== null) {
    const descendants = await collectDescendantIds(id);
    if (input.parent_id === id || descendants.has(input.parent_id)) {
      throw new Error("순환 참조: 자기 자신 또는 자손을 부모로 지정할 수 없습니다.");
    }
  }
  const row = await db.industry.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.parent_id !== undefined ? { parentId: input.parent_id } : {}),
    },
  });
  revalidatePath("/industries");
  revalidatePath(`/industries/${id}`);
  revalidatePath("/");
  return toDomainIndustry(row);
}

export async function deleteIndustry(id: string): Promise<void> {
  await db.industry.delete({ where: { id } });
  revalidatePath("/industries");
  revalidatePath("/");
}

async function collectDescendantIds(rootId: string): Promise<Set<string>> {
  const all = await db.industry.findMany({ select: { id: true, parentId: true } });
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    all
      .filter((i) => i.parentId === cur)
      .forEach((c) => {
        if (!out.has(c.id)) {
          out.add(c.id);
          stack.push(c.id);
        }
      });
  }
  return out;
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/actions/industries.ts
git commit -m "feat(company-map): rewrite industries actions with Prisma"
```

### Task 5: companies action 재작성

**Files:** Replace `apps/company-map/src/actions/companies.ts`

- [ ] **Step 1**: 전체 교체

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Company } from "@/types/company";

const PAGE_SIZE = 50;

function toDomainCompany(row: {
  id: string;
  name: string;
  ticker: string | null;
  market: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Company {
  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    market: row.market,
    description: row.description,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function listCompanies(opts?: {
  search?: string;
  page?: number;
}): Promise<{ rows: Company[]; total: number }> {
  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const skip = (page - 1) * PAGE_SIZE;

  const where: Prisma.CompanyWhereInput | undefined = opts?.search?.trim()
    ? {
        OR: [
          { name: { contains: opts.search } },
          { ticker: { contains: opts.search } },
        ],
      }
    : undefined;

  const [rows, total] = await Promise.all([
    db.company.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip,
      take: PAGE_SIZE,
    }),
    db.company.count({ where }),
  ]);

  return { rows: rows.map(toDomainCompany), total };
}

export async function getCompany(id: string): Promise<Company | null> {
  const row = await db.company.findUnique({ where: { id } });
  return row ? toDomainCompany(row) : null;
}

export async function searchCompanies(query: string, limit = 20): Promise<Company[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const rows = await db.company.findMany({
    where: {
      OR: [
        { name: { contains: trimmed } },
        { ticker: { contains: trimmed } },
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit,
  });
  return rows.map(toDomainCompany);
}

export async function createCompany(input: {
  name: string;
  ticker?: string | null;
  market?: string | null;
  description?: string | null;
}): Promise<Company> {
  const row = await db.company.create({
    data: {
      name: input.name,
      ticker: input.ticker?.trim() || null,
      market: input.market?.trim() || null,
      description: input.description?.trim() || null,
    },
  });
  revalidatePath("/companies");
  return toDomainCompany(row);
}

export async function updateCompany(
  id: string,
  input: Partial<Omit<Company, "id" | "created_at" | "updated_at">>,
): Promise<Company> {
  const row = await db.company.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.ticker !== undefined ? { ticker: input.ticker } : {}),
      ...(input.market !== undefined ? { market: input.market } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return toDomainCompany(row);
}

export async function deleteCompany(id: string): Promise<void> {
  await db.company.delete({ where: { id } });
  revalidatePath("/companies");
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/actions/companies.ts
git commit -m "feat(company-map): rewrite companies actions with Prisma"
```

### Task 6: mappings action 재작성

**Files:** Replace `apps/company-map/src/actions/mappings.ts`

- [ ] **Step 1**: 전체 교체

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { Industry } from "@/types/industry";
import type { Company } from "@/types/company";

function toDomainIndustry(row: {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Industry {
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parentId,
    description: row.description,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toDomainCompany(row: {
  id: string;
  name: string;
  ticker: string | null;
  market: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Company {
  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    market: row.market,
    description: row.description,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function getIndustriesForCompany(companyId: string): Promise<Industry[]> {
  const rows = await db.companyIndustry.findMany({
    where: { companyId },
    include: { industry: true },
  });
  return rows.map((r) => toDomainIndustry(r.industry));
}

export async function getCompaniesForIndustry(industryId: string): Promise<Company[]> {
  const rows = await db.companyIndustry.findMany({
    where: { industryId },
    include: { company: true },
  });
  return rows.map((r) => toDomainCompany(r.company));
}

export async function addMapping(companyId: string, industryId: string): Promise<void> {
  await db.companyIndustry.upsert({
    where: { companyId_industryId: { companyId, industryId } },
    create: { companyId, industryId },
    update: {},
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/industries/${industryId}`);
  revalidatePath("/");
}

export async function removeMapping(companyId: string, industryId: string): Promise<void> {
  await db.companyIndustry.delete({
    where: { companyId_industryId: { companyId, industryId } },
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/industries/${industryId}`);
  revalidatePath("/");
}

export async function setMappingsForCompany(
  companyId: string,
  industryIds: string[],
): Promise<void> {
  // SQLite는 단일 connection이라 transaction이 안전·효율적
  await db.$transaction([
    db.companyIndustry.deleteMany({ where: { companyId } }),
    ...(industryIds.length > 0
      ? [
          db.companyIndustry.createMany({
            data: industryIds.map((industryId) => ({ companyId, industryId })),
          }),
        ]
      : []),
  ]);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/");
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/actions/mappings.ts
git commit -m "feat(company-map): rewrite mappings actions with Prisma"
```

### Task 7: import action 재작성

**Files:** Replace `apps/company-map/src/actions/import.ts`

- [ ] **Step 1**: 전체 교체

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type ImportRow = {
  name: string;
  ticker?: string | null;
  market?: string | null;
};

export type ImportResult = {
  inserted: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

export async function importCompaniesAction(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, skipped: 0, errors: [] };
  if (rows.length === 0) return result;

  // 기존 ticker 미리 로드 (1000개+ 일 때 N+1 회피)
  // 단일 사용자 가정: 동시 import 시 stale Set 위험 있음. ticker UNIQUE 제약이 fallback.
  const existing = await db.company.findMany({
    where: { ticker: { not: null } },
    select: { ticker: true },
  });
  const existingTickers = new Set(existing.map((r) => r.ticker as string));

  const toInsert: { name: string; ticker: string | null; market: string | null }[] = [];
  rows.forEach((row, idx) => {
    if (!row.name || !row.name.trim()) {
      result.errors.push({ row: idx + 1, message: "name 누락" });
      return;
    }
    const ticker = row.ticker?.trim() || null;
    if (ticker && existingTickers.has(ticker)) {
      result.skipped += 1;
      return;
    }
    if (ticker) existingTickers.add(ticker);
    toInsert.push({
      name: row.name.trim(),
      ticker,
      market: row.market?.trim() || null,
    });
  });

  // SQLite의 SQLITE_MAX_VARIABLE_NUMBER 기본값(보통 32766) 회피 + 큰 트랜잭션 회피
  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    try {
      await db.company.createMany({ data: chunk });
      result.inserted += chunk.length;
    } catch (e) {
      const msg =
        e instanceof Prisma.PrismaClientKnownRequestError
          ? `${e.code}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      result.errors.push({
        row: i + 1,
        message: `chunk[${i}..${i + chunk.length - 1}] failed (${chunk.length}건): ${msg}`,
      });
    }
  }
  revalidatePath("/companies");
  return result;
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/actions/import.ts
git commit -m "feat(company-map): rewrite import action with Prisma createMany"
```

---

## Phase C — 정리

### Task 8: Supabase 잔여 제거 + README 갱신

**Files:**
- Delete `apps/company-map/src/lib/supabase/` (디렉토리 전체)
- Delete `apps/company-map/supabase/` (디렉토리 전체)
- Modify `apps/company-map/README.md`

- [ ] **Step 1**: Supabase 디렉토리 제거

```bash
git rm -r apps/company-map/src/lib/supabase apps/company-map/supabase
```

- [ ] **Step 2**: `apps/company-map/README.md` 교체

```markdown
# Company Map

산업·기업 N:M 매핑 시각화 본인용 도구. Prisma + SQLite 단일 파일 DB로 동작 (외부 의존성 0).

## Setup

1. `cp .env.example .env.local` (DATABASE_URL이 들어가 있음 — 그대로 사용 가능)
2. 첫 실행 시 마이그레이션:
   ```
   yarn workspace company-map prisma migrate dev
   yarn workspace company-map prisma generate
   ```
   → `apps/company-map/data/company-map.db` 자동 생성됨
3. 개발 서버:
   ```
   yarn workspace company-map dev
   ```
   포트 3004
4. `/import` 페이지에서 KRX CSV 업로드 → `/industries`에서 트리 작성 → `/`에서 시각화

## 구조

- 데이터: SQLite 단일 파일 — `industries`(self-tree), `companies`, `company_industries`(N:M)
- ORM: Prisma (`prisma/schema.prisma` 단일 source of truth, type 자동 생성)
- 시각화: React Flow + d3-force, 양방향(산업↔기업) 자유 탐색

## 백업

DB 파일(`data/company-map.db`)을 그대로 복사하면 끝. 다른 머신으로 옮기는 것도 같은 방법.

## 마이그레이션 변경

스키마 변경 시:
```
yarn workspace company-map prisma migrate dev --name <change-name>
```
```

- [ ] **Step 3**: 빌드/lint 통과 확인

```bash
cd apps/company-map && yarn lint && yarn build
```

- [ ] **Step 4**: 커밋

```bash
git add -A apps/company-map/src/lib apps/company-map/supabase apps/company-map/README.md
git commit -m "chore(company-map): remove Supabase remnants and update README"
```

---

## Phase D — 검증 + Final Review

### Task 9: 통합 검증

**Files:** None (verification only)

- [ ] **Step 1**: 전체 lint + build 한 번에

```bash
cd apps/company-map && yarn lint && yarn build
```

기대: 0 errors, build success.

- [ ] **Step 2**: Prisma client에 사용된 모든 import 검증

```bash
grep -rn "@/lib/supabase" apps/company-map/src 2>/dev/null
grep -rn "@supabase" apps/company-map/src 2>/dev/null
```

기대: 두 명령 모두 빈 출력.

- [ ] **Step 3**: dev 서버 띄워서 첫 페이지 응답 확인

```bash
yarn workspace company-map dev &
SLEEP=2; sleep $SLEEP
curl -sf http://localhost:3004/companies | head -5
kill %1 2>/dev/null
```

기대: 200 응답, "Companies" 헤더 보임.

- [ ] **Step 4**: 별도 commit 없음 (검증만).

---

## Self-Review

**1. 스펙 커버리지:**

| Spec | 구현 task |
|---|---|
| §2.1 Prisma schema | T2 |
| §2.2 모델링 결정 (Cascade, file-based, server-only) | T2 + T4-T7 |
| §5 deps swap | T1 |
| §6 디렉토리 (Supabase 제거, prisma/data 추가) | T2 + T8 |
| §7 DB 설정 (env, migration) | T2 + T3 |
| 4 server actions Prisma 재작성 | T4, T5, T6, T7 |
| README setup 갱신 | T8 |

**2. Placeholder 스캔:** 없음. 모든 코드 실체화.

**3. 타입 일관성:**
- `Industry`/`Company`/`IndustryNode` 도메인 type 그대로 유지 (timestamps `string` ISO).
- Prisma row → 도메인 변환 helper(`toDomainIndustry`, `toDomainCompany`)가 actions와 mappings에서 일관됨.
- 모든 server action 시그니처(인자·반환 타입)는 Supabase 버전과 동일 — components 변경 불필요.

**4. 누락 사항 / 알려진 deviation:**
- T6 `setMappingsForCompany`: 이전엔 두 round-trip이었지만 이제 `db.$transaction`으로 atomic. 더 안전 (개선).
- T7 import: chunk 실패 시 message에 chunk range + count 명시 (이전과 동일 패턴).
- types 파일은 변경 없음 — 기존 코드 100% 호환.

---

## Execution Handoff

Subagent-Driven Development로 task 1→9 순차 진행. Auto mode에서는 자동으로.
