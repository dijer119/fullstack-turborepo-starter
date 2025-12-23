# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 프로젝트 개요

Turborepo 기반의 **프로덕션 환경 지원 풀스택 TypeScript 모노레포**입니다. NestJS 백엔드(Prisma ORM 포함)와 Next.js 프론트엔드(Redux Toolkit Query 포함)로 구성되어 있습니다.

**핵심 기술:**
- **모노레포**: Turborepo v2.3 + Yarn Workspaces
- **백엔드**: NestJS v10.4 + Prisma v6.1 + PostgreSQL + GraphQL + Swagger
- **프론트엔드**: Next.js v15 + React v19 + Redux Toolkit Query v2.5 + Material-UI v7
- **테스팅**: Jest v29 + Testing Library
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

## 개발 명령어

**모든 명령어는 NPS를 사용합니다** - 먼저 전역 설치가 필요: `npm i -g nps`

### 초기 설정
```bash
nps prepare          # 의존성 설치 + Docker + Prisma 마이그레이션 (한 번만 실행)
```

### 개발
```bash
nps dev             # 모든 앱 시작 (web:3000, api:3001)
cd apps/web && yarn dev   # 프론트엔드만
cd apps/api && yarn dev   # 백엔드만
```

### 빌드
```bash
nps build           # Turborepo가 모든 앱/패키지 빌드
```

### 테스팅
```bash
nps test            # 모든 테스트 실행
nps test.web        # 프론트엔드 테스트만
nps test.api        # 백엔드 테스트만
nps test.ci         # CI 모드 (모든 테스트)

# 개별 앱 watch 모드
cd apps/web && yarn test:watch
cd apps/api && yarn test:watch
cd apps/api && yarn test:e2e     # E2E 테스트만
```

### 데이터베이스 관리
```bash
nps prisma.generate      # Prisma Client 생성
nps prisma.migrate.dev   # 마이그레이션 생성 및 실행
nps prisma.studio        # 데이터베이스 GUI 열기
cd apps/api && yarn db:seed  # 데이터베이스 시드
```

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

## 최근 주요 업그레이드 (2025년 11월)

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
- [SETUP_SUPABASE.md](SETUP_SUPABASE.md) - Supabase 통합 세부사항
- [NETWORK_SETUP.md](NETWORK_SETUP.md) - 디바이스 간 네트워크 액세스
- [MADDINGSTOCK_COMPLETE.md](MADDINGSTOCK_COMPLETE.md) - 텔레그램 메시지 파싱 로직
