# Company Map — 산업·기업 시각화 앱 설계 문서

**Date**: 2026-04-29
**App**: `apps/company-map` (port 3004)
**Status**: Design approved, ready for implementation plan

## 1. 개요

산업과 기업 간의 N:M 매핑을 다단계 트리와 부분 네트워크 그래프로 양방향 탐색하는 **본인용 투자·리서치 도구**. 사용자가 산업에서 시작하면 그 산업에 속한 기업들을, 기업에서 시작하면 그 기업이 속한 산업들을 볼 수 있다.

### 1.1 핵심 사용자 시나리오

- **시나리오 A — 산업 → 기업**: 좌측 트리에서 "메모리"를 클릭 → 우측 그래프에 메모리 산업이 중심에 배치되고, 매핑된 기업(삼성전자, SK하이닉스, …)들이 주변으로 펼쳐짐.
- **시나리오 B — 기업 → 산업**: 검색바에 "LG에너지솔루션"을 입력 → 그래프에 LG엔솔이 중심에 배치되고, 매핑된 산업(2차전지, ESS)들이 주변으로 펼쳐짐. 사이드바 트리도 해당 산업들이 자동으로 펼쳐지고 하이라이트됨.
- **시나리오 C — 양방향 자유 이동**: 그래프에서 어떤 노드든(산업이든 기업이든) 클릭하면 그 노드가 새로운 중심이 됨. 양방향 무한 탐색.

### 1.2 비기능 요구사항

- **데이터 규모**: 산업 수백 개 / 기업 1,000개 이상까지 감당
- **인증**: 없음 (anon key 단일로 풀 접근, 본인용)
- **타깃 디바이스**: 데스크톱 우선. 모바일은 트리·리스트 뷰로 fallback (그래프 인터랙션 최적화는 범위 밖)

## 2. 데이터 모델

### 2.1 스키마 (Prisma + SQLite)

`apps/company-map/prisma/schema.prisma`:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL") // 예: "file:./data/company-map.db"
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
  ticker      String?  @unique               // nullable: 비상장사도 등록 가능
  market      String?                        // 'KOSPI' | 'KOSDAQ' | NULL
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt       @map("updated_at")
  industryMappings CompanyIndustry[]

  @@index([name])
  @@map("companies")
}

// 매핑: 다대다, 가중치 없음
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

### 2.2 모델링 결정

- **다단계 트리**: `parentId` self-reference로 깊이 제한 없음. 너무 깊어지지 않도록 운영으로 관리.
- **N:M 매핑**: 가중치(주력/부가) 없음. YAGNI — 필요해지면 컬럼 추가로 점진적 도입 가능.
- **자유 매핑**: 기업은 산업 트리의 어느 레벨에든 매핑 가능 (잎 노드 강제 X).
- **외부 의존성 0**: SQLite single-file DB. 별도 서버·인증 레이어 불필요. anon key, RLS 모두 미사용.
- **삭제 정책**: 산업 삭제 시 자식 산업과 매핑이 Prisma의 `onDelete: Cascade`로 함께 삭제. UI에서 명시적 확인 필요.
- **PRAGMA foreign_keys=ON**: SQLite는 default off — Prisma가 connection 시 자동으로 켜줌.
- **timestamps**: Prisma는 `DateTime`(JS `Date` 객체)로 반환. 도메인 type은 `string` (ISO) 유지하기 위해 server action에서 `toISOString()` 변환 후 client에 전달.

## 3. 화면 / 라우트

| 경로 | 역할 | 렌더링 |
|------|------|--------|
| `/` | 메인 — 사이드바 트리 + 부분 네트워크 그래프 | Client (그래프 인터랙션) + Server prefetch |
| `/companies` | 기업 리스트 (검색·페이지네이션·삭제). 수정은 `/companies/[id]`에서 | Server |
| `/companies/new` | 기업 추가 폼 | Server (form) + Server Action |
| `/companies/[id]` | 기업 상세 — 매핑된 산업 표시·편집 | Server |
| `/industries` | 산업 트리 관리 (추가/이동/삭제) | Server (form) + Server Action |
| `/industries/[id]` | 산업 상세 — 속한 기업 리스트 + 매핑 추가 | Server |
| `/import` | CSV 일괄 업로드 (초기 시드) | Client (파일 업로드/미리보기) + Server Action |

