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

### 차수별 모의 장부
company-map의 SplitSimulation은 모의 전용이다. 직접 입력과 토스 관측은 별도 장부로 유지하고, 동일 실행 키·시세 중복은 체결을 다시 만들지 않는다. 실거래는 별도 SplitLiveStrategy·Lot·Order에 저장하며 모의 체결을 가져오지 않는다. (2026-10-30 분할매매 모의·실거래 장부 구현)

### 신규 화면 진입 메뉴
company-map 신규 도구는 개별 페이지 링크와 함께 공통 AppMenu의 TOOLS에도 등록하고, 다른 화면에서 메뉴를 통해 진입되는지 확인한다. (2026-10-30 분할매매 장부 메뉴 누락 수정)

### 실거래 전송·정산 경계
분할매매는 주문 의도를 먼저 저장하고 실제 누적 체결의 차이만 원자적으로 반영한다. 접수 미확인 주문을 자동 재전송하지 않으며 복구 상태는 lease 획득 후 다시 읽는다. 시작은 revision을 비교해 나중의 일시정지를 덮어쓰지 않는다. 정규장·시세·lease 유효시간과 종목 소유권은 OAuth 대기 후 실제 HTTP 직전에도 검사한다. (2026-10-30 자동 실거래 장애·경계 시각 검증)

### 누적 수익금 표시
분할매매 누적 수익금은 손실·수수료·세금을 반영한 누적 실현손익이며 평가손익과 구분한다. 전체 집계는 종료 전략·재진입 회차를 포함하고 실거래/모의 및 KRW/USD를 각각 분리한다. (2026-10-30 누적 수익금 카드 추가)

### 국내 애프터마켓 판정
통합 캘린더의 afterMarket만으로 NXT 거래 가능 여부를 판단하지 않는다. 종목의 nxtSupported·nxtTradingSuspended와 singlePriceAuctionEndTime을 확인하고 접속매매 구간에만 주문하며 세션 종료 시각을 HTTP 직전까지 전달한다. (2026-10-30 국내 NXT 애프터마켓 확장)

### 종목명 자동 입력
비동기 종목명은 시장·정규화 코드 키가 일치할 때만 표시하고 이전 요청은 취소 처리한다. 직접 입력한 이름은 별도 상태로 보존해 늦은 조회 응답이 덮어쓰지 않게 한다. (2026-10-30 실거래 표시 이름 자동 입력)

### 통화별 금액 입력
실거래 자금·예산 입력은 비율 입력과 분리한다. KRW는 정수·천 단위 쉼표·원 단위 표시를 쓰고 증감 버튼도 정수로 계산하며, USD 숫자 입력은 0.01 단위를 사용한다. (2026-10-30 금액 증감 시 소수점 발생 수정)

### 비율 입력 증감
실거래 전략의 하락·익절률 버튼은 0.5%p, 비용 여유율은 0.1%p로 증감하고 직접 입력·저장은 소수 둘째 자리까지 처리한다. 포커스된 숫자 입력의 휠 동작은 값을 바꾸므로 blur로 막는다. (2026-10-30 비율 입력 소수점·스크롤 오조작 수정)

### 전량 익절 후 반복
실거래는 전량 매도 정산이 끝난 감시에서는 재매수하지 않고 다음 감시에서 새 1차 generation으로 반복한다. 활성 상태·소유권·누적 현금·기존 장부를 보존하고, 일시정지·kill·syncOnly·미확정 주문은 재매수를 막는다. 모의 장부와 수동 종료 전략은 자동 재시작하지 않는다. (2026-10-30 실거래 자동 재시작)

### 워커 단일 실행
company-map 워커는 데이터·거래 런타임을 불러오기 전에 공통 loopback 포트 잠금을 획득한다. worker:once와 다른 체크아웃도 같은 잠금을 쓰며, 종료 처리 중에는 해제하지 않고 프로세스 종료 시 OS가 해제하게 한다. 구버전 중복 워커는 별도로 정리해야 한다. (2026-10-30 토스 호출 한도 진단에서 워커 4개 동시 실행 확인)

### 차수별 예산 검증 공유
실거래 createLiveStrategy는 모의용 validateConfig의 고정 예산 합계 검사를 재사용한다. 차수별 증가 예산을 도입할 때는 UI·저장 검증·워커에 동일 계산을 적용하고, 모의 장부의 기존 검증이 변하지 않도록 범위를 분리한다. (2026-10-30 누적 배수·일정 금액 증가 방식 검토)

