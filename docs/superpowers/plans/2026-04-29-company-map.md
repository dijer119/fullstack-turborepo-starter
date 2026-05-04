# Company Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/company-map`에 산업·기업 N:M 매핑을 다단계 트리 + 부분 네트워크 그래프로 양방향 탐색하는 본인용 웹앱을 구현한다.

**Architecture:** Next.js 16 App Router + Supabase(Postgres). 메인 화면(`/`)은 Client Component(React Flow + d3-force)로 인터랙티브 그래프, 나머지 CRUD 페이지는 Server Components + Server Actions. URL query param(`?focus=<type>:<id>`)으로 중심 노드 동기화.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind v4, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), `@xyflow/react`, `d3-force`, `papaparse`, `cmdk`, `lucide-react`.

**Spec:** [docs/superpowers/specs/2026-04-29-company-map-design.md](../specs/2026-04-29-company-map-design.md)

**Note on testing:** spec §8에 따라 자동화 테스트는 작성하지 않습니다. 각 task의 verification은 빌드·린트 + 브라우저 수동 검증입니다. `apps/company-map`의 boilerplate(layout/page/config)는 이미 세팅되어 있습니다.

---

## File Structure

```
apps/company-map/
├── package.json                              # Task 1: 의존성 추가
├── .env.local                                # Task 2: Supabase 환경변수 (untracked)
├── supabase/migrations/0001_init.sql         # Task 3: 스키마
├── src/
│   ├── lib/
│   │   ├── supabase/{client,server}.ts       # Task 4: Supabase 클라이언트
│   │   ├── csv/parser.ts                     # Task 11: CSV 파싱
│   │   └── graph/layout.ts                   # Task 12: d3-force layout
│   ├── types/{industry,company,mapping}.ts   # Task 5: 타입
│   ├── actions/
│   │   ├── industries.ts                     # Task 6: 산업 CRUD + 트리
│   │   ├── companies.ts                      # Task 7: 기업 CRUD + 검색
│   │   ├── mappings.ts                       # Task 8: 매핑 add/remove
│   │   └── import.ts                         # Task 9: CSV 일괄
│   ├── components/
│   │   ├── layout/Header.tsx                 # Task 13
│   │   ├── search/GlobalSearch.tsx           # Task 14
│   │   ├── tree/IndustryTree.tsx             # Task 15
│   │   ├── tree/IndustryPicker.tsx           # Task 16
│   │   └── graph/{IndustryNode,CompanyNode,MapGraph}.tsx  # Task 22
│   └── app/
│       ├── layout.tsx                        # Task 13: Header 통합
│       ├── page.tsx                          # Task 23: 메인 그래프
│       ├── companies/{page,new/page,[id]/page}.tsx        # Task 17-19
│       ├── industries/{page,[id]/page}.tsx                # Task 20-21
│       └── import/page.tsx                   # Task 10
```

---

## Phase A — 환경·데이터베이스

### Task 1: 의존성 추가

**Files:** Modify `apps/company-map/package.json`

- [ ] **Step 1**: 패키지 설치

```bash
yarn workspace company-map add @xyflow/react d3-force papaparse cmdk lucide-react
yarn workspace company-map add -D @types/d3-force @types/papaparse
```

- [ ] **Step 2**: 빌드 확인

```bash
cd apps/company-map && yarn build
```
기대: 빌드 성공 (단지 의존성 추가, 코드 변경 없음).

- [ ] **Step 3**: 커밋

```bash
git add apps/company-map/package.json yarn.lock
git commit -m "deps(company-map): add graph/csv/search libraries"
```

### Task 2: Supabase 환경변수 설정

**Files:** Create `apps/company-map/.env.local`

- [ ] **Step 1**: 신규 Supabase 프로젝트 생성 (또는 기존 사용). Settings → API에서 URL과 anon key 복사.

- [ ] **Step 2**: `.env.local` 작성

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

- [ ] **Step 3**: 검증 — 파일 존재 확인. `.gitignore`로 제외되므로 커밋 없음.

### Task 3: DB 마이그레이션

**Files:** Create `apps/company-map/supabase/migrations/0001_init.sql`

- [ ] **Step 1**: SQL 파일 작성