### 3.1 메인 화면 (`/`) 구조

```
┌────────────────────────────────────────────────────────┐
│ Header: Company Map · 통합 검색바 · Import · Settings  │
├──────────┬─────────────────────────────────────────────┤
│ Sidebar  │ Main Graph Panel                            │
│ (300px)  │   - 선택된 노드를 중심으로 force layout     │
│          │   - 산업 노드: 파란색 / 기업 노드: 초록색   │
│ 산업 트리│   - 부모/형제 산업: 점선 엣지               │
│  (재귀)  │   - 매핑된 기업: 실선 엣지                  │
│          │   - 클릭: 새 중심 / 더블클릭: 상세 페이지   │
│ 최근 본  │   - 우클릭: 매핑 추가/편집 컨텍스트 메뉴    │
│ 기업     │                                             │
│          │ Bottom Info: 선택 노드 메타정보 + 액션      │
└──────────┴─────────────────────────────────────────────┘
```

### 3.2 인터랙션 명세

- **그래프 노드 클릭** → 그 노드가 새로운 중심. URL의 `focus` 파라미터 갱신 (`/?focus=industry:abc-123`).
- **그래프 노드 더블클릭** → 해당 노드의 상세 페이지로 이동.
- **사이드바 트리 노드 클릭** → 그래프 중심 이동 (선택 동기화).
- **그래프 노드 선택 시 트리 동기화 (역방향)**:
  - 산업 노드 선택 시: 그 산업과 모든 조상 노드를 펼치고, 해당 노드를 하이라이트
  - 기업 노드 선택 시: 그 기업이 매핑된 모든 산업과 그 조상들을 펼치고, 매핑된 산업들을 하이라이트
- **검색바 입력** → 산업+기업 통합 자동완성 (cmdk). 선택 시 해당 노드를 중심으로 이동.
- **노드 우클릭 (또는 노드 옆 ⋯)** → "매핑 추가/제거", "편집", "삭제" 컨텍스트 메뉴.
- **URL 동기화** → `/?focus=<type>:<id>` 형태로 현재 중심 저장 (북마크·뒤로가기 지원).
- **사이드바 "최근 본 기업"** → 그래프에서 중심에 두었던 기업 노드 최근 10개. **localStorage**에 저장 (DB 사용 X, 본인용·단일 브라우저).

## 4. 데이터 입력 워크플로우

### 4.1 초기 시드 — `/import` (한 번만 실행)

KRX(한국거래소) 상장사 CSV를 일괄 업로드해서 기업 풀을 채움. 산업 트리와 매핑은 비어있는 상태에서 시작.

**예상 CSV 컬럼**:
```
ticker, name, market
005930, 삼성전자, KOSPI
000660, SK하이닉스, KOSPI
373220, LG에너지솔루션, KOSPI
```

**처리 흐름**:
1. 파일 업로드 (papaparse로 클라이언트 1차 파싱)
2. 미리보기 — 컬럼 매핑 확인 (ticker / name / market)
3. 서버 액션으로 Supabase에 일괄 insert
   - `ticker` 충돌 시 skip (이미 등록된 종목)
   - `ticker` 없는 행도 허용 (비상장사)
4. 결과 요약 표시 (신규 / skip / 오류 건수)

### 4.2 산업 트리 구축 — `/industries`

처음에는 트리가 비어있는 상태. 본인이 큰 섹터부터 만들어 채움.

**UI**:
- 좌측 트리: 재귀 들여쓰기, 펼치기/접기, 각 노드에 `+` 버튼
- 우측 폼: 선택된 노드의 이름·설명·부모 변경
- 우클릭 메뉴: 이름 변경 / 부모 이동 / 삭제