### 차수 예산 배수와 재진입
실거래 예산 배수는 2차÷1차이며 누적은 B×r^(slot−1), 일정 증가는 B×[1+(slot−1)×(r−1)]이다. 회차가 아닌 차수에 적용하고, UI·서버·워커는 공통 계산을 사용한다. 증가 예산의 원·센트 내림은 정수 비율로 계산해 부동소수 오차를 막는다. 동일 금액으로 전환할 때는 숨겨질 배수를 1로 초기화한다. (2026-10-30 두 예산 증가 방식 구현·UI 검증)

### 시세 조건 검색의 기준일
52주 저가 근접 검색은 최신 종가와 같은 일봉·기간에서 저가를 다시 계산하고 캐시 기준일을 확인한다. 일중 변동일 수는 반등·익절 횟수와 구분하며, 종가×거래량은 실제 거래대금이 아닌 추정치로 표시한다. (2026-10-30 최근 한 달 거래·변동성 종목 검색에서 오래된 저가 캐시와 요약 시세 차이 확인)

### 1차 전용 익절률
실거래 1차 익절률은 generation과 무관하게 slot 1에 적용하며 신규 기본값은 10%, 기존 전략은 종전 익절률을 보존한다. 변경은 일시정지·미확정 주문 없음·lease 확보 조건에서 저장하고 화면 목표가와 워커는 공통 계산을 사용한다. (2026-10-31 1차 익절률 조정 기능)

### 차수별 개별 설정
실거래 차수별 JSON은 배열 순서가 slot이며 1차 매수 기준은 null, 이후 하락률은 앞 차수 매수가 기준이다. NULL 저장값만 기존 공통 규칙으로 계산하고 잘못된 JSON은 주문을 막는다. 일괄 적용은 1차 익절률을 보존하며, 시작 확인문·목표가·워커 모두 개별 설정의 금액과 비율을 사용한다. (2026-10-31 차수별 입력·일괄 적용 구현)

### LIVE 중 차수별 수정
차수별 편집은 active/paused에서 상태를 유지한 채 lease·status·revision 비교 후 저장한다. 미체결 주문의 가격·수량은 바꾸지 않으며 워커가 기존 주문을 정산한 뒤 새 설정으로 판단한다. 종료 전략은 편집하지 않는다. 기존 1차 전용 수정 API와 차수별 편집의 허용 조건을 혼동하지 않는다. (2026-10-31 LIVE 중 설정 수정 허용)

### 외부 매매 웹앱의 분석 근거
로그인 전 가상 장부·공개 시세·배포 코드의 기능 후보를 구분하고, 직렬화 배열 크기를 실제 거래 한도로 해석하지 않는다. 계산식은 반환 데이터로 재현한 표본 범위를 명시한다. (2026-10-31 매직스플릿 유진 KR REA 분석)

### 관심 그룹과 최근 본 기록
관심 그룹 삭제는 멤버십만 지우고 종목·구매가를 보존한다. 최근 본은 상세 클라이언트가 열린 뒤 알려진 종목만 기록하고 관심 페이지 캐시를 무효화해 뒤로가기에도 반영한다. 그룹 표는 공통 추가 도구를 사용해 분류 누락을 막고 시세·NXT 조회 실패에도 목록은 유지한다. (2026-10-31 관심종목 그룹·카드 화면 확장)

### 분할매매의 관심종목 진입
분할매매와 관심종목은 공통 메뉴뿐 아니라 각 화면 상단에 상대 화면 바로가기를 제공해 양방향으로 이동할 수 있게 한다. (2026-10-31 관심종목·분할매매 상호 진입 메뉴 추가)

### 분할매매 목록과 상세 분리
목록에는 요약 데이터만 전달하고 주문·실행 이력은 선택한 ID의 상세에서 조회한다. 전체 누적 수익금은 검색·표시 개수와 무관하게 집계하며 생성 후 반환 ID로 상세 이동하고 저장 시 하위 경로 캐시도 갱신한다. (2026-10-31 종목 목록·전략 등록·수정 화면 분리)

### 분할매매 무한 스크롤
종목 목록은 필터 후 한국어 종목명순으로 정렬하고 하단 관측 시 20개씩 누적 표시한다. 검색·필터 변경은 표시 범위를 초기화하고 관측자는 추가 표시 후 다시 연결해 중복 증가를 막는다. (2026-10-31 페이지 이동 제거·45개 가상 종목 브라우저 검증)

### 차수별 목록의 평가등락률
차수 표는 현재 잔량의 가중 매수가와 마지막 장부 가격으로 비용 제외 평가등락률을 계산하며 과거 매도 회차는 제외한다. 미해결 주문은 최근 20건 제한 없이 조회해 lotId로 차수와 연결하고 매수 대기보다 우선 표시한다. 미설정 셀도 1부터 시작하는 차수 키를 써서 서로 다른 최대 차수의 열이 중복되지 않게 한다. (2026-10-31 이미지 기반 차수별 표·모바일 고정 열 구현)

