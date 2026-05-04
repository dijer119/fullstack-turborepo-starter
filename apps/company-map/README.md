# Company Map

산업·기업 N:M 매핑 시각화 본인용 도구.

## Setup
1. `cp .env.example .env.local` 후 Supabase URL/anon key 입력
2. `apps/company-map/supabase/migrations/0001_init.sql`과 `0002_rls.sql`을 Supabase Studio에서 실행
3. `yarn dev` (port 3004)
4. `/import` 페이지에서 KRX CSV 업로드 → `/industries`에서 트리 작성 → `/`에서 시각화

## 구조
- 데이터: Postgres(Supabase) — `industries`(self-tree), `companies`, `company_industries`(N:M)
- 시각화: React Flow + d3-force, 양방향(산업↔기업) 자유 탐색
