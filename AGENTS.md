# AGENTS.md

이 파일은 Codex가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 프로젝트 개요

Turborepo 기반의 **프로덕션 환경 지원 풀스택 TypeScript 모노레포**입니다. 원래는 NestJS 백엔드 + Next.js 프론트엔드 스타터로 출발했으나, 현재는 **5개의 앱**이 공존하는 개인용 워크스페이스로 확장되었습니다. 각 앱은 독립적으로 개발·배포되며 서로 다른 라우터·DB·테스트 스택을 사용합니다.

**앱 목록 (포트):**

| 앱 | 포트 | 스택 | 라우터 | DB / 데이터 | 테스트 |
|----|------|------|--------|-------------|--------|
| `api` | 3001 | NestJS + Prisma + GraphQL + Swagger | — | PostgreSQL (Supabase) | Jest |
| `web` | 3000 | Next.js 15 + Redux Toolkit Query + MUI v7 | **Pages** | api 경유 | Jest |
| `company-map` | 3004 | Next.js 16 + Prisma + React Flow + Recharts | **App** | **SQLite 단일 파일** | **Vitest** |
| `blog-collection` | 3002 | Next.js 16 + Supabase + RSS | **App** | Supabase + 로컬 `data/` | — |
| `todo` | 3003 | Next.js + Redux Toolkit | **Pages** | (클라이언트) | — |

> ⚠️ 라우터·테스트 스택이 앱마다 다릅니다. `web`/`todo`는 Pages Router + Jest, `company-map`/`blog-collection`은 App Router이며 `company-map`은 Vitest를 씁니다. 작업 전 해당 앱의 규약을 먼저 확인하세요.

**핵심 기술:**
- **모노레포**: Turborepo v2.3 + Yarn Workspaces (npm/yarn 혼용 — root는 yarn@1.22)
- **백엔드**: NestJS v10.4 + Prisma v6.1 + PostgreSQL + GraphQL + Swagger
- **프론트엔드**: Next.js v15 + React v19 + Redux Toolkit Query v2.5 + Material-UI v7 (web/todo는 v15, company-map/blog-collection은 **v16**)
- **company-map**: Next.js 16 App Router + Prisma(SQLite) + Tailwind v4 + React Flow/d3-force + DART/KRX 데이터 파이프라인 + 백그라운드 worker
- **테스팅**: Jest v29 (api/web) · Vitest (company-map) + Testing Library
- **DevOps**: Docker + Nginx + NPS 자동화

## 아키텍처

### 모노레포 구조

```
apps/
├── api/              # NestJS 백엔드 (포트 3001)
│   ├── src/
│   │   ├── config/   # Joi를 사용한 환경변수 검증
│   │   ├── persistence/  # 전역 Prisma 서비스
│   │   ├── users/    # 도메인 모듈 (controller + service + resolver + DTOs)
│   │   ├── companies/
│   │   ├── telegram/
│   │   ├── stock/
│   │   ├── krx/      # KRX 종목 데이터
│   │   ├── intrinsic-value/  # 내재가치 계산
│   │   ├── todos/
│   │   └── main.ts   # HMR, Swagger, CORS가 포함된 부트스트랩
│   ├── prisma/
│   │   └── schema.prisma  # 데이터베이스 스키마
│   └── test/         # E2E 테스트
└── web/              # Next.js 프론트엔드 (포트 3000)
    ├── pages/        # Pages Router (App Router 아님)
    │   ├── _app.tsx  # Redux Provider + Material-UI 테마
    │   └── api/      # 서버리스 API 라우트
    ├── src/
    │   ├── screens/  # 페이지 컴포넌트
    │   ├── store/    # Redux 스토어 + API 슬라이스
    │   └── components/
    └── tailwind.config.js
├── company-map/      # 산업·기업 매핑 + 주식 분석 도구 (포트 3004, App Router)
│   ├── src/app/      # App Router 페이지 (map, stocks, ncav, trade, industries, calculator, top-stocks, import 등)
│   ├── src/actions/  # Server Actions (companies, mappings, ncav, ratings, etf, watchlist, vip-holdings…)
│   ├── src/lib/      # dart/, stocks/, trade/, graph/, etf/, csv/, links/ — 도메인 로직 + 단위 테스트
│   ├── worker/       # 백그라운드 데이터 수집 루프 (tsx 실행)
│   ├── scripts/      # 일회성 리프레시·디버그 스크립트 (tsx)
│   └── prisma/       # SQLite 스키마 + data/company-map.db
├── blog-collection/  # RSS 블로그 수집기 (포트 3002, App Router + Supabase)
└── todo/             # Todo 앱 (포트 3003, Pages Router + Redux)

packages/
├── tsconfig/         # 공유 TS 설정 (base, nextjs, nestjs, react-library)
├── config/           # ESLint, Tailwind, Nginx 설정
└── ui/               # 공유 React 컴포넌트
```