### 기간별 실현 수익의 날짜와 분모
실거래 체결 시각이 없는 기존 장부는 한국시간 매도 주문일 기준임을 표시하고 수익률은 비용 포함 매도 원가 대비 순실현손익으로 계산한다. 모의는 실행 가격을 재생해 단계 수·장부 일치를 검증한 후 실행일에 연결하며 누락 이력은 임의 날짜로 배정하지 않는다. 통화·모의/실거래를 합치지 않는다. (2026-11-01 월별·일별 수익 화면)

### 개발 서버 포트 충돌
Turborepo의 dev 종료 요약만으로 코드 오류를 추정하지 않고 실제 앱 시작 오류·포트 소유 PID·작업 디렉터리를 확인한다. 검증용 Next 서버가 전체 dev를 막으면 해당 프로세스만 종료하고 재기동·HTTP 응답 확인 후 포트를 반환한다. 자동매매 워커와 개발 서버는 별개로 취급한다. (2026-11-01 남아 있던 검증 서버의 3004 EADDRINUSE 해결)

### 차수별 반복 완료와 설정 초안
반복 완료는 실제 매수 후 잔량 0이고 미해결 주문이 없는 회차로 집계하며, 미해결 주문 수는 최근 20건 제한과 별도로 조회한다. 설정 탭은 숨겨도 편집기를 유지해 개별 행뿐 아니라 미적용 일괄 설정 초안도 보존한다. (2026-11-01 종목 진행 현황·탭 분리)

### 분할매매 가격·체결 차트
진행 차트는 시세선이 아니라 체결 기록만 같은 간격으로 연결한다. 차수 축은 실제 매수한 차수의 최근 회차 수량 가중 평균 체결가를 사용하고, 같은 날 같은 가격의 B/S/B를 합치지 않는다. 실거래는 전체 체결 주문의 누적 평균가·한국시간 주문 시각, 모의는 장부의 관측 번호를 사용한다. (2026-11-01 사용자 확인에 따른 무거래 구간 제외·차수 축 수정)

### 금융 화면의 색상 대비
분할매매·관심종목은 공통 surface·line·muted 색상 변수를 사용해 밝은 화면과 다크모드를 함께 조정한다. Recharts의 축·툴팁·B/S 표시도 CSS 변수로 지정하고, 코드 변경 후 실제 브라우저의 계산된 색상과 모바일 가로 넘침을 확인한다. (2026-11-01 흰 배경 눈부심 완화)

### 분할매매의 소득 목표 역산
목표소득÷총자금은 요구 수익률이며 예상수익률이 아니다. 대기 현금을 분모에 포함하고 실현이익과 평가손익을 함께 보며, 익절 횟수 역산·가상 하락 경로를 종목별 백테스트와 구분한다. (2026-11-01 연평균 월 500만원 운용 검토)

### 일봉 분할매매의 가정과 순위
종가 체결은 익절선 초과 이익을 부풀릴 수 있고 OHLC 두 경로도 실제 수익의 상·하한이 아니다. 갭 체결·미체결·월말 표본 편향을 밝히고 실제 계좌 성과와 가상 경로 순위를 구분한다. (2026-11-01 10월 645종목 분할매매 비교)

### 로컬 보고서 미리보기
HTML 파일 생성과 HTTP 서버 실행은 별개다. 미리보기 주소를 안내할 때 loopback 포트의 리스너·HTTP 응답·제공 파일 일치를 확인하고 필요한 보고서 파일만 제공한다. (2026-11-01 3010 보고서 서버 미실행 해결)

### 예약 매수와 기존 워커
예약 감시는 reserved 상태로 분리해 구버전 워커의 즉시 진입을 막는다. 최초 주문 의도와 예약 이력을 같은 트랜잭션에 기록하고 실제 체결 후에만 active로 전환하되 사용자 일시정지는 유지한다. 한국시간 만료 시각은 HTTP 전송 기한에도 포함하며 미확인 주문은 재전송하지 않는다. (2026-11-01 예약 가격 감시·실행 이력)

### 매직스플릿 메뉴 표시
메뉴 명칭은 공통 AppMenu·수익 현황 메뉴·관심종목 바로가기·접근성 이름을 함께 맞추며 기존 /stocks/split 경로를 유지한다. 예약 매수 메뉴도 공통 메뉴와 내부 내비게이션에서 '매직스플릿 예약 매수'로 표시한다. (2026-11-01 분할매매·예약 매수 메뉴명 변경)