**검증**:
- 부모 변경 시 순환 참조 검증 (자기 자신의 자손으로는 못 옮김)
- 산업 삭제 시 자식·매핑 영향도 표시 후 명시적 확인

### 4.3 매핑 작업

매핑 추가·제거 진입점이 세 군데 (양방향 모두에서 자연스럽게):

1. **`/industries/[id]`** — "이 산업에 기업 추가" → 기업 자동완성
2. **`/companies/[id]`** — "이 기업에 산업 추가" → 산업 트리 picker (다중 선택)
3. **메인 그래프 우클릭 메뉴** — 자동완성으로 매핑 추가

각 매핑 항목에 `×` 버튼으로 제거.

### 4.4 새 기업 추가 — `/companies/new`

CSV에 없는 기업(비상장사·신규 IPO·테마주)을 직접 추가하는 폼:
- 이름 (필수)
- 종목코드 (선택, unique)
- 시장 (선택)
- 한 줄 설명 (선택)
- 산업 매핑 (그 자리에서 트리 picker로 추가 가능)

## 5. 기술 스택

### 5.1 베이스 (이미 세팅됨)

- Next.js 16.1.6 (App Router) + React 19.2
- Tailwind CSS v4
- TypeScript 5

### 5.2 데이터 / DB

| 패키지 | 용도 | 비고 |
|--------|------|------|
| `prisma` (dev) | 마이그레이션·생성기 | `apps/api`와 동일 패턴 |
| `@prisma/client` | 런타임 ORM 클라이언트 | type-safe query, generated from schema |
| `@prisma/adapter-better-sqlite3` (또는 SQLite native driver) | SQLite 드라이버 | 단일 파일 DB |

### 5.3 UI / 그래프 / 검색

| 패키지 | 용도 |
|--------|------|
| `@xyflow/react` | 그래프 시각화 (React Flow) |
| `d3-force` | 그래프 force layout 계산 |
| `papaparse` | CSV 파싱 (한국어 인코딩 처리) |
| `cmdk` | 통합 검색 자동완성 |
| `lucide-react` | 아이콘 |

### 5.4 명시적으로 배제하는 것

- **외부 DB 의존**: Supabase·Postgres·클라우드 SQLite (Turso 등) 모두 미사용 — 100% 로컬
- **인증·세션 관리**: 본인용 도구이므로 anon key·RLS·login 미구현
- **트리 라이브러리**: 자체 구현 (재귀 컴포넌트로 충분)
- **드래그&드롭**: 폼 picker로 대체
- **상태 관리 라이브러리**: URL query param + React state로 충분
- **외부 데이터 자동 fetch**: DART API 연동·시총 자동 갱신 범위 밖

### 5.5 데이터 페칭 / 상태 관리 정책

- 리스트·상세 페이지: **Server Components** + Server Actions로 mutation 후 `revalidatePath()`
- 메인 그래프(`/`): **Client Component** (인터랙션 무거움). 모든 DB 조회는 Server Action을 호출 (브라우저에서 SQLite 직접 접근 불가)
- 검색·중심 노드: **URL query param**에 저장 (북마크·뒤로가기)
- 그 외 UI 상태: 컴포넌트 로컬 `useState`/`useReducer`

## 6. 디렉토리 구조 (목표)