### 백엔드 아키텍처 (NestJS)

**도메인 주도 설계**: 각 도메인은 다음으로 구성됩니다:
- `*.module.ts` - NestJS 모듈 등록
- `*.controller.ts` - Swagger 문서가 포함된 REST 엔드포인트
- `*.service.ts` - 비즈니스 로직
- `*.resolver.ts` - GraphQL 리졸버 (코드 우선 방식)
- `dto/` - class-validator를 사용한 데이터 전송 객체

**핵심 패턴:**
- **전역 모듈**: `PersistenceModule` (Prisma)이 `@Global()` 데코레이터를 통해 모든 도메인에 주입됨
- **환경변수 검증**: `config/environment-variables.ts`의 Joi 스키마가 시작 시 환경변수 검증
- **하이브리드 API**: 동일한 애플리케이션에서 GraphQL (Apollo Server) + REST (Swagger) 지원
- **데이터베이스**: Prisma를 사용하며 커넥션 풀링(Supabase 포트 6543)과 직접 연결(마이그레이션용 포트 5432) 지원

**중요 파일:**
- [apps/api/src/main.ts](apps/api/src/main.ts) - 애플리케이션 부트스트랩
- [apps/api/src/app.module.ts](apps/api/src/app.module.ts) - 루트 모듈
- [apps/api/src/persistence/persistence.service.ts](apps/api/src/persistence/persistence.service.ts) - Prisma 클라이언트
- [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma) - 데이터베이스 스키마

### 프론트엔드 아키텍처 (Next.js)

**Pages Router** (현재 App Router는 사용하지 않음):
- `pages/` - 파일 기반 라우팅
- `pages/_app.tsx` - 전역 프로바이더 (Redux, Material-UI, Emotion 캐시)
- `pages/_document.tsx` - SSR이 포함된 커스텀 HTML 문서
- `src/screens/` - 페이지 컴포넌트
- `src/components/` - 재사용 가능한 UI

**상태 관리**:
- GraphQL 베이스 쿼리를 사용한 Redux Toolkit Query
- API 슬라이스: `usersApi`, `stockApi`, `intrinsicValueApi` 등
- 에러 핸들링이 포함된 커스텀 `graphqlBaseQuery.ts`
- 타입 안전 훅: `useAppDispatch`, `useAppSelector`

**스타일링**:
- 커스텀 핀테크 테마를 사용한 Tailwind CSS
- Emotion과 함께 사용하는 Material-UI v7
- 컴포넌트 라이브러리를 위한 공유 `ui` 패키지

**중요 파일:**
- [apps/web/pages/_app.tsx](apps/web/pages/_app.tsx) - 전역 프로바이더
- [apps/web/src/store/index.ts](apps/web/src/store/index.ts) - Redux 스토어
- [apps/web/next.config.js](apps/web/next.config.js) - API 프록시가 포함된 Next.js 설정
- [apps/web/tailwind.config.js](apps/web/tailwind.config.js) - Tailwind 설정