```sql
-- industries: 다단계 트리
CREATE TABLE industries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  parent_id   uuid REFERENCES industries(id) ON DELETE CASCADE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_industries_parent_id ON industries(parent_id);
CREATE INDEX idx_industries_name ON industries(name);

-- companies
CREATE TABLE companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  ticker      text UNIQUE,
  market      text,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_companies_name ON companies(name);

-- mappings (N:M)
CREATE TABLE company_industries (
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  industry_id uuid NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, industry_id)
);
CREATE INDEX idx_company_industries_industry ON company_industries(industry_id);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_industries_updated_at BEFORE UPDATE ON industries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2**: Supabase Studio → SQL Editor에서 위 SQL 실행 (또는 `supabase db push`).

- [ ] **Step 3**: Supabase Studio → Table Editor에서 세 테이블 생성 확인. RLS는 disabled.

- [ ] **Step 4**: 커밋

```bash
git add apps/company-map/supabase/migrations/0001_init.sql
git commit -m "feat(company-map): add initial database schema"
```

---

## Phase B — Supabase 클라이언트 + 타입

### Task 4: Supabase 클라이언트

**Files:** Create `src/lib/supabase/{client,server}.ts`

- [ ] **Step 1**: `src/lib/supabase/client.ts`

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2**: `src/lib/supabase/server.ts`

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component에서는 set 호출 불가 — 무시
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3**: 빌드 확인

```bash
cd apps/company-map && yarn build
```

- [ ] **Step 4**: 커밋

```bash
git add apps/company-map/src/lib/supabase/
git commit -m "feat(company-map): add supabase client/server helpers"
```

### Task 5: 타입 정의

**Files:** Create `src/types/{industry,company,mapping}.ts`

- [ ] **Step 1**: `src/types/industry.ts`

```typescript
export type Industry = {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type IndustryNode = Industry & {
  children: IndustryNode[];
};
```

- [ ] **Step 2**: `src/types/company.ts`

```typescript
export type Company = {
  id: string;
  name: string;
  ticker: string | null;
  market: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 3**: `src/types/mapping.ts`

```typescript
export type CompanyIndustry = {
  company_id: string;
  industry_id: string;
  created_at: string;
};
```

- [ ] **Step 4**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/types/
git commit -m "feat(company-map): add domain types"
```

---

## Phase C — Server Actions

### Task 6: 산업 Server Actions

**Files:** Create `src/actions/industries.ts`

- [ ] **Step 1**: 작성

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Industry, IndustryNode } from "@/types/industry";

export async function listIndustries(): Promise<Industry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("industries")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getIndustry(id: string): Promise<Industry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("industries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getIndustryTree(): Promise<IndustryNode[]> {
  const all = await listIndustries();
  const byId = new Map<string, IndustryNode>();
  all.forEach((i) => byId.set(i.id, { ...i, children: [] }));
  const roots: IndustryNode[] = [];
  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) {
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("industries")
    .insert({
      name: input.name,
      parent_id: input.parent_id,
      description: input.description ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/industries");
  revalidatePath("/");
  return data;
}

export async function updateIndustry(
  id: string,
  input: { name?: string; parent_id?: string | null; description?: string | null },
): Promise<Industry> {
  if (input.parent_id !== undefined && input.parent_id !== null) {
    // 순환 참조 검증: 새 부모가 자기 자신의 자손이면 거부
    const descendants = await collectDescendantIds(id);
    if (input.parent_id === id || descendants.has(input.parent_id)) {
      throw new Error("순환 참조: 자기 자신 또는 자손을 부모로 지정할 수 없습니다.");
    }
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("industries")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/industries");
  revalidatePath(`/industries/${id}`);
  revalidatePath("/");
  return data;
}

export async function deleteIndustry(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("industries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/industries");
  revalidatePath("/");
}

async function collectDescendantIds(rootId: string): Promise<Set<string>> {
  const all = await listIndustries();
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    all
      .filter((i) => i.parent_id === cur)
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
git commit -m "feat(company-map): add industries server actions"
```

### Task 7: 기업 Server Actions

**Files:** Create `src/actions/companies.ts`

- [ ] **Step 1**: 작성

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/types/company";

const PAGE_SIZE = 50;

export async function listCompanies(opts?: {
  search?: string;
  page?: number;
}): Promise<{ rows: Company[]; total: number }> {
  const supabase = await createClient();
  const page = opts?.page ?? 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let q = supabase.from("companies").select("*", { count: "exact" }).order("name");
  if (opts?.search) {
    q = q.or(`name.ilike.%${opts.search}%,ticker.ilike.%${opts.search}%`);
  }
  const { data, error, count } = await q.range(from, to);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getCompany(id: string): Promise<Company | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function searchCompanies(query: string, limit = 20): Promise<Company[]> {
  if (!query.trim()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .or(`name.ilike.%${query}%,ticker.ilike.%${query}%`)
    .limit(limit)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCompany(input: {
  name: string;
  ticker?: string | null;
  market?: string | null;
  description?: string | null;
}): Promise<Company> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: input.name,
      ticker: input.ticker || null,
      market: input.market || null,
      description: input.description || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/companies");
  return data;
}

export async function updateCompany(
  id: string,
  input: Partial<Omit<Company, "id" | "created_at" | "updated_at">>,
): Promise<Company> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return data;
}

export async function deleteCompany(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/companies");
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/actions/companies.ts
git commit -m "feat(company-map): add companies server actions"
```

### Task 8: 매핑 Server Actions

**Files:** Create `src/actions/mappings.ts`

- [ ] **Step 1**: 작성

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Industry } from "@/types/industry";
import type { Company } from "@/types/company";

export async function getIndustriesForCompany(companyId: string): Promise<Industry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_industries")
    .select("industry:industries(*)")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.industry as unknown as Industry).filter(Boolean);
}

export async function getCompaniesForIndustry(industryId: string): Promise<Company[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_industries")
    .select("company:companies(*)")
    .eq("industry_id", industryId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.company as unknown as Company).filter(Boolean);
}

export async function addMapping(
  companyId: string,
  industryId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_industries")
    .upsert({ company_id: companyId, industry_id: industryId });
  if (error) throw new Error(error.message);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/industries/${industryId}`);
  revalidatePath("/");
}

export async function removeMapping(
  companyId: string,
  industryId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_industries")
    .delete()
    .eq("company_id", companyId)
    .eq("industry_id", industryId);
  if (error) throw new Error(error.message);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/industries/${industryId}`);
  revalidatePath("/");
}

export async function setMappingsForCompany(
  companyId: string,
  industryIds: string[],
): Promise<void> {
  const supabase = await createClient();
  // 기존 모두 제거 후 일괄 insert (트랜잭션은 RPC로 가능하지만 단순화)
  const { error: delErr } = await supabase
    .from("company_industries")
    .delete()
    .eq("company_id", companyId);
  if (delErr) throw new Error(delErr.message);
  if (industryIds.length > 0) {
    const rows = industryIds.map((industry_id) => ({ company_id: companyId, industry_id }));
    const { error: insErr } = await supabase.from("company_industries").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/");
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/actions/mappings.ts
git commit -m "feat(company-map): add mapping server actions"
```

### Task 9: CSV import action

**Files:** Create `src/actions/import.ts`

- [ ] **Step 1**: 작성

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const result: ImportResult = { inserted: 0, skipped: 0, errors: [] };

  // 기존 ticker set 미리 로드 (1000개+ 일 때 N+1 회피)
  const { data: existing } = await supabase
    .from("companies")
    .select("ticker")
    .not("ticker", "is", null);
  const existingTickers = new Set((existing ?? []).map((r) => r.ticker as string));

  const toInsert: ImportRow[] = [];
  rows.forEach((row, idx) => {
    if (!row.name || !row.name.trim()) {
      result.errors.push({ row: idx + 1, message: "name 누락" });
      return;
    }
    if (row.ticker && existingTickers.has(row.ticker)) {
      result.skipped += 1;
      return;
    }
    if (row.ticker) existingTickers.add(row.ticker);
    toInsert.push({
      name: row.name.trim(),
      ticker: row.ticker?.trim() || null,
      market: row.market?.trim() || null,
    });
  });

  // 청크 단위 insert (Supabase request 크기 제한 회피)
  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { error } = await supabase.from("companies").insert(chunk);
    if (error) {
      result.errors.push({ row: i + 1, message: error.message });
    } else {
      result.inserted += chunk.length;
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
git commit -m "feat(company-map): add CSV import action"
```

---

## Phase D — 유틸

### Task 10: CSV 파서 + 미리보기 페이지(`/import`)

**Files:**
- Create `src/lib/csv/parser.ts`
- Create `src/app/import/page.tsx`

- [ ] **Step 1**: `src/lib/csv/parser.ts`

```typescript
import Papa from "papaparse";
import type { ImportRow } from "@/actions/import";

export type ParseResult = {
  rows: ImportRow[];
  errors: string[];
};

const COLUMN_ALIASES: Record<keyof ImportRow, string[]> = {
  name: ["name", "company", "회사명", "종목명", "기업명"],
  ticker: ["ticker", "code", "종목코드", "단축코드"],
  market: ["market", "시장구분", "시장"],
};

function pickColumn(headers: string[], aliases: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const a of aliases) {
    const idx = lower.indexOf(a.toLowerCase());
    if (idx >= 0) return headers[idx];
  }
  return null;
}

export async function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const errors: string[] = res.errors.map((e) => `행 ${e.row ?? "?"}: ${e.message}`);
        const headers = res.meta.fields ?? [];
        const nameCol = pickColumn(headers, COLUMN_ALIASES.name);
        const tickerCol = pickColumn(headers, COLUMN_ALIASES.ticker);
        const marketCol = pickColumn(headers, COLUMN_ALIASES.market);
        if (!nameCol) {
          errors.push("필수 컬럼 'name'(또는 종목명/회사명) 을 찾지 못했습니다.");
          resolve({ rows: [], errors });
          return;
        }
        const rows: ImportRow[] = res.data.map((r) => ({
          name: r[nameCol] ?? "",
          ticker: tickerCol ? r[tickerCol] || null : null,
          market: marketCol ? r[marketCol] || null : null,
        }));
        resolve({ rows, errors });
      },
      error: (err) => resolve({ rows: [], errors: [err.message] }),
    });
  });
}
```

- [ ] **Step 2**: `src/app/import/page.tsx`

```typescript
"use client";

import { useState } from "react";
import { parseCsvFile, type ParseResult } from "@/lib/csv/parser";
import { importCompaniesAction, type ImportResult } from "@/actions/import";

