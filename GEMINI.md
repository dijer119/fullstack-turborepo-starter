# GEMINI.md

## 프로젝트 개요

이 프로젝트는 **Turborepo** 기반의 프로덕션 환경용 풀스택 TypeScript 모노레포입니다. 주식 분석 플랫폼(MaddingStock)으로 설계되었으며, 텔레그램 메시지 파싱, KRX 주식 데이터 통합, 내재가치 계산 등의 기능을 포함하고 있습니다.

### 핵심 아키텍처
- **모노레포 관리**: Turborepo v2.3 + Yarn Workspaces
- **백엔드 (apps/api)**: NestJS v10.4 + Prisma v6.1 + PostgreSQL. **GraphQL (Apollo)**과 **REST (Swagger)**를 모두 지원하는 하이브리드 API.
- **프론트엔드 (apps/web)**: Next.js v15 (Pages Router) + React v19 + Redux Toolkit Query + Material-UI v7 + Tailwind CSS.
- **공유 패키지**:
    - `packages/ui`: 공유 React 컴포넌트 라이브러리.
    - `packages/config`: 공유 ESLint, Tailwind, Nginx 설정.
    - `packages/tsconfig`: 공유 TypeScript 설정.
- **인프라**: Docker Compose (PostgreSQL, Nginx), GitHub Actions CI/CD.

## 빌드 및 실행 방법

이 프로젝트는 자동화를 위해 **NPS (Node Package Scripts)**를 사용합니다. 전역 설치를 권장합니다: `npm i -g nps`.

### 초기 설정
- **의존성 설치 및 초기화**: `nps prepare` (의존성 설치, Docker 실행, Prisma 마이그레이션 포함).
- **환경 변수 설정**:
    - `apps/api/.env.example` (또는 `.env.supabase.example`)를 `apps/api/.env`로 복사.
    - `apps/web/.env.example`를 `apps/web/.env`로 복사.

### 개발 서버 실행
- **전체 서비스 실행**: `nps dev` (API: 3001 포트, Web: 3000 포트).
- **API 개별 실행**: `cd apps/api && yarn dev`.
- **Web 개별 실행**: `cd apps/web && yarn dev`.
- **Prisma Studio**: `nps prisma.studio` (데이터베이스 GUI: http://localhost:5555).

### 빌드 및 테스트
- **전체 빌드**: `nps build`.
- **전체 테스트 실행**: `nps test`.
- **특정 앱 테스트**: `nps test.api` 또는 `nps test.web`.
- **E2E 테스트**: `cd apps/api && yarn test:e2e`.

### 데이터베이스 관리
- **Prisma 클라이언트 생성**: `nps prisma.generate`.
- **마이그레이션 실행**: `nps prisma.migrate.dev`.
- **데이터 시딩**: `cd apps/api && yarn db:seed`.

## 개발 규칙 및 컨벤션

### 백엔드 (NestJS)
- **도메인 중심 설계**: 각 기능(예: `users`, `stock`, `telegram`)은 다음을 포함하는 독립적인 모듈로 구성됩니다.
    - `*.module.ts`: 모듈 등록.
    - `*.controller.ts`: Swagger 문서가 포함된 REST 엔드포인트.
    - `*.service.ts`: 비즈니스 로직.
    - `*.resolver.ts`: GraphQL 리졸버 (Code-first 방식).
    - `dto/`: `class-validator`를 사용한 데이터 전송 객체.
- **영속성 계층**: 전역 `PersistenceService` (Prisma)를 모든 모듈에서 주입받아 사용 가능합니다.
- **검증**: 시작 시 Joi를 사용하여 환경 변수를 검증합니다 (`apps/api/src/config/environment-variables.ts`).

### 프론트엔드 (Next.js)
- **Pages Router**: `apps/web/pages/`의 전통적인 파일 기반 라우팅을 사용합니다.
- **Screen 패턴**: `pages/`의 파일은 주로 UI 로직이 담긴 `src/screens/`의 컴포넌트를 임포트하여 사용합니다.
- **상태 관리**: Redux Toolkit Query를 사용하여 전역 상태와 API 페칭을 관리합니다. API 슬라이스는 `src/store/services/`에 위치합니다.
- **스타일링**: Tailwind CSS(유틸리티)와 Material-UI(복잡한 컴포넌트)를 혼합하여 사용합니다.

### 공유 패키지 관리
- **공유 UI**: 재사용 가능한 컴포넌트는 `packages/ui`에 추가하고 `index.tsx`에서 내보냅니다.
- **의존성**: 루트에서 `yarn`을 사용하여 관리하며, 워크스페이스 의존성은 `*` 버전을 사용합니다 (예: `"ui": "*"`).

## 주요 기능 및 도구

- **텔레그램 연동**: `apps/api/src/telegram/`에서 주식 관련 메시지 파싱 로직을 담당합니다.
- **주식 가치 계산**: `IntrinsicValueModule`에서 내재가치 평가 로직을 관리합니다.
- **KRX 연동**: `apps/api/scripts/`에 KRX 주식 데이터를 가져오고 업데이트하는 스크립트가 포함되어 있습니다.
- **문서화**:
    - REST API: `http://localhost:3001/docs` (Swagger)
    - GraphQL: `http://localhost:3001/graphql` (Playground)
    - 상세 가이드: `docs/` 디렉토리 및 `apps/api/*.md` 파일 참조.

## 인프라 참고 사항

- **Nginx**: 프로덕션 환경에서 리버스 프록시 역할을 하며, `/api` 요청은 백엔드로, 그 외는 프론트엔드로 전달합니다.
- **데이터베이스**: 로컬 Docker 또는 Supabase를 지원합니다. Supabase 사용 시 `DATABASE_URL` (풀링, 6543 포트)과 `DIRECT_URL` (직접 연결, 5432 포트) 설정이 필수입니다.
- **PgBouncer**: Supabase 사용 시 Connection Pooling 모드를 반드시 **Transaction**으로 설정해야 합니다.