### company-map 아키텍처 (가장 활발히 개발 중)

산업·기업 N:M 매핑 시각화 + 한국 주식 분석 본인용 도구입니다. **`api`/`web`과 완전히 독립**이며, App Router · SQLite · Vitest를 사용합니다.

**데이터 계층 (중요):**
- **SQLite 단일 파일 DB** — `apps/company-map/data/company-map.db`. 외부 의존성 0. 백업은 파일 복사로 끝.
- **별도 Prisma 클라이언트** — `schema.prisma`의 `output`이 `node_modules/@prisma-clients/company-map`로 지정됨. `api`의 Prisma 클라이언트와 분리되어 있으므로 스키마 변경 후 **반드시 해당 앱에서 generate** 해야 함. (`api`/`company-map` 모두 `postinstall: prisma generate`가 있어 `yarn install` 시에는 자동 생성됨)
- Server Actions(`src/actions/`)에서 직접 DB 접근. NestJS API를 경유하지 않음.

**데이터 파이프라인:**
- `src/lib/dart/` — DART 공시 API 연동 (공시목록, 재무제표, 지분, 영업이익 등). 루트 `.mcp.json`의 DART MCP 서버와는 별개로 앱 내부에서 직접 호출.
- `src/lib/stocks/` — 네이버 스크래핑, 내재가치(intrinsic value), NCAV, 가격 이력 분석.
- `src/lib/trade/` — 관세청 수출입 무역 데이터.
- `worker/` — `tsx`로 실행되는 백그라운드 루프(2분 주기). KRX 종목 로드 → 종목 분석 → 무역 동기화. 메인 루프와 별개로 가격 변동(`price-change-loop`)·ETF PDF(`etf-pdf-loop`) 루프가 동시 실행됨. **NCAV·재무 전종목 배치는 DART 일일 한도를 크게 소비하므로 자동 루프에서 제외**되어 있고 `/stocks` "데이터 업데이트" 메뉴에서 수동 실행함 (refresh kind: `ncav_financials`).
- `scripts/` — 개별 종목 리프레시·디버그용 일회성 `tsx` 스크립트.

**핵심 파일:**
- [apps/company-map/prisma/schema.prisma](apps/company-map/prisma/schema.prisma) - SQLite 스키마 (단일 source of truth)
- [apps/company-map/worker/index.ts](apps/company-map/worker/index.ts) - 백그라운드 수집 루프
- [apps/company-map/README.md](apps/company-map/README.md) - 셋업·백업·마이그레이션 가이드

## 개발 명령어

**모든 명령어는 NPS를 사용합니다** - 먼저 전역 설치가 필요: `npm i -g nps`

### 초기 설정
```bash
nps prepare          # web + api + todo 의존성 설치 + Docker + Prisma 마이그레이션 (한 번만 실행)
```
> `nps prepare`는 web/api/todo만 다룹니다. `company-map`/`blog-collection`은 각 앱 README에 따라 별도로 셋업하세요 (company-map은 `yarn workspace company-map prisma migrate dev` 등).

### 개발
```bash
nps dev                          # turbo run dev — 모든 앱 동시 시작
yarn workspace web dev           # 프론트엔드만 (3000)
yarn workspace api dev           # 백엔드만 (3001)
yarn workspace company-map dev   # company-map만 (3004)
yarn workspace company-map worker      # 백그라운드 수집 루프
yarn workspace company-map worker:once # 1회만 실행
```

### 빌드 · 린트
```bash
nps build           # Turborepo가 모든 앱/패키지 빌드
yarn lint           # turbo run lint — 모든 앱 린트
yarn workspace <app> lint   # 개별 앱 린트
```