```
apps/company-map/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # 메인 (그래프)
│   │   ├── layout.tsx                # 이미 있음
│   │   ├── globals.css               # 이미 있음
│   │   ├── companies/
│   │   │   ├── page.tsx              # 리스트
│   │   │   ├── new/page.tsx          # 추가 폼
│   │   │   └── [id]/page.tsx         # 상세
│   │   ├── industries/
│   │   │   ├── page.tsx              # 트리 관리
│   │   │   └── [id]/page.tsx         # 상세
│   │   └── import/page.tsx           # CSV 업로드
│   ├── actions/
│   │   ├── companies.ts              # CRUD server actions
│   │   ├── industries.ts
│   │   ├── mappings.ts               # 매핑 add/remove
│   │   └── import.ts                 # CSV 일괄 import
│   ├── components/
│   │   ├── graph/
│   │   │   ├── MapGraph.tsx          # React Flow + d3-force 통합
│   │   │   ├── IndustryNode.tsx
│   │   │   └── CompanyNode.tsx
│   │   ├── tree/
│   │   │   ├── IndustryTree.tsx      # 재귀 사이드바 트리
│   │   │   └── IndustryPicker.tsx    # 폼용 트리 picker
│   │   ├── search/
│   │   │   └── GlobalSearch.tsx      # cmdk 기반
│   │   └── layout/
│   │       ├── Header.tsx
│   │       └── Sidebar.tsx
│   ├── lib/
│   │   ├── db.ts                     # Prisma client singleton (server-only)
│   │   ├── csv/parser.ts             # papaparse 래퍼
│   │   └── graph/layout.ts           # d3-force layout 계산
│   └── types/
│       ├── industry.ts
│       ├── company.ts
│       └── mapping.ts
└── prisma/
    ├── schema.prisma                 # §2.1 스키마
    ├── migrations/                   # prisma migrate dev로 생성
    └── (data/company-map.db)         # SQLite 파일 (gitignored)
```

## 7. DB 설정 (Prisma + SQLite)

- DB 파일 위치: `apps/company-map/data/company-map.db` (또는 `prisma/dev.db`). git 제외.
- 환경변수 (`apps/company-map/.env.local`):
  ```
  DATABASE_URL="file:../data/company-map.db"
  ```
  (`schema.prisma` 위치 기준 상대경로. Prisma 관례)
- 첫 실행:
  ```
  yarn workspace company-map prisma migrate dev --name init
  yarn workspace company-map prisma generate
  ```
- 마이그레이션 변경 시 `prisma migrate dev --name <change>` 추가. SQL 직접 작성 불필요.
- 인증/RLS 없음 — DB 파일에 접근 가능한 사람이 모든 권한.
- 백업: DB 파일 자체를 복사 (단일 파일).

## 8. 범위 밖 (Out of Scope)

명시적으로 이번 구현에 포함하지 않는 것:

- 사용자 인증 / 회원 가입 / 로그인
- RLS / 권한 분리 / 다중 사용자 데이터 격리
- 매핑 가중치 (주력/부가)
- 시총·재무 데이터 자동 갱신
- DART API 자동 fetch (검색 → 자동 등록)
- 모바일 그래프 인터랙션 최적화 (모바일은 트리·리스트로 fallback)
- 산업 부모 변경 드래그&드롭 (폼 picker로 대체)
- 단위·통합·E2E 테스트 (본인용 도구이므로 일단 수동 검증, 추후 필요 시 추가)
- 차트 / 통계 대시보드 (산업별 기업 수 같은 집계 시각화)

## 9. 결정 요약 (브레인스토밍에서 합의된 것들)

| 결정 | 선택 |
|------|------|
| 사용 맥락 | 본인용 투자·리서치 도구 (인증 X) |
| 산업 구조 | 다단계 트리 (parent_id self-reference, 깊이 제한 없음) |
| 기업↔산업 매핑 | 자유 매핑 / 다대다 / 가중치 없음 |
| 데이터 규모 | 대규모 (산업 수백 / 기업 1,000개+) |
| 메인 시각화 | 사이드바 트리 + 부분 force-directed 네트워크 그래프 |
| 양방향 탐색 | 트리·검색·그래프 노드 클릭 모두를 진입점으로 |
| 데이터 입력 | KRX CSV 일괄 import + UI 매핑 (DART 연동 X) |
| 저장소 | Prisma + SQLite 단일 파일 (외부 의존성 0) |
| 그래프 라이브러리 | React Flow (`@xyflow/react`) + d3-force |

## 10. 변경 이력

- **2026-04-29 v1**: 초기 design (Supabase 기반).
- **2026-04-29 v2**: DB layer를 Supabase → Prisma + SQLite로 변경. 100% 로컬 도구 목표. RLS·anon key 패턴 제거. §2, §5, §6, §7, §9 갱신. 그 외 기능·UX 결정은 모두 동일 유지.