### 분기 이익과 1년 고저 범위 검색
단일 분기와 누적 영업이익을 구분해 4분기는 연간−3분기 누적으로 계산하고 전년 비교기간도 검사한다. 같은 연결·별도 기준의 확정 분기와 잠정실적을 구분하며 1년 변동폭은 동일 일봉의 (최고−최저)÷최저로 비교한다. (2026-11-01 영업이익 지속·저변동 20종목 선별에서 전년 비교기간 불일치 제외)

### 선별 결과의 52주 위치 재정렬
52주 위치는 같은 기간의 (현재가−저가)÷(고가−저가)로 계산하고 기준 종가 날짜를 표시한다. 기존 명단의 형식 변경·재정렬 요청에는 예시의 추가 필터나 종목 수를 섞지 않는다. (2026-11-01 엄격한 이익 기준 20종목의 예시 형식 재작성)

### 화면 갱신과 감시 시각
목록의 30초 화면 갱신과 워커의 처리 완료 후 30초 대기를 구분한다. 최근 감시는 가격 갱신 시각이 아니며, active·reserved의 미실행·90초 지연 표시는 서버 조회 시각 기준으로 계산하고 워커 중단으로 단정하지 않는다. (2026-11-02 매직스플릿 갱신 안내 추가)

### 워커 종료 로그와 실거래 재개
shutdown complete는 메인 루프 종료 로그이며 프로세스·잠금 해제를 보장하지 않는다. 재시작 전 PID·작업 경로·13004 잠금을 확인하고, 재개 후 최근 감시·시세·주문 접수와 체결을 따로 검증한다. (2026-11-02 잔류 워커 정리·사용자 승인 후 자동매매 재개)

### 1차 재매수 하락 조건
전량 익절 후 가장 최근에 실제 매수한 1차 회차의 마지막 매도 체결을 기준으로 한다. 누적 체결만 제공될 때 마지막 가격을 입증할 수 없으면 대기하고, 조건을 모르는 구버전 워커의 1차 재진입은 DB에서 차단한다. (2026-11-04 하락 대기 재매수 추가)

### 블로그 Atom 피드 인식
feed.xml 확장자만으로 RSS 구조를 가정하지 않는다. 등록·수집 공통 파서에서 Atom의 entry·href·updated·피드 작성자를 기존 글 형식으로 변환하고 실제 URL의 API 응답과 기존 RSS 회귀를 함께 확인한다. (2026-11-04 hoch.io Atom 피드 인식 수정)

### 실거래 배정 자금 변경
배정액과 전략 현금에 같은 증감액을 원자적으로 반영해 손익을 보존한다. lease·revision·편집 시작 배정액을 대조하고 미확정 주문·필요 예산 미달·현금 초과 감액은 거절하며, 차수별 초안은 배정액 저장 후에도 보존한다. (2026-11-04 설정 탭 배정 자금 변경)

### 1차 매수가 기준 재매수 기본값
reentryDropPct가 NULL이면 전량 청산 후 직전 실제 매수 회차의 1차 평균 체결가 이하를 기다린다. 미체결 생성 회차는 기준에서 제외하며 비용 제외·통화 정밀도 내림을 적용한다. 별도 하락률은 마지막 매도 체결가 기준을 유지하고 구버전 워커의 즉시 재진입은 DB에서 막는다. (2026-11-05 재매수 기본값 변경)

### 목록 가격과 매매 표식 날짜
목록의 lastPrice는 최근 매매 판단 가격임을 함께 표시하고 미수신을 0원으로 바꾸지 않는다. B/S 날짜는 한국시간 주문일로 표시하며 모의 관측 번호를 날짜로 변환하지 않는다. (2026-11-06 목록 현재가·차트 날짜 표시)

### 분할매매 외부 종목 링크
국내 종목의 네이버 이동은 공통 NaverFinanceLink를 사용하고 기존 상세 링크 밖에 배치해 중첩 앵커를 피한다. 차수별·요약 보기 모두 새 탭으로 연다. (2026-11-06 목록 네이버 금융 링크 추가)

### 종목 목록 행 밀도
종목명·상태, 가격·평가등락률, 코드·외부 링크를 같은 줄로 묶고 차수 셀의 최소 높이도 함께 줄인다. 감시 경고는 유지하며 실제 행 높이와 모바일 가로 넘침을 확인한다. (2026-11-06 종목 행 높이 축소)

### 목록 매도 횟수
실거래 매도 횟수는 전체 주문의 SELL·filledQty>0 조건으로 집계해 최근 20건 제한과 분리한다. 부분 체결 후 취소도 주문당 1회이고 미체결은 제외하며, 모의는 closedStep이 있는 회차 수를 사용한다. (2026-11-06 종목별 매도 횟수 표시)