### 테스팅
```bash
nps test            # web + api + todo 테스트 실행
nps test.web        # 프론트엔드 테스트만 (Jest)
nps test.api        # 백엔드 테스트만 (Jest)
nps test.todo       # todo 테스트만
nps test.ci         # CI 모드 (web + api + todo)

# company-map은 NPS에 포함되지 않음 — Vitest를 직접 실행
yarn workspace company-map test          # 1회 실행
yarn workspace company-map test:watch    # watch 모드
yarn workspace company-map vitest run src/lib/dart/financial.test.ts  # 단일 파일

# 개별 앱 watch 모드 (Jest)
cd apps/web && yarn test:watch
cd apps/api && yarn test:watch
cd apps/api && yarn test:e2e     # E2E 테스트만
```

### 데이터베이스 관리
```bash
nps prisma.generate      # 두 클라이언트 모두 생성 (api: PostgreSQL + company-map: SQLite)
nps prisma.migrate.dev   # api 마이그레이션 생성 및 실행
nps prisma.studio        # api 데이터베이스 GUI 열기
cd apps/api && yarn db:seed  # api 데이터베이스 시드

# company-map (별도 SQLite DB + 별도 Prisma 클라이언트)
yarn workspace company-map prisma migrate dev --name <change>
yarn workspace company-map prisma generate
```

### api 데이터 스크립트 (KRX/EPS)
```bash
cd apps/api
yarn krx:update           # KRX 종목 데이터 갱신
yarn krx:update:full      # KRX 갱신 + EPS 데이터 수집
yarn krx:safety-margins   # 안전마진 계산 (data/all_safety_margin_results.json)
yarn eps:fetch            # EPS 데이터 수집
```
> `nps prisma.generate`는 `api`(PostgreSQL)와 `company-map`(SQLite) **두 개의 분리된 Prisma 클라이언트**를 생성합니다. `company-map` 스키마를 바꿨다면 해당 앱 기준으로 migrate/generate 해야 합니다.

### Docker
```bash
nps docker.build        # 모든 이미지 빌드
nps docker.build.web    # web 이미지 빌드
nps docker.build.api    # api 이미지 빌드
docker compose up -d    # PostgreSQL + Nginx 시작
```

## 환경 변수

### 백엔드 (apps/api/.env)

**필수:**
```bash
DATABASE_URL="postgresql://user:password@host:6543/db?pgbouncer=true"  # 커넥션 풀링
DIRECT_URL="postgresql://user:password@host:5432/db"  # 마이그레이션
```

**선택:**
```bash
TELEGRAM_API_ID=<숫자>
TELEGRAM_API_HASH=<문자열>
TELEGRAM_SESSION_STRING=<문자열>
TELEGRAM_CHANNELS=<쉼표로 구분>
GEMINI_API_KEY=<문자열>
SUPABASE_URL=<문자열>
SUPABASE_KEY=<문자열>
NODE_ENV=development
PORT=3001
```

**데이터베이스 옵션:**
1. **로컬 Docker**: `.env.example` 복사 (docker-compose PostgreSQL 사용)
2. **Supabase** (권장): `.env.supabase.example` 복사 후 Supabase 자격증명 입력

### 프론트엔드 (apps/web/.env)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NODE_ENV=development

# Supabase 클라이언트 사용 시
NEXT_PUBLIC_SUPABASE_URL=<문자열>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<문자열>
```

## 주요 아키텍처 결정사항

### Turborepo v2.x 설정

**중요**: 이 프로젝트는 Turborepo v2.x 문법을 사용합니다 (`pipeline` 대신 `tasks`)

```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": { "cache": false, "persistent": true }
  }
}
```

### Prisma 데이터베이스 전략

**Supabase 사용 시 두 개의 연결 URL 필요:**
- `DATABASE_URL` (포트 6543): 애플리케이션 쿼리용 커넥션 풀링
- `DIRECT_URL` (포트 5432): 마이그레이션 전용 직접 연결

**이유**: Supabase는 커넥션 풀링에 PgBouncer를 사용하지만, 마이그레이션은 데이터베이스 직접 액세스가 필요합니다.

**커넥션 풀링 모드**: Supabase 대시보드에서 **Transaction** 모드로 설정 (`Database` > `Connection pooling`)

### GraphQL + REST 하이브리드 API

**GraphQL:**
- `@nestjs/graphql`을 사용한 코드 우선 방식
- `apps/api/src/schema.gql`에 자동 생성된 스키마
- GraphQL Playground: `http://localhost:3001/graphql`
- `*.resolver.ts` 파일의 리졸버