export default function ImportPage() {
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [running, setRunning] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setResult(null);
    setParse(await parseCsvFile(f));
  }

  async function onConfirm() {
    if (!parse) return;
    setRunning(true);
    try {
      setResult(await importCompaniesAction(parse.rows));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">CSV Import</h2>
      <p className="text-sm text-gray-500">
        지원 컬럼: <code>name</code>(또는 종목명/회사명), <code>ticker</code>(선택), <code>market</code>(선택)
      </p>
      <input
        type="file"
        accept=".csv"
        onChange={onFile}
        className="block border rounded p-2 w-full"
      />

      {parse && (
        <div className="border rounded p-3 space-y-2">
          <div className="text-sm">
            파싱 결과: <b>{parse.rows.length}</b>행 / 오류 {parse.errors.length}건
          </div>
          {parse.errors.length > 0 && (
            <ul className="text-xs text-red-600 list-disc pl-5">
              {parse.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="p-1">name</th>
                <th className="p-1">ticker</th>
                <th className="p-1">market</th>
              </tr>
            </thead>
            <tbody>
              {parse.rows.slice(0, 10).map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="p-1">{r.name}</td>
                  <td className="p-1">{r.ticker}</td>
                  <td className="p-1">{r.market}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={onConfirm}
            disabled={running || parse.rows.length === 0}
            className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
          >
            {running ? "Importing…" : `${parse.rows.length}행 일괄 등록`}
          </button>
        </div>
      )}

      {result && (
        <div className="border rounded p-3 bg-green-50 dark:bg-green-950 text-sm">
          ✅ 신규 <b>{result.inserted}</b>건 / 중복 skip <b>{result.skipped}</b>건 / 오류{" "}
          <b>{result.errors.length}</b>건
          {result.errors.length > 0 && (
            <ul className="text-xs text-red-600 list-disc pl-5 mt-2">
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>
                  행 {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3**: 검증 — `yarn dev` 후 http://localhost:3004/import 접속. KRX에서 받은 작은 CSV 샘플(5-10행)로 미리보기·등록 동작 확인.

- [ ] **Step 4**: 커밋

```bash
git add apps/company-map/src/lib/csv/ apps/company-map/src/app/import/
git commit -m "feat(company-map): add CSV import page and parser"
```

### Task 11: 그래프 layout (d3-force)

**Files:** Create `src/lib/graph/layout.ts`

- [ ] **Step 1**: 작성

```typescript
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export type LayoutNode = SimulationNodeDatum & {
  id: string;
  type: "industry" | "company";
};

export type LayoutEdge = SimulationLinkDatum<LayoutNode> & {
  kind: "mapping" | "tree";
};

export type Positioned = { id: string; x: number; y: number };

/** 동기적으로 force simulation을 N번 tick 돌려 위치를 계산. */
export function computeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts?: { width?: number; height?: number; iterations?: number },
): Positioned[] {
  const width = opts?.width ?? 800;
  const height = opts?.height ?? 600;
  const iterations = opts?.iterations ?? 200;

  // mutating copies (d3-force는 객체에 vx, vy, x, y를 직접 할당)
  const ns = nodes.map((n) => ({ ...n }));
  const es = edges.map((e) => ({ ...e }));

  const sim = forceSimulation(ns)
    .force("charge", forceManyBody().strength(-180))
    .force(
      "link",
      forceLink<LayoutNode, LayoutEdge>(es)
        .id((d) => d.id)
        .distance((l) => (l.kind === "mapping" ? 90 : 130))
        .strength(0.6),
    )
    .force("center", forceCenter(width / 2, height / 2))
    .stop();

  for (let i = 0; i < iterations; i += 1) sim.tick();

  return ns.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 }));
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/lib/graph/
git commit -m "feat(company-map): add d3-force layout helper"
```

---

## Phase E — 공통 UI 컴포넌트

### Task 12: Header

**Files:**
- Create `src/components/layout/Header.tsx`
- Modify `src/app/layout.tsx`

- [ ] **Step 1**: `src/components/layout/Header.tsx`

```typescript
import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center gap-6 bg-white dark:bg-black sticky top-0 z-20">
      <Link href="/" className="font-semibold">Company Map</Link>
      <nav className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
        <Link href="/" className="hover:underline">Map</Link>
        <Link href="/companies" className="hover:underline">Companies</Link>
        <Link href="/industries" className="hover:underline">Industries</Link>
        <Link href="/import" className="hover:underline">Import</Link>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2**: `src/app/layout.tsx` 수정 — 인라인 헤더를 새 컴포넌트로 교체

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Company Map",
  description: "산업과 기업을 한눈에 볼 수 있는 맵 서비스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex flex-col h-screen">
          <Header />
          <main className="flex-1 overflow-y-auto p-3 md:p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3**: 빌드·접속(http://localhost:3004) 후 헤더 네비 확인.

- [ ] **Step 4**: 커밋

```bash
git add apps/company-map/src/components/layout/ apps/company-map/src/app/layout.tsx
git commit -m "feat(company-map): add header navigation"
```

### Task 13: GlobalSearch (cmdk 기반 통합 자동완성)

**Files:** Create `src/components/search/GlobalSearch.tsx`

- [ ] **Step 1**: 작성

```typescript
"use client";

import { Command } from "cmdk";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchCompanies } from "@/actions/companies";
import { listIndustries } from "@/actions/industries";
import type { Company } from "@/types/company";
import type { Industry } from "@/types/industry";

type Item =
  | { kind: "industry"; value: Industry }
  | { kind: "company"; value: Company };

export function GlobalSearch({
  onPick,
  placeholder = "산업 또는 기업 검색…",
}: {
  /** 결과 클릭 시 라우팅 대신 부모에 통보. 미지정 시 메인 페이지로 focus 이동. */
  onPick?: (item: Item) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const trimmed = q.trim();
      if (!trimmed) {
        if (alive) setItems([]);
        return;
      }
      const [companies, allIndustries] = await Promise.all([
        searchCompanies(trimmed, 15),
        listIndustries(),
      ]);
      const indMatches = allIndustries
        .filter((i) => i.name.toLowerCase().includes(trimmed.toLowerCase()))
        .slice(0, 10);
      if (!alive) return;
      const merged: Item[] = [
        ...indMatches.map<Item>((i) => ({ kind: "industry", value: i })),
        ...companies.map<Item>((c) => ({ kind: "company", value: c })),
      ];
      setItems(merged);
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  function pick(item: Item) {
    setOpen(false);
    setQ("");
    if (onPick) onPick(item);
    else router.push(`/?focus=${item.kind}:${item.value.id}`);
  }

  return (
    <div className="relative w-full max-w-md">
      <input
        ref={ref}
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full border rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-900"
      />
      {open && q.trim() && (
        <Command
          className="absolute top-full left-0 right-0 mt-1 border rounded bg-white dark:bg-gray-900 shadow z-30 max-h-80 overflow-auto"
          shouldFilter={false}
        >
          <Command.List>
            {items.length === 0 && (
              <div className="text-xs text-gray-500 p-3">결과 없음</div>
            )}
            {items.map((it) => (
              <Command.Item
                key={`${it.kind}-${it.value.id}`}
                value={`${it.kind}-${it.value.id}`}
                onSelect={() => pick(it)}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer aria-selected:bg-blue-50 dark:aria-selected:bg-blue-950"
              >
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    it.kind === "industry"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {it.kind === "industry" ? "산업" : "기업"}
                </span>
                <span className="font-medium">{it.value.name}</span>
                {it.kind === "company" && it.value.ticker && (
                  <span className="text-xs text-gray-500">{it.value.ticker}</span>
                )}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      )}
    </div>
  );
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/components/search/
git commit -m "feat(company-map): add cmdk-based global search"
```

### Task 14: IndustryTree (재귀 사이드바 트리)

**Files:** Create `src/components/tree/IndustryTree.tsx`

- [ ] **Step 1**: 작성

```typescript
"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { IndustryNode } from "@/types/industry";

export function IndustryTree({
  nodes,
  selectedId,
  highlightIds,
  expandedIds,
  onSelect,
}: {
  nodes: IndustryNode[];
  /** 현재 단일 선택된 산업 (그래프 중심이면 표시) */
  selectedId?: string | null;
  /** 추가 하이라이트 (예: 기업 포커스 시 매핑된 산업들) */
  highlightIds?: Set<string>;
  /** 강제로 펼친 상태로 표시할 산업들. 위로 traverse한 조상 모두 포함되어야 함. */
  expandedIds?: Set<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="text-sm font-mono">
      {nodes.map((n) => (
        <TreeNode
          key={n.id}
          node={n}
          depth={0}
          selectedId={selectedId}
          highlightIds={highlightIds}
          expandedIds={expandedIds}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedId,
  highlightIds,
  expandedIds,
  onSelect,
}: {
  node: IndustryNode;
  depth: number;
  selectedId?: string | null;
  highlightIds?: Set<string>;
  expandedIds?: Set<string>;
  onSelect: (id: string) => void;
}) {
  const forced = expandedIds?.has(node.id) ?? false;
  const [open, setOpen] = useState(forced || depth < 1);
  const isOpen = forced || open;
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const isHighlight = highlightIds?.has(node.id) ?? false;

  return (
    <div>
      <div
        style={{ paddingLeft: 8 + depth * 12 }}
        className={`flex items-center gap-1 py-0.5 cursor-pointer rounded ${
          isSelected
            ? "bg-blue-600 text-white"
            : isHighlight
              ? "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100"
              : "hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
        onClick={() => onSelect(node.id)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="w-4 h-4 flex items-center justify-center"
        >
          {hasChildren ? (
            isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="opacity-30">·</span>
          )}
        </button>
        <span className="truncate">{node.name}</span>
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              highlightIds={highlightIds}
              expandedIds={expandedIds}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/components/tree/IndustryTree.tsx
git commit -m "feat(company-map): add recursive industry tree component"
```

### Task 15: IndustryPicker (폼용 트리 picker)

**Files:** Create `src/components/tree/IndustryPicker.tsx`

- [ ] **Step 1**: 작성

```typescript
"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { IndustryNode } from "@/types/industry";

export function IndustryPicker({
  nodes,
  selectedIds,
  multi = true,
  onChange,
}: {
  nodes: IndustryNode[];
  selectedIds: Set<string>;
  multi?: boolean;
  onChange: (next: Set<string>) => void;
}) {
  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else {
      if (!multi) next.clear();
      next.add(id);
    }
    onChange(next);
  }

  return (
    <div className="border rounded max-h-72 overflow-auto p-1 text-sm">
      {nodes.map((n) => (
        <PickerNode key={n.id} node={n} depth={0} selected={selectedIds} onToggle={toggle} />
      ))}
    </div>
  );
}

function PickerNode({
  node,
  depth,
  selected,
  onToggle,
}: {
  node: IndustryNode;
  depth: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const checked = selected.has(node.id);

  return (
    <div>
      <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-4 h-4 flex items-center justify-center"
        >
          {hasChildren ? (
            open ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="opacity-30">·</span>
          )}
        </button>
        <label className="flex items-center gap-1 cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(node.id)}
          />
          <span className="truncate">{node.name}</span>
        </label>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <PickerNode key={c.id} node={c} depth={depth + 1} selected={selected} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/components/tree/IndustryPicker.tsx
git commit -m "feat(company-map): add industry picker for forms"
```

---

## Phase F — CRUD 페이지

### Task 16: `/companies` 리스트

**Files:** Create `src/app/companies/page.tsx`

- [ ] **Step 1**: 작성

```typescript
import Link from "next/link";
import { listCompanies } from "@/actions/companies";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search ?? "";
  const page = Number(params.page ?? "1");
  const { rows, total } = await listCompanies({ search, page });
  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Companies</h2>
        <Link href="/companies/new" className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm">+ 새 기업</Link>
      </div>

      <form className="flex gap-2">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="이름/종목코드 검색"
          className="border rounded px-3 py-1.5 text-sm flex-1 bg-white dark:bg-gray-900"
        />
        <button className="border rounded px-3 py-1.5 text-sm">검색</button>
      </form>

      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr className="text-left">
            <th className="p-2">이름</th>
            <th className="p-2">종목코드</th>
            <th className="p-2">시장</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b">
              <td className="p-2 font-medium">{c.name}</td>
              <td className="p-2 text-gray-500">{c.ticker ?? "—"}</td>
              <td className="p-2 text-gray-500">{c.market ?? "—"}</td>
              <td className="p-2 text-right">
                <Link href={`/companies/${c.id}`} className="text-blue-600 text-xs hover:underline">상세</Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="p-4 text-center text-gray-500">기업이 없습니다.</td></tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex gap-2 justify-center text-sm">
          {page > 1 && (
            <Link href={`/companies?search=${encodeURIComponent(search)}&page=${page - 1}`} className="border rounded px-2 py-1">이전</Link>
          )}
          <span className="px-2 py-1">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={`/companies?search=${encodeURIComponent(search)}&page=${page + 1}`} className="border rounded px-2 py-1">다음</Link>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2**: `/companies` 접속 → 리스트·검색·페이지네이션 동작 확인.

- [ ] **Step 3**: 커밋

```bash
git add apps/company-map/src/app/companies/page.tsx
git commit -m "feat(company-map): add companies list page"
```

### Task 17: `/companies/new` 폼

**Files:** Create `src/app/companies/new/page.tsx`

- [ ] **Step 1**: 작성

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createCompany } from "@/actions/companies";
import { setMappingsForCompany } from "@/actions/mappings";
import { getIndustryTree } from "@/actions/industries";
import { IndustryPicker } from "@/components/tree/IndustryPicker";
import type { IndustryNode } from "@/types/industry";

export default function NewCompanyPage() {
  const [tree, setTree] = useState<IndustryNode[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getIndustryTree().then(setTree);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const created = await createCompany({
        name: String(fd.get("name") ?? "").trim(),
        ticker: String(fd.get("ticker") ?? "").trim() || null,
        market: String(fd.get("market") ?? "").trim() || null,
        description: String(fd.get("description") ?? "").trim() || null,
      });
      if (picked.size > 0) {
        await setMappingsForCompany(created.id, [...picked]);
      }
      router.push(`/companies/${created.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl mx-auto space-y-3">
      <h2 className="text-2xl font-bold">새 기업</h2>
      <Field label="이름 *">
        <input name="name" required className="border rounded px-3 py-1.5 w-full bg-white dark:bg-gray-900" />
      </Field>
      <Field label="종목코드">
        <input name="ticker" className="border rounded px-3 py-1.5 w-full bg-white dark:bg-gray-900" />
      </Field>
      <Field label="시장">
        <select name="market" defaultValue="" className="border rounded px-3 py-1.5 w-full bg-white dark:bg-gray-900">
          <option value="">—</option>
          <option value="KOSPI">KOSPI</option>
          <option value="KOSDAQ">KOSDAQ</option>
          <option value="KONEX">KONEX</option>
        </select>
      </Field>
      <Field label="설명">
        <textarea name="description" rows={2} className="border rounded px-3 py-1.5 w-full bg-white dark:bg-gray-900" />
      </Field>
      <Field label="산업 매핑">
        <IndustryPicker nodes={tree} selectedIds={picked} onChange={setPicked} />
      </Field>
      <div className="flex gap-2">
        <button disabled={submitting} className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
          {submitting ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
```

- [ ] **Step 2**: 검증 — 새 기업 추가 → 산업 매핑 → 저장 → 상세로 이동.

- [ ] **Step 3**: 커밋

```bash
git add apps/company-map/src/app/companies/new/
git commit -m "feat(company-map): add new company form"
```

### Task 18: `/companies/[id]` 상세 + 매핑 편집

**Files:** Create `src/app/companies/[id]/page.tsx`

- [ ] **Step 1**: 작성

```typescript
"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getCompany, updateCompany, deleteCompany } from "@/actions/companies";
import { getIndustriesForCompany, setMappingsForCompany } from "@/actions/mappings";
import { getIndustryTree } from "@/actions/industries";
import { IndustryPicker } from "@/components/tree/IndustryPicker";
import type { Company } from "@/types/company";
import type { Industry, IndustryNode } from "@/types/industry";

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [company, setCompany] = useState<Company | null>(null);
  const [tree, setTree] = useState<IndustryNode[]>([]);
  const [mapped, setMapped] = useState<Industry[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const [c, t, m] = await Promise.all([
        getCompany(id),
        getIndustryTree(),
        getIndustriesForCompany(id),
      ]);
      setCompany(c);
      setTree(t);
      setMapped(m);
      setPicked(new Set(m.map((i) => i.id)));
    })();
  }, [id]);

  if (!company) return <div className="p-6">로딩…</div>;

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await updateCompany(id, {
      name: String(fd.get("name") ?? "").trim(),
      ticker: String(fd.get("ticker") ?? "").trim() || null,
      market: String(fd.get("market") ?? "").trim() || null,
      description: String(fd.get("description") ?? "").trim() || null,
    });
    await setMappingsForCompany(id, [...picked]);
    const [c, m] = await Promise.all([getCompany(id), getIndustriesForCompany(id)]);
    setCompany(c);
    setMapped(m);
    setEditing(false);
  }

  async function onDelete() {
    if (!confirm(`${company.name}을(를) 삭제하시겠습니까? 매핑도 함께 삭제됩니다.`)) return;
    await deleteCompany(id);
    router.push("/companies");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{company.name}</h2>
        <div className="flex gap-2">
          {!editing && (
            <button onClick={() => setEditing(true)} className="border rounded px-3 py-1.5 text-sm">편집</button>
          )}
          <button onClick={onDelete} className="border border-red-300 text-red-600 rounded px-3 py-1.5 text-sm">삭제</button>
          <Link href={`/?focus=company:${id}`} className="border rounded px-3 py-1.5 text-sm">맵에서 보기</Link>
        </div>
      </div>

      {!editing ? (
        <dl className="border rounded p-4 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-gray-500">종목코드</dt><dd>{company.ticker ?? "—"}</dd>
          <dt className="text-gray-500">시장</dt><dd>{company.market ?? "—"}</dd>
          <dt className="text-gray-500">설명</dt><dd>{company.description ?? "—"}</dd>
          <dt className="text-gray-500">매핑된 산업</dt>
          <dd className="flex flex-wrap gap-1">
            {mapped.length === 0 && <span className="text-gray-500">없음</span>}
            {mapped.map((i) => (
              <Link key={i.id} href={`/industries/${i.id}`} className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:underline">{i.name}</Link>
            ))}
          </dd>
        </dl>
      ) : (
        <form onSubmit={onSave} className="border rounded p-4 space-y-3 text-sm">
          <Row label="이름"><input name="name" defaultValue={company.name} required className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900" /></Row>
          <Row label="종목코드"><input name="ticker" defaultValue={company.ticker ?? ""} className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900" /></Row>
          <Row label="시장">
            <select name="market" defaultValue={company.market ?? ""} className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900">
              <option value="">—</option>
              <option value="KOSPI">KOSPI</option>
              <option value="KOSDAQ">KOSDAQ</option>
              <option value="KONEX">KONEX</option>
            </select>
          </Row>
          <Row label="설명"><textarea name="description" defaultValue={company.description ?? ""} rows={2} className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900" /></Row>
          <Row label="산업 매핑"><IndustryPicker nodes={tree} selectedIds={picked} onChange={setPicked} /></Row>
          <div className="flex gap-2">
            <button className="bg-blue-600 text-white rounded px-3 py-1.5">저장</button>
            <button type="button" onClick={() => setEditing(false)} className="border rounded px-3 py-1.5">취소</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
      <span className="text-gray-500 pt-1">{label}</span>
      {children}
    </div>
  );
}
```

- [ ] **Step 2**: 검증 — 기업 상세에서 편집·매핑 변경·삭제 동작 확인.

- [ ] **Step 3**: 커밋

```bash
git add apps/company-map/src/app/companies/\[id\]/
git commit -m "feat(company-map): add company detail page"
```

### Task 19: `/industries` 트리 관리

**Files:** Create `src/app/industries/page.tsx`

- [ ] **Step 1**: 작성

```typescript
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createIndustry, deleteIndustry, getIndustryTree, updateIndustry } from "@/actions/industries";
import type { IndustryNode } from "@/types/industry";

export default function IndustriesPage() {
  const [tree, setTree] = useState<IndustryNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function reload() {
    setTree(await getIndustryTree());
  }
  useEffect(() => { reload(); }, []);

  const selected = selectedId ? findNode(tree, selectedId) : null;

  async function onAddRoot() {
    const name = prompt("새 산업 이름 (최상위)");
    if (!name) return;
    await createIndustry({ name: name.trim(), parent_id: null });
    await reload();
  }

  async function onAddChild(parentId: string) {
    const name = prompt("새 자식 산업 이름");
    if (!name) return;
    await createIndustry({ name: name.trim(), parent_id: parentId });
    await reload();
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`"${name}"과(와) 모든 하위 산업·매핑을 삭제하시겠습니까?`)) return;
    await deleteIndustry(id);
    if (selectedId === id) setSelectedId(null);
    await reload();
  }

  async function onSaveSelected(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const fd = new FormData(e.currentTarget);
    const newParent = String(fd.get("parent_id") ?? "");
    try {
      await updateIndustry(selected.id, {
        name: String(fd.get("name") ?? "").trim(),
        description: String(fd.get("description") ?? "").trim() || null,
        parent_id: newParent || null,
      });
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "저장 실패");
    }
  }

  const allFlat = flattenTree(tree);

  return (
    <div className="max-w-5xl mx-auto grid md:grid-cols-[1fr_1fr] gap-4">
      <section className="border rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">산업 트리</h2>
          <button onClick={onAddRoot} className="border rounded px-2 py-1 text-xs flex items-center gap-1"><Plus size={12}/> 최상위 추가</button>
        </div>
        <TreeAdmin nodes={tree} depth={0} onSelect={setSelectedId} onAddChild={onAddChild} onDelete={onDelete} selectedId={selectedId} />
        {tree.length === 0 && <p className="text-sm text-gray-500">아직 산업이 없습니다. 최상위부터 추가하세요.</p>}
      </section>

      <section className="border rounded p-3 space-y-2">
        <h2 className="text-xl font-bold">선택된 산업</h2>
        {!selected ? (
          <p className="text-sm text-gray-500">좌측에서 산업을 선택하세요.</p>
        ) : (
          <form onSubmit={onSaveSelected} className="space-y-2 text-sm">
            <Field label="이름"><input name="name" defaultValue={selected.name} required className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900"/></Field>
            <Field label="설명"><textarea name="description" defaultValue={selected.description ?? ""} rows={2} className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900"/></Field>
            <Field label="부모">
              <select name="parent_id" defaultValue={selected.parent_id ?? ""} className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-900">
                <option value="">— 최상위 —</option>
                {allFlat.filter((n) => n.id !== selected.id).map((n) => (
                  <option key={n.id} value={n.id}>{n.path}</option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2">
              <button className="bg-blue-600 text-white rounded px-3 py-1.5">저장</button>
              <Link href={`/industries/${selected.id}`} className="border rounded px-3 py-1.5">상세</Link>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function TreeAdmin({
  nodes, depth, onSelect, onAddChild, onDelete, selectedId,
}: {
  nodes: IndustryNode[]; depth: number; onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void; onDelete: (id: string, name: string) => void;
  selectedId: string | null;
}) {
  return (
    <div>
      {nodes.map((n) => (
        <div key={n.id}>
          <div
            style={{ paddingLeft: 8 + depth * 14 }}
            className={`flex items-center gap-1 py-0.5 text-sm ${selectedId === n.id ? "bg-blue-100 dark:bg-blue-900" : ""}`}
          >
            <button className="flex-1 text-left truncate" onClick={() => onSelect(n.id)}>
              {n.children.length > 0 ? "📁" : "·"} {n.name}
            </button>
            <button onClick={() => onAddChild(n.id)} className="opacity-60 hover:opacity-100" title="자식 추가"><Plus size={12}/></button>
            <button onClick={() => onDelete(n.id, n.name)} className="opacity-60 hover:opacity-100 text-red-600" title="삭제"><Trash2 size={12}/></button>
          </div>
          {n.children.length > 0 && (
            <TreeAdmin nodes={n.children} depth={depth + 1} onSelect={onSelect} onAddChild={onAddChild} onDelete={onDelete} selectedId={selectedId}/>
          )}
        </div>
      ))}
    </div>
  );
}

function findNode(nodes: IndustryNode[], id: string): IndustryNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inner = findNode(n.children, id);
    if (inner) return inner;
  }
  return null;
}

function flattenTree(nodes: IndustryNode[], prefix = ""): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = [];
  for (const n of nodes) {
    const path = prefix ? `${prefix} / ${n.name}` : n.name;
    out.push({ id: n.id, path });
    out.push(...flattenTree(n.children, path));
  }
  return out;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
```

- [ ] **Step 2**: 검증 — 최상위·자식 산업 추가, 부모 변경, 삭제 동작. 순환 참조 시 에러 표시.

- [ ] **Step 3**: 커밋

```bash
git add apps/company-map/src/app/industries/page.tsx
git commit -m "feat(company-map): add industries tree management page"
```

### Task 20: `/industries/[id]` 상세 + 기업 매핑 추가

**Files:** Create `src/app/industries/[id]/page.tsx`

- [ ] **Step 1**: 작성

```typescript
"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { X } from "lucide-react";
import { getIndustry } from "@/actions/industries";
import { getCompaniesForIndustry, addMapping, removeMapping } from "@/actions/mappings";
import { searchCompanies } from "@/actions/companies";
import type { Industry } from "@/types/industry";
import type { Company } from "@/types/company";

export default function IndustryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [members, setMembers] = useState<Company[]>([]);
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Company[]>([]);

  async function reload() {
    const [i, m] = await Promise.all([getIndustry(id), getCompaniesForIndustry(id)]);
    setIndustry(i);
    setMembers(m);
  }
  useEffect(() => { reload(); }, [id]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (!q.trim()) { setCandidates([]); return; }
      const found = await searchCompanies(q.trim(), 10);
      if (alive) {
        const memberIds = new Set(members.map((m) => m.id));
        setCandidates(found.filter((c) => !memberIds.has(c.id)));
      }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, members]);

  if (!industry) return <div className="p-6">로딩…</div>;

  async function onAdd(companyId: string) {
    await addMapping(companyId, id);
    setQ("");
    await reload();
  }

  async function onRemove(companyId: string) {
    await removeMapping(companyId, id);
    await reload();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{industry.name}</h2>
        <Link href={`/?focus=industry:${id}`} className="border rounded px-3 py-1.5 text-sm">맵에서 보기</Link>
      </div>
      {industry.description && <p className="text-sm text-gray-500">{industry.description}</p>}

      <section className="border rounded p-3 space-y-2">
        <h3 className="font-semibold">기업 추가</h3>
        <input
          placeholder="기업명/종목코드 검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border rounded px-3 py-1.5 w-full text-sm bg-white dark:bg-gray-900"
        />
        {candidates.length > 0 && (
          <ul className="border rounded divide-y text-sm max-h-60 overflow-auto">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-3 py-1.5">
                <span>{c.name} {c.ticker && <span className="text-xs text-gray-500">{c.ticker}</span>}</span>
                <button onClick={() => onAdd(c.id)} className="text-blue-600 text-xs hover:underline">+ 추가</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border rounded p-3 space-y-2">
        <h3 className="font-semibold">매핑된 기업 ({members.length})</h3>
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">아직 매핑된 기업이 없습니다.</p>
        ) : (
          <ul className="divide-y text-sm">
            {members.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <Link href={`/companies/${c.id}`} className="hover:underline">
                  {c.name} {c.ticker && <span className="text-xs text-gray-500">{c.ticker}</span>}
                </Link>
                <button onClick={() => onRemove(c.id)} className="text-red-600 hover:opacity-80" title="매핑 제거"><X size={14}/></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2**: 검증 — 기업 추가·매핑 제거 동작 확인.

- [ ] **Step 3**: 커밋

```bash
git add apps/company-map/src/app/industries/\[id\]/
git commit -m "feat(company-map): add industry detail page with company mapping"
```

---

## Phase G — 메인 시각화

### Task 21: 그래프 노드 컴포넌트

**Files:** Create `src/components/graph/{IndustryNode,CompanyNode}.tsx`

- [ ] **Step 1**: `src/components/graph/IndustryNode.tsx`

```typescript
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type IndustryNodeData = { label: string; isFocus: boolean };

export function IndustryNode({ data }: NodeProps<{ data: IndustryNodeData; type: "industry" }>) {
  const d = (data as unknown) as IndustryNodeData;
  return (
    <div
      className={`px-3 py-1 rounded-full text-xs font-semibold border ${
        d.isFocus
          ? "bg-blue-600 text-white border-blue-300 shadow-lg shadow-blue-500/40"
          : "bg-blue-100 text-blue-800 border-blue-200"
      }`}
    >
      {d.label}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}
```

- [ ] **Step 2**: `src/components/graph/CompanyNode.tsx`

```typescript
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type CompanyNodeData = { label: string; ticker?: string | null; isFocus: boolean };

export function CompanyNode({ data }: NodeProps<{ data: CompanyNodeData; type: "company" }>) {
  const d = (data as unknown) as CompanyNodeData;
  return (
    <div
      className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 ${
        d.isFocus
          ? "bg-emerald-600 text-white border-emerald-300 shadow-lg shadow-emerald-500/40"
          : "bg-emerald-100 text-emerald-800 border-emerald-200"
      }`}
    >
      <span>● {d.label}</span>
      {d.ticker && <span className="opacity-70 text-[10px]">{d.ticker}</span>}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}
```

- [ ] **Step 3**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/components/graph/
git commit -m "feat(company-map): add industry and company graph nodes"
```

### Task 22: MapGraph (React Flow + d3-force 통합)

**Files:** Create `src/components/graph/MapGraph.tsx`

- [ ] **Step 1**: 작성

```typescript
"use client";

import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import { listIndustries } from "@/actions/industries";
import { getCompany } from "@/actions/companies";
import {
  getIndustriesForCompany,
  getCompaniesForIndustry,
} from "@/actions/mappings";
import { computeLayout, type LayoutEdge, type LayoutNode } from "@/lib/graph/layout";
import { CompanyNode } from "./CompanyNode";
import { IndustryNode } from "./IndustryNode";
import type { Industry } from "@/types/industry";
import type { Company } from "@/types/company";

const nodeTypes = { industry: IndustryNode, company: CompanyNode };

export type Focus = { type: "industry" | "company"; id: string } | null;

export type FocusNeighborhood = {
  focus: Focus;
  industries: Industry[];
  companies: Company[];
  /** 매핑 관계 (회사-산업 양방향 그릴 때 사용) */
  mappings: { companyId: string; industryId: string }[];
  /** 트리 부모/형제 (점선 엣지로 표시) */
  treeParent?: Industry | null;
  treeSiblings?: Industry[];
};

export function MapGraph({
  focus,
  onFocusChange,
  onNeighborhoodChange,
}: {
  focus: Focus;
  onFocusChange: (next: Focus) => void;
  /** 트리 동기화에 필요한 정보를 부모(메인 페이지)에 전달 */
  onNeighborhoodChange?: (n: FocusNeighborhood) => void;
}) {
  const [neighborhood, setNeighborhood] = useState<FocusNeighborhood>({
    focus: null, industries: [], companies: [], mappings: [],
  });

  // focus 바뀌면 주변 데이터 fetch
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!focus) {
        const empty: FocusNeighborhood = { focus: null, industries: [], companies: [], mappings: [] };
        if (alive) { setNeighborhood(empty); onNeighborhoodChange?.(empty); }
        return;
      }
      if (focus.type === "industry") {
        const [allIndustries, members] = await Promise.all([
          listIndustries(),
          getCompaniesForIndustry(focus.id),
        ]);
        const center = allIndustries.find((i) => i.id === focus.id);
        if (!center || !alive) return;
        const parent = center.parent_id
          ? allIndustries.find((i) => i.id === center.parent_id) ?? null
          : null;
        const siblings = parent
          ? allIndustries.filter((i) => i.parent_id === parent.id && i.id !== center.id)
          : [];
        const children = allIndustries.filter((i) => i.parent_id === center.id);
        const indSet = [center, ...(parent ? [parent] : []), ...siblings, ...children];
        const mappings = members.map((c) => ({ companyId: c.id, industryId: focus.id }));
        const next: FocusNeighborhood = {
          focus, industries: indSet, companies: members, mappings,
          treeParent: parent, treeSiblings: siblings,
        };
        setNeighborhood(next);
        onNeighborhoodChange?.(next);
      } else {
        const [center, mappedIndustries] = await Promise.all([
          getCompany(focus.id),
          getIndustriesForCompany(focus.id),
        ]);
        if (!center || !alive) return;
        const mappings = mappedIndustries.map((i) => ({ companyId: focus.id, industryId: i.id }));
        const next: FocusNeighborhood = {
          focus, industries: mappedIndustries, companies: [center], mappings,
        };
        setNeighborhood(next);
        onNeighborhoodChange?.(next);
      }
    })();
    return () => { alive = false; };
  }, [focus, onNeighborhoodChange]);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    const rfNodes: Node[] = [];
    const rfEdges: Edge[] = [];
    const layoutNodes: LayoutNode[] = [];
    const layoutEdges: LayoutEdge[] = [];

    neighborhood.industries.forEach((i) => {
      const isFocus = focus?.type === "industry" && focus.id === i.id;
      rfNodes.push({
        id: `industry-${i.id}`,
        type: "industry",
        position: { x: 0, y: 0 },
        data: { label: i.name, isFocus },
      });
      layoutNodes.push({ id: `industry-${i.id}`, type: "industry" });
    });
    neighborhood.companies.forEach((c) => {
      const isFocus = focus?.type === "company" && focus.id === c.id;
      rfNodes.push({
        id: `company-${c.id}`,
        type: "company",
        position: { x: 0, y: 0 },
        data: { label: c.name, ticker: c.ticker, isFocus },
      });
      layoutNodes.push({ id: `company-${c.id}`, type: "company" });
    });

    // mapping edges (실선)
    neighborhood.mappings.forEach((m) => {
      const id = `m-${m.companyId}-${m.industryId}`;
      rfEdges.push({
        id, source: `industry-${m.industryId}`, target: `company-${m.companyId}`,
        style: { stroke: "#10b981", strokeWidth: 1.5 },
      });
      layoutEdges.push({ source: `industry-${m.industryId}`, target: `company-${m.companyId}`, kind: "mapping" });
    });

    // tree edges (점선) — 산업 포커스인 경우 부모/형제/자식 표현
    if (focus?.type === "industry" && neighborhood.treeParent) {
      const id = `t-parent-${neighborhood.treeParent.id}`;
      rfEdges.push({
        id, source: `industry-${neighborhood.treeParent.id}`, target: `industry-${focus.id}`,
        animated: false, style: { stroke: "#64748b", strokeDasharray: "4 3" },
      });
      layoutEdges.push({ source: `industry-${neighborhood.treeParent.id}`, target: `industry-${focus.id}`, kind: "tree" });
    }

    const positioned = computeLayout(layoutNodes, layoutEdges, {
      width: 800, height: 500,
    });
    const posMap = new Map(positioned.map((p) => [p.id, p]));
    rfNodes.forEach((n) => {
      const p = posMap.get(n.id);
      if (p) n.position = { x: p.x, y: p.y };
    });
    return { nodes: rfNodes, edges: rfEdges };
  }, [neighborhood, focus]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    const [type, id] = node.id.split("-", 2);
    if (type === "industry" || type === "company") {
      onFocusChange({ type: type as "industry" | "company", id });
    }
  };

  const onNodeDoubleClick: NodeMouseHandler = (_, node) => {
    const [type, id] = node.id.split("-", 2);
    if (typeof window !== "undefined") {
      window.location.href = `/${type === "industry" ? "industries" : "companies"}/${id}`;
    }
  };

  if (!focus) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        좌측 트리에서 산업을 선택하거나 검색바로 시작하세요.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      fitView
    >
      <Background gap={16} size={1} />
      <Controls />
    </ReactFlow>
  );
}
```

- [ ] **Step 2**: 빌드·커밋

```bash
cd apps/company-map && yarn build
git add apps/company-map/src/components/graph/MapGraph.tsx
git commit -m "feat(company-map): add MapGraph with React Flow + d3-force"
```

### Task 23: 메인 페이지 `/` 통합

**Files:** Modify `src/app/page.tsx`

- [ ] **Step 1**: 메인 페이지 전체 교체

```typescript
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { IndustryTree } from "@/components/tree/IndustryTree";
import { MapGraph, type Focus, type FocusNeighborhood } from "@/components/graph/MapGraph";
import { getIndustryTree } from "@/actions/industries";
import type { IndustryNode } from "@/types/industry";
import type { Company } from "@/types/company";

const RECENT_KEY = "company-map.recentCompanies";
const RECENT_LIMIT = 10;

type RecentCompany = { id: string; name: string; ticker: string | null };

function loadRecent(): RecentCompany[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecent(c: RecentCompany) {
  if (typeof window === "undefined") return;
  const cur = loadRecent().filter((r) => r.id !== c.id);
  cur.unshift(c);
  localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_LIMIT)));
}

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tree, setTree] = useState<IndustryNode[]>([]);
  const [recents, setRecents] = useState<RecentCompany[]>([]);
  const [neighborhood, setNeighborhood] = useState<FocusNeighborhood | null>(null);

  const focus = useMemo<Focus>(() => {
    const f = searchParams.get("focus");
    if (!f) return null;
    const [type, id] = f.split(":", 2);
    if ((type === "industry" || type === "company") && id) {
      return { type, id } as Focus;
    }
    return null;
  }, [searchParams]);

  useEffect(() => {
    getIndustryTree().then(setTree);
    setRecents(loadRecent());
  }, []);

  const setFocus = useCallback((next: Focus) => {
    if (!next) router.replace("/");
    else router.replace(`/?focus=${next.type}:${next.id}`);
  }, [router]);

  // company focus 시 최근 본 기업에 추가
  useEffect(() => {
    if (focus?.type === "company" && neighborhood?.companies) {
      const c = neighborhood.companies.find((x: Company) => x.id === focus.id);
      if (c) {
        pushRecent({ id: c.id, name: c.name, ticker: c.ticker });
        setRecents(loadRecent());
      }
    }
  }, [focus, neighborhood]);

  // 트리 동기화: 그래프에서 선택된 산업과 그 조상들을 펼침
  const { selectedTreeId, expandedIds, highlightIds } = useMemo(() => {
    const expanded = new Set<string>();
    const highlight = new Set<string>();
    let selected: string | null = null;
    if (focus?.type === "industry") {
      selected = focus.id;
      // 조상 traverse를 위해 flat map 만들기
      const flat = new Map<string, IndustryNode>();
      const walk = (ns: IndustryNode[]) => ns.forEach((n) => { flat.set(n.id, n); walk(n.children); });
      walk(tree);
      let cur = flat.get(focus.id);
      while (cur) {
        expanded.add(cur.id);
        cur = cur.parent_id ? flat.get(cur.parent_id) : undefined;
      }
    } else if (focus?.type === "company" && neighborhood) {
      const flat = new Map<string, IndustryNode>();
      const walk = (ns: IndustryNode[]) => ns.forEach((n) => { flat.set(n.id, n); walk(n.children); });
      walk(tree);
      neighborhood.industries.forEach((i) => {
        highlight.add(i.id);
        let cur: IndustryNode | undefined = flat.get(i.id);
        while (cur) {
          expanded.add(cur.id);
          cur = cur.parent_id ? flat.get(cur.parent_id) : undefined;
        }
      });
    }
    return { selectedTreeId: selected, expandedIds: expanded, highlightIds: highlight };
  }, [focus, tree, neighborhood]);

  return (
    <div className="-m-3 md:-m-6 h-[calc(100vh-57px)] grid grid-cols-[260px_1fr]">
      <aside className="border-r overflow-y-auto p-3 bg-gray-50 dark:bg-gray-900 space-y-3">
        <GlobalSearch onPick={(it) => setFocus({ type: it.kind, id: it.value.id })} />
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">산업 트리</div>
          <IndustryTree
            nodes={tree}
            selectedId={selectedTreeId}
            highlightIds={highlightIds}
            expandedIds={expandedIds}
            onSelect={(id) => setFocus({ type: "industry", id })}
          />
        </div>
        {recents.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">최근 본 기업</div>
            <ul className="text-sm space-y-0.5">
              {recents.map((r) => (
                <li key={r.id}>
                  <button
                    className="w-full text-left px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => setFocus({ type: "company", id: r.id })}
                  >
                    ● {r.name} {r.ticker && <span className="text-xs text-gray-500">{r.ticker}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
      <section className="relative">
        <MapGraph focus={focus} onFocusChange={setFocus} onNeighborhoodChange={setNeighborhood} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2**: 검증 (시나리오 전체)
  1. `/industries` 에서 산업 트리 몇 개 만들기
  2. `/import` 또는 `/companies/new`로 기업 몇 개 등록
  3. `/companies/[id]` 또는 `/industries/[id]`에서 매핑 추가
  4. `/` 접속 → 사이드바 트리 표시
  5. **시나리오 A**: 트리에서 산업 클릭 → 그래프에 매핑 기업들 표시
  6. **시나리오 B**: 검색바에서 기업 선택 → 그래프 중심이 기업, 매핑 산업들 펼쳐짐, 사이드바 트리에 매핑 산업들 하이라이트
  7. **시나리오 C**: 그래프 노드 클릭 → 새 중심으로 이동. 더블클릭 → 상세 페이지. URL에 `?focus=...` 갱신·뒤로가기 동작
  8. localStorage 키 `company-map.recentCompanies` 채워짐 확인 (DevTools)

- [ ] **Step 3**: 커밋

```bash
git add apps/company-map/src/app/page.tsx
git commit -m "feat(company-map): integrate main map page with bidirectional sync"
```

---

## Phase H — 마무리

### Task 24: README + 최종 검증

**Files:** Create `apps/company-map/README.md` (선택), Modify (필요 시) `apps/company-map/.env.example`

- [ ] **Step 1**: 빈 상태 → 데이터 채우기 → 시각화의 전체 흐름을 한 번 더 수동 검증
  1. Supabase 테이블 비우고 시작
  2. `/import`로 5-10개 기업 추가
  3. `/industries`에서 트리 만들기 (예: IT > 반도체 > 메모리, 에너지 > 2차전지)
  4. `/industries/[id]`에서 기업 매핑
  5. `/`에서 양방향 탐색 동작 확인
  6. 다른 브라우저에서 `?focus=...` URL 직접 입력 → 같은 화면 복원

- [ ] **Step 2**: lint·build 최종 확인

```bash
cd apps/company-map && yarn lint && yarn build
```

- [ ] **Step 3**: (선택) 간단한 README 추가하여 setup 절차 기록

```markdown
# Company Map

산업·기업 N:M 매핑 시각화 본인용 도구.

## Setup
1. `cp .env.example .env.local` 후 Supabase URL/anon key 입력
2. `apps/company-map/supabase/migrations/0001_init.sql`을 Supabase Studio에서 실행
3. `yarn dev` (port 3004)
4. `/import` 페이지에서 KRX CSV 업로드 → `/industries`에서 트리 작성 → `/`에서 시각화

## 구조
- 데이터: Postgres(Supabase) — `industries`(self-tree), `companies`, `company_industries`(N:M)
- 시각화: React Flow + d3-force, 양방향(산업↔기업) 자유 탐색
```

- [ ] **Step 4**: 커밋

```bash
git add apps/company-map/README.md
git commit -m "docs(company-map): add setup README"
```

---

## Self-Review 결과

**1. 스펙 커버리지 확인:**

| Spec section | 구현 task |
|---|---|
| §1.1 시나리오 A (산업→기업) | Task 22, 23 |
| §1.1 시나리오 B (기업→산업) | Task 22, 23 |
| §1.1 시나리오 C (양방향 자유) | Task 22 (`onNodeClick`) |
| §2.1 industries / companies / company_industries 스키마 | Task 3 |
| §3 라우트 / | Task 23 |
| §3 라우트 /companies, /companies/new, /companies/[id] | Task 16, 17, 18 |
| §3 라우트 /industries, /industries/[id] | Task 19, 20 |
| §3 라우트 /import | Task 10 |
| §3.1 사이드바 트리 + 그래프 + 최근 본 기업 | Task 14, 22, 23 |
| §3.2 그래프 클릭=새 중심 / 더블클릭=상세 / 트리↔그래프 동기화 / 검색바 / URL 동기화 | Task 22, 23 |
| §3.2 localStorage 최근 본 기업 | Task 23 |
| §4.1 CSV import 흐름 | Task 9, 10 |
| §4.2 산업 트리 구축 + 순환 참조 검증 | Task 6, 19 |
| §4.3 매핑 진입점 3곳 (industries[id], companies[id], 메인 그래프 우클릭) | Task 18, 20, **그래프 우클릭 메뉴 미구현** ← 아래 참고 |
| §4.4 새 기업 추가 폼 | Task 17 |
| §5 라이브러리 | Task 1 (설치) + 각 사용처 |
| §6 디렉토리 구조 | 파일 구조 표 |
| §7 Supabase 설정 | Task 2, 3 |
| §8 범위 밖 (테스트·인증·가중치 등) | 명시적 미구현 |

**2. 누락 사항:**
- spec §4.3·§3.2의 "메인 그래프 노드 우클릭 컨텍스트 메뉴 → 매핑 추가/제거"는 이번 plan에서 제외했습니다. 매핑 편집은 `/industries/[id]`와 `/companies/[id]` 두 진입점만으로 충분히 가능하며, 그래프 컨텍스트 메뉴는 구현 부담 대비 가치가 낮아 후속 작업으로 미룹니다. **이 절충은 spec과 다소 차이가 있으므로 사용자에게 확인 필요**.

**3. Placeholder 스캔:** "TBD"/"TODO"/추상 지시 없음. 모든 코드 실체화.

**4. 타입 일관성:**
- `Focus`(MapGraph), `FocusNeighborhood`(MapGraph) ↔ HomePage에서 동일 타입 import
- `Industry`/`Company`/`IndustryNode` 일관됨
- Server Action 시그니처 일관됨 (`createIndustry({name, parent_id, description})` 등)

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-29-company-map.md](2026-04-29-company-map.md).

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fastest iteration

**2. Inline Execution** — execute tasks in this session with checkpoint reviews

Which approach?
