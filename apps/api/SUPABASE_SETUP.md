# Supabase 데이터베이스 연결 가이드

## 🔑 Supabase Database 비밀번호 확인

1. [Supabase Dashboard](https://supabase.com/dashboard/project/xhtlvxutgviqsbyxwxku) 접속
2. `Settings` → `Database` 메뉴 이동
3. **Database Password** 섹션에서 비밀번호 확인/재설정

## 📝 연결 정보 설정

### 방법 1: 자동 설정 (권장)

터미널에서 실행:
```bash
cd apps/api

# Supabase 대시보드에서 Connection String 복사
# Settings > Database > Connection string

# Connection pooling 탭의 URI를 복사하여:
export DATABASE_URL="복사한 CONNECTION_POOLING_URL"

# Direct connection 탭의 URI를 복사하여:
export DIRECT_URL="복사한 DIRECT_URL"

# 또는 .env 파일 직접 수정
nano .env
```

### 방법 2: 수동 설정

`.env` 파일을 다음과 같이 수정:

```env
# Supabase Database (포트 6543 - Connection Pooling)
DATABASE_URL="postgresql://postgres.xhtlvxutgviqsbyxwxku:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Supabase Database (포트 5432 - Direct Connection)
DIRECT_URL="postgresql://postgres.xhtlvxutgviqsbyxwxku:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"

# Supabase API
SUPABASE_URL=https://xhtlvxutgviqsbyxwxku.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhodGx2eHV0Z3ZpcXNieXh3eGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MDYwNzEsImV4cCI6MjA3OTk4MjA3MX0.U56cBrcLDd8YV07XdGJ6ZKweYgptz7JUrJiiPRZVfxk

# Application
NODE_ENV=development
PORT=3001
```

**중요**: `[YOUR-PASSWORD]`를 실제 Supabase 데이터베이스 비밀번호로 교체하세요!

## 🔧 Connection Pooling 설정

1. Supabase Dashboard → `Database` → `Connection pooling`
2. **Mode**를 **Transaction**으로 설정 (Prisma 권장)

## 🚀 데이터베이스 초기화

### 1. 마이그레이션 실행

```bash
cd apps/api
npx prisma migrate dev --name init
```

### 2. 시드 데이터 삽입

```bash
yarn db:seed
```

이 명령어는:
- ✅ 3명의 사용자 생성
- ✅ 5개의 회사 데이터 생성

### 3. 연결 테스트

```bash
yarn db:test
```

실행 결과:
```
✅ Database connection successful!
✅ Created company
✅ Found company
✅ Updated company
✅ Deleted company
```

## 🧪 실제 데이터베이스 테스트 실행

### 통합 테스트 (실제 DB 사용)

```bash
yarn test:integration
```

또는 직접 실행:

```bash
npx jest test/companies-integration.spec.ts
```

### E2E 테스트

```bash
yarn test:e2e companies.e2e-spec
```

## 📊 Prisma Studio로 데이터 확인

```bash
npx prisma studio
```

브라우저에서 http://localhost:5555 열림

## 🔍 문제 해결

### 연결 오류

```
Error: P1001: Can't reach database server
```

**해결책**:
1. DATABASE_URL과 DIRECT_URL 확인
2. 비밀번호에 특수문자가 있으면 URL 인코딩 필요
3. Supabase 프로젝트가 일시정지 상태인지 확인
4. Connection pooling이 Transaction 모드인지 확인

### 비밀번호 URL 인코딩

비밀번호에 특수문자(`@`, `#`, `$` 등)가 있는 경우:

```javascript
// JavaScript로 인코딩
encodeURIComponent('your-password')
```

또는 온라인 도구 사용: https://www.urlencoder.org/

## 📖 사용 예시

### 1. 연결 테스트
```bash
yarn db:test
```

### 2. 샘플 데이터 삽입
```bash
yarn db:seed
```

### 3. 통합 테스트 실행
```bash
yarn test:integration
```

### 4. Prisma Studio로 데이터 확인
```bash
npx prisma studio
```

## 🎯 다음 단계

1. ✅ `.env` 파일에 Supabase 연결 정보 입력
2. ✅ Connection pooling을 Transaction 모드로 설정
3. ✅ 마이그레이션 실행: `npx prisma migrate dev`
4. ✅ 시드 데이터 삽입: `yarn db:seed`
5. ✅ 테스트 실행: `yarn test:integration`

## 🔗 참고 링크

- [Supabase Dashboard](https://supabase.com/dashboard/project/xhtlvxutgviqsbyxwxku)
- [Prisma + Supabase 가이드](https://supabase.com/docs/guides/database/prisma)
- [Connection Pooling 설정](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)