**REST:**
- `@Controller()` 데코레이터를 사용한 컨트롤러
- Swagger 문서: `http://localhost:3001/docs`
- class-validator를 사용한 DTO 검증

### Redux Toolkit Query 패턴

**API 슬라이스 구조:**
```typescript
// apps/web/src/store/services/users-api.ts
export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery: graphqlBaseQuery(),  // 커스텀 GraphQL 베이스 쿼리
  endpoints: (builder) => ({
    getUsers: builder.query({ query: gqlQuery }),
    createUser: builder.mutation({ query: gqlMutation })
  })
});

export const { useGetUsersQuery, useCreateUserMutation } = usersApi;
```

### Nginx를 사용한 네트워크 아키텍처

```
외부 요청 (포트 80)
    ↓
Nginx 리버스 프록시
    ↓
┌─────────────────┬─────────────────┐
│  Next.js        │  NestJS         │
│  localhost:3000 │  localhost:3001 │
└─────────────────┴─────────────────┘
         ↓                ↓
    Material-UI      PostgreSQL
    Redux Store      (Prisma 사용)
```

**Nginx 라우트:**
- `/` → `localhost:3000` (프론트엔드)
- `/api/*` → `localhost:3001/*` (백엔드 API)

## 테스팅 전략

### 백엔드 테스트 (NestJS + Jest)

**테스트 유형:**
1. **유닛 테스트**: 소스와 함께 위치한 `*.spec.ts` 파일
2. **E2E 테스트**: `test/*.e2e-spec.ts` 파일
3. **통합 테스트**: `test/*-integration.e2e-spec.ts` 파일

**단일 테스트 실행:**
```bash
cd apps/api
yarn test src/users/users.service.spec.ts
yarn test:e2e test/users.e2e-spec.ts
```

**설정**: `apps/api/package.json`의 jest 설정 참조

### 프론트엔드 테스트 (Next.js + Jest + Testing Library)

**테스트 환경**: Next.js 전용 설정이 포함된 jsdom

**단일 테스트 실행:**
```bash
cd apps/web
yarn test src/components/Button.test.tsx
```

**설정**: `next/jest`를 사용한 `apps/web/jest.config.js`

## 따라야 할 주요 패턴

### 새 도메인 모듈 추가 (백엔드)

1. 모듈 디렉토리 생성: `apps/api/src/my-domain/`
2. 모듈 생성: `cd apps/api && nest g module my-domain`
3. 컨트롤러 생성: `nest g controller my-domain`
4. 서비스 생성: `nest g service my-domain`
5. GraphQL 필요 시 리졸버 추가: `nest g resolver my-domain`
6. class-validator 데코레이터를 사용하여 `dto/` 디렉토리에 DTO 생성
7. 데이터베이스 액세스를 위해 `PersistenceService` 주입
8. `app.module.ts` imports에 추가

### 새 페이지 추가 (프론트엔드)

1. 페이지 파일 생성: `apps/web/pages/my-page.tsx`
2. 스크린 컴포넌트 생성: `apps/web/src/screens/MyPageScreen/MyPageScreen.tsx`
3. 필요 시 API 슬라이스 생성: `apps/web/src/store/services/my-api.ts`
4. 스토어에 API 슬라이스 추가: `apps/web/src/store/index.ts`에서 import
5. 컴포넌트에서 훅 사용: API 슬라이스의 `useGetMyDataQuery()`

