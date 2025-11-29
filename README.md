# Turborepo 풀스택 스타터 (NestJS + Prisma + NextJS + Tailwind + TypeScript + Jest)

풀스택 개발을 위한 Turborepo 스타터 프로젝트입니다. 다음과 같은 기능들을 포함하고 있습니다.

- ✅ Turborepo 모노레포 
- ✅ NestJS 백엔드
    - ✅ 환경변수 설정 및 검증
    - ✅ Prisma ORM
- ✅ Next.js 프론트엔드
    - ✅ Tailwind CSS
    - ✅ Redux Toolkit Query
- ✅ Jest 테스팅
- ✅ GitHub Actions CI/CD
- ✅ Nginx 리버스 프록시
- ✅ Docker 통합
- ✅ PostgreSQL 데이터베이스
- ✅ NPS 패키지 스크립트

## 프로젝트 구성

이 프로젝트는 [Yarn](https://classic.yarnpkg.com/lang/en/)을 패키지 매니저로 사용하며, 다음과 같은 앱과 패키지들을 포함합니다.

### 앱과 패키지

- `api`: [NestJS](https://nestjs.com/) 백엔드 애플리케이션
- `web`: [Next.js](https://nextjs.org) 프론트엔드 애플리케이션
- `ui`: `web` 앱에서 사용하는 공유 React 컴포넌트 라이브러리
- `config`: `eslint`, `nginx`, `tailwind` 공유 설정 (`eslint-config-next`, `eslint-config-prettier` 포함)
- `tsconfig`: 모노레포 전체에서 사용하는 `tsconfig.json` 설정

모든 패키지와 앱은 100% [TypeScript](https://www.typescriptlang.org/)로 작성되었습니다.

### 유틸리티

다음과 같은 도구들이 미리 설정되어 있습니다:

- [Node Package Scripts](https://github.com/sezna/nps#readme) - 자동화 스크립트
- [TypeScript](https://www.typescriptlang.org/) - 정적 타입 체크
- [ESLint](https://eslint.org/) - 코드 린팅
- [Prettier](https://prettier.io) - 코드 포맷팅

## 설치 및 설정

이 스타터 킷은 모노레포 워크플로우를 위해 Turborepo와 Yarn Workspaces를 사용합니다.

### 사전 준비사항

- NPS 글로벌 설치
```bash
npm i -g nps
```

- Docker와 Docker Compose가 설치되어 있어야 합니다. 운영체제에 맞는 설치 가이드를 참고하세요.

### 환경변수 설정

#### 옵션 1: 로컬 PostgreSQL (Docker 사용)

- 프론트엔드
    - `cd apps/web && cp .env.example .env`
- 백엔드
    - `cd apps/api && cp .env.example .env`

#### 옵션 2: Supabase 사용 (권장)

- 프론트엔드
    - `cd apps/web && cp .env.supabase.example .env`
    - `.env` 파일을 열어서 Supabase Project URL과 Anon Key 입력
- 백엔드
    - `cd apps/api && cp .env.supabase.example .env`
    - `.env` 파일을 열어서 Supabase 데이터베이스 연결 정보 입력

**Supabase 연결 정보 확인 방법:**

[Supabase 대시보드](https://supabase.com/dashboard) 접속 후:

**1️⃣ 프론트엔드 설정 (`apps/web/.env`)**

`Settings` > `API` 메뉴에서:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`에 복사
  - 예: `https://xxxxx.supabase.co`
- **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`에 복사

**2️⃣ 백엔드 설정 (`apps/api/.env`)**

`Settings` > `Database` 메뉴의 `Connection string` 섹션에서:
- **Connection pooling** 탭 → `DATABASE_URL`에 복사 (포트 6543)
- **Direct connection** 탭 → `DIRECT_URL`에 복사 (포트 5432)
- `[YOUR-PASSWORD]`를 실제 데이터베이스 비밀번호로 교체

> 💡 **참고**: Supabase를 사용하면 별도의 Docker PostgreSQL 컨테이너가 필요하지 않습니다.

### 의존성 설치

프로젝트 루트 디렉토리에서 다음 명령어를 실행하세요:

```bash
nps prepare
```

### 빌드

모든 앱과 패키지를 빌드하려면 프로젝트 루트에서 다음 명령어를 실행하세요:

```bash
nps build
```

### 개발 서버 실행

개발 모드로 모든 앱을 실행하려면 프로젝트 루트에서 다음 명령어를 실행하세요:

```bash
nps dev
```

앱은 리버스 프록시가 설정된 `http://localhost`에서 실행됩니다.

## 데이터베이스 관리

### Prisma 명령어

Prisma Client 생성:
```bash
nps prisma.generate
```

데이터베이스 마이그레이션 실행:
```bash
nps prisma.migrate.dev
```

Prisma Studio 열기 (데이터베이스 GUI):
```bash
nps prisma.studio
```

### Supabase 연동 가이드

Supabase를 프론트엔드와 백엔드에서 모두 사용할 수 있습니다:

**1️⃣ 프론트엔드 설정 (Next.js)**

프론트엔드에서 Supabase Client를 사용하기 위한 설정:

```bash
cd apps/web && cp .env.supabase.example .env
```

`.env` 파일을 열어서 다음 정보를 입력:
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anon Public Key

**Supabase 프론트엔드 정보 확인:**
1. [Supabase 대시보드](https://supabase.com/dashboard) → `Settings` → `API`
2. **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`에 복사
3. **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`에 복사

**2️⃣ 백엔드 설정 (NestJS + Prisma)**

백엔드에서 Prisma를 통해 데이터베이스에 연결:

```bash
cd apps/api && cp .env.supabase.example .env
```

`.env` 파일을 열어서 다음 정보를 입력:
- `DATABASE_URL`: Connection pooling URL (포트 6543) - 애플리케이션용
- `DIRECT_URL`: Direct connection URL (포트 5432) - 마이그레이션용

**Supabase 백엔드 정보 확인:**
1. [Supabase 대시보드](https://supabase.com/dashboard) → `Settings` → `Database`
2. `Connection string` 섹션:
   - **Connection pooling** 탭 → `DATABASE_URL`에 복사
   - **Direct connection** 탭 → `DIRECT_URL`에 복사
3. `[YOUR-PASSWORD]`를 실제 비밀번호로 교체

**3️⃣ Connection Pooling 모드 설정**

Supabase 대시보드에서:
- `Database` → `Connection pooling`
- Mode를 **Transaction**으로 설정 (Prisma 권장)

**4️⃣ 마이그레이션 실행**

```bash
nps prisma.migrate.dev
```

**5️⃣ 데이터 확인**

```bash
nps prisma.studio
```

> 💡 **Supabase 사용 시 장점**:
> - 별도의 PostgreSQL 설치 불필요
> - 자동 백업 및 확장성
> - Supabase Auth, Storage, Realtime과 통합 가능
> - 무료 플랜 제공 (500MB DB, 2GB 전송량)

## 테스트

모든 테스트 실행:
```bash
nps test
```

특정 앱 테스트 실행:
```bash
nps test.web    # 프론트엔드 테스트
nps test.api    # 백엔드 테스트
```

Watch 모드로 테스트 실행:
```bash
nps test.watch.web    # 프론트엔드 watch 모드
nps test.watch.api    # 백엔드 watch 모드
```

## Docker 명령어

Docker 이미지 빌드:
```bash
nps docker.build        # 모든 이미지 빌드
nps docker.build.web    # web 이미지 빌드
nps docker.build.api    # api 이미지 빌드
```

## 프로젝트 구조

```
.
├── apps/
│   ├── api/              # NestJS 백엔드
│   │   ├── src/
│   │   │   ├── config/   # 환경변수 설정
│   │   │   └── persistence/  # Prisma 통합
│   │   └── prisma/       # 데이터베이스 스키마 & 마이그레이션
│   └── web/              # Next.js 프론트엔드
│       ├── pages/        # Next.js 페이지
│       ├── src/
│       │   ├── screens/  # 페이지 컴포넌트
│       │   ├── store/    # Redux Toolkit Query
│       │   └── styles/   # 글로벌 스타일
│       └── tailwind.config.js
├── packages/
│   ├── config/          # 공유 설정 (ESLint, Nginx, Tailwind)
│   ├── tsconfig/        # 공유 TypeScript 설정
│   └── ui/              # 공유 React 컴포넌트
├── docker-compose.yml   # Docker 서비스 설정
└── turbo.json          # Turborepo 설정
```

## 서비스 및 포트

### 로컬 PostgreSQL 사용 시 (Docker)

`nps dev`와 `nps prepare.docker` 실행 시:

- **Nginx 리버스 프록시**: `http://localhost` (포트 80)
- **PostgreSQL 데이터베이스**: `localhost:5432`
  - 데이터베이스: `mydb`
  - 사용자: `test`
  - 비밀번호: `test`
- **API (NestJS)**: `http://localhost:3001` (Nginx를 통해 프록시됨)
- **Web (Next.js)**: `http://localhost:3000` (Nginx를 통해 프록시됨)

### Supabase 사용 시

Docker PostgreSQL 컨테이너 없이 실행:

- **API (NestJS)**: `http://localhost:3001`
- **Web (Next.js)**: `http://localhost:3000`
- **PostgreSQL**: Supabase 클라우드 (별도 설정 불필요)

## 문제 해결

### 데이터베이스 연결 오류

**로컬 PostgreSQL (Docker) 사용 시:**
1. Docker 컨테이너가 실행 중인지 확인: `docker compose ps`
2. Docker 서비스 재시작: `docker compose restart`
3. `apps/api/.env`의 데이터베이스 자격증명 확인

**Supabase 사용 시:**
1. `apps/api/.env`의 `DATABASE_URL`과 `DIRECT_URL` 확인
2. Supabase 프로젝트가 일시정지 상태인지 확인 (무료 플랜은 1주일 미사용 시 일시정지)
3. Supabase 대시보드에서 데이터베이스 비밀번호 확인
4. Connection pooling이 **Transaction** 모드인지 확인
5. 방화벽이나 VPN이 Supabase 연결을 차단하지 않는지 확인

### 포트 이미 사용 중
포트 80 또는 5432가 이미 사용 중인 경우:
- 충돌하는 서비스를 중지하거나 `docker-compose.yml`에서 포트 수정

### 마이그레이션 오류
Prisma 마이그레이션이 실패하는 경우:
1. 데이터베이스 리셋: `cd apps/api && npx prisma migrate reset`
2. 마이그레이션 재실행: `nps prisma.migrate.dev`

### 클린 인스톨
의존성 문제가 발생하는 경우:
1. 모든 node_modules 제거: `find . -name "node_modules" -type d -prune -exec rm -rf '{}' +`
2. yarn.lock 제거: `rm yarn.lock`
3. 재설치: `nps prepare`

## 사용 가능한 NPS 명령어

터미널에서 `nps`를 실행하면 사용 가능한 모든 명령어 목록을 볼 수 있습니다.

### 주요 명령어
- `nps prepare` - 의존성 설치 및 데이터베이스 설정
- `nps dev` - 개발 서버 시작
- `nps build` - 모든 앱 빌드
- `nps test` - 모든 테스트 실행
- `nps prisma.studio` - 데이터베이스 GUI 열기
- `nps docker.build` - Docker 이미지 빌드

## 기술 스택

### 백엔드 (API)
- **NestJS v10.4** - Progressive Node.js 프레임워크
- **Prisma v6.1** - 차세대 ORM
- **PostgreSQL v15** - 관계형 데이터베이스
- **Swagger v8** - API 문서화
- **TypeScript v5.7** - 타입 안정성

### 프론트엔드 (Web)
- **Next.js v15.5** - React 프레임워크
- **React v19** - UI 라이브러리
- **Tailwind CSS v3.4** - 유틸리티 우선 CSS
- **Redux Toolkit v2.5** - 상태 관리 및 데이터 fetching
- **TypeScript v5.7** - 타입 안정성

### DevOps
- **Turborepo v2.3** - 고성능 빌드 시스템
- **Docker** - 컨테이너화
- **Nginx** - 리버스 프록시
- **GitHub Actions** - CI/CD
- **Jest v29** - 테스팅 프레임워크

### 주요 업데이트 (2025년 11월)
- ✅ Turborepo 1.x → 2.x 업그레이드 (`pipeline` → `tasks` 마이그레이션)
- ✅ Next.js 13 → 15 업그레이드 (App Router 지원)
- ✅ React 18 → 19 업그레이드
- ✅ NestJS 10.1 → 10.4 업그레이드
- ✅ Prisma 5.1 → 6.1 업그레이드
- ✅ TypeScript 5.1 → 5.7 업그레이드
- ✅ Redux Toolkit 1.9 → 2.5 업그레이드
- ✅ `next-transpile-modules` 제거 (Next.js 15 내장 기능 사용)

## 기여하기

1. 저장소를 Fork 합니다
2. 기능 브랜치를 생성합니다: `git checkout -b feature/amazing-feature`
3. 변경사항을 커밋합니다: `git commit -m 'feat: add amazing feature'`
4. 브랜치에 Push 합니다: `git push origin feature/amazing-feature`
5. Pull Request를 생성합니다

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 LICENSE 파일을 참고하세요.