### 데이터베이스 스키마 변경

1. `apps/api/prisma/schema.prisma` 수정
2. 마이그레이션 실행: `nps prisma.migrate.dev --name migration_name`
3. Prisma Client가 자동으로 타입 생성
4. 새 스키마를 사용하도록 도메인 서비스 업데이트

### 공유 컴포넌트 추가

1. 컴포넌트 생성: `packages/ui/components/MyComponent/MyComponent.tsx`
2. 배럴 파일에서 export: `packages/ui/index.tsx`에 추가
3. 앱에서 사용: `import { MyComponent } from 'ui'`

## 문제 해결

### 데이터베이스 연결 오류

**로컬 Docker:**
- 컨테이너 확인: `docker compose ps`
- 재시작: `docker compose restart`
- `apps/api/.env`의 자격증명 확인

**Supabase:**
- 프로젝트가 일시정지 상태가 아닌지 확인 (무료 플랜은 1주일 미사용 시 일시정지)
- `apps/api/.env`의 `DATABASE_URL`과 `DIRECT_URL` 확인
- Connection Pooling 모드가 **Transaction**인지 확인
- 방화벽이나 VPN이 Supabase 연결을 차단하지 않는지 확인

### 포트 이미 사용 중

- 포트 80: `docker-compose.yml`에서 변경하거나 충돌하는 서비스 중지
- 포트 3000/3001: 프로세스 종료하거나 각 `package.json` 스크립트에서 변경
- 포트 5432: `docker-compose.yml`에서 변경

### 마이그레이션 오류

```bash
cd apps/api
npx prisma migrate reset  # 데이터베이스 리셋 (⚠️ 데이터 삭제됨)
nps prisma.migrate.dev    # 마이그레이션 재실행
```

### 클린 설치

```bash
find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
rm yarn.lock
nps prepare
```

### Turborepo 캐시 문제

```bash
npx turbo clean       # Turborepo 캐시 제거
rm -rf .turbo         # 수동 캐시 제거
nps build             # 재빌드
```

## API 문서

- **Swagger REST API**: `http://localhost:3001/docs`
- **GraphQL Playground**: `http://localhost:3001/graphql`
- **Prisma Studio**: `nps prisma.studio` 실행 (`http://localhost:5555`에서 열림)

## 최근 주요 업그레이드

**2026년:**
- company-map / blog-collection: Next.js 16.1 (web/todo는 여전히 15)
- api / company-map에 `postinstall: prisma generate` 추가 — 설치 시 Prisma 클라이언트 자동 생성

**2025년 11월:**
- Turborepo 1.x → 2.x (`pipeline` → `tasks` 문법 변경)
- Next.js 13 → 15 (App Router 지원 추가됨, 하지만 현재는 Pages Router 사용)
- React 18 → 19 (동시성 기능 사용 가능)
- NestJS 10.1 → 10.4
- Prisma 5.1 → 6.1
- TypeScript 5.1 → 5.7
- Redux Toolkit 1.9 → 2.5
- `next-transpile-modules` 제거 (Next.js 15에 내장됨)

## 추가 문서

- [README.md](README.md) - 한국어로 작성된 상세한 설정 가이드
- [apps/company-map/README.md](apps/company-map/README.md) - company-map 셋업·백업·마이그레이션
- [docs/SETUP_SUPABASE.md](docs/SETUP_SUPABASE.md) - Supabase 통합 세부사항
- [docs/NETWORK_SETUP.md](docs/NETWORK_SETUP.md) - 디바이스 간 네트워크 액세스
- [docs/MADDINGSTOCK_COMPLETE.md](docs/MADDINGSTOCK_COMPLETE.md) - 텔레그램 메시지 파싱 로직
- [docs/MESSAGE_PARSING_GUIDE.md](docs/MESSAGE_PARSING_GUIDE.md) - 메시지 파싱 가이드
