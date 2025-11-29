# Supabase 설정 및 Prisma 연동 가이드

이 가이드는 Supabase와 Prisma를 연동하여 사용하는 방법을 안내합니다.

## 📋 목차

1. [Supabase 프로젝트 생성](#1-supabase-프로젝트-생성)
2. [환경변수 설정](#2-환경변수-설정)
3. [Prisma 마이그레이션](#3-prisma-마이그레이션)
4. [테스트 실행](#4-테스트-실행)
5. [API 사용 예시](#5-api-사용-예시)

## 1. Supabase 프로젝트 생성

### 1.1 Supabase 가입 및 프로젝트 생성

1. [Supabase 웹사이트](https://supabase.com) 접속
2. "Start your project" 클릭하여 가입
3. "New Project" 클릭
4. 프로젝트 정보 입력:
   - Name: 프로젝트 이름 (예: my-app)
   - Database Password: 강력한 비밀번호 생성 (나중에 필요함!)
   - Region: 가까운 지역 선택 (예: Northeast Asia (Seoul))
5. "Create new project" 클릭
6. 프로젝트 생성 완료까지 1-2분 대기

### 1.2 Connection Pooling 설정

1. Supabase 대시보드에서 `Database` → `Connection pooling` 메뉴 이동
2. **Mode**를 **Transaction**으로 변경 (Prisma와 호환성을 위해 필수)
3. 변경사항 저장

## 2. 환경변수 설정

### 2.1 백엔드 환경변수 설정

```bash
cd apps/api
cp .env.supabase.example .env
```

`.env` 파일을 열고 다음 정보를 입력:

**Database 연결 정보 확인:**
1. Supabase 대시보드 → `Settings` → `Database`
2. `Connection string` 섹션:

**Connection pooling** 탭에서 URI 복사:
```env
DATABASE_URL="postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
```

**Direct connection** 탭에서 URI 복사:
```env
DIRECT_URL="postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
```

**Supabase API 정보 확인 (Optional):**
1. Supabase 대시보드 → `Settings` → `API`
2. Project URL과 anon public key 복사:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**완성된 `.env` 파일 예시:**
```env
# Database
DATABASE_URL="postgresql://postgres.abcdefg:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.abcdefg:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"

# Supabase (Optional)
SUPABASE_URL=https://abcdefg.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Application
NODE_ENV=development
PORT=3001
```

> ⚠️ **중요**: `[YOUR-PASSWORD]`를 실제 데이터베이스 비밀번호로 교체하세요!

### 2.2 프론트엔드 환경변수 설정 (Optional)

프론트엔드에서 Supabase Client를 사용하려면:

```bash
cd apps/web
cp .env.supabase.example .env
```

`.env` 파일 내용:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_API_URL=http://localhost:3001
NODE_ENV=development
```

## 3. Prisma 마이그레이션

### 3.1 Prisma Client 생성

```bash
cd apps/api
npx prisma generate
```

### 3.2 데이터베이스 마이그레이션 실행

```bash
npx prisma migrate dev --name init
```

이 명령어는:
- 마이그레이션 파일 생성
- Supabase 데이터베이스에 테이블 생성
- Prisma Client 재생성

### 3.3 Prisma Studio로 데이터 확인

```bash
npx prisma studio
```

브라우저에서 `http://localhost:5555` 접속하여 데이터베이스 GUI 확인

## 4. 테스트 실행

### 4.1 유닛 테스트

```bash
cd apps/api

# 모든 테스트 실행
yarn test

# Users Service 테스트만 실행
yarn test users.service

# Users Controller 테스트만 실행
yarn test users.controller
```

### 4.2 E2E 테스트 (실제 데이터베이스 필요)

```bash
# E2E 테스트 실행
yarn test:e2e users.e2e-spec
```

> ⚠️ E2E 테스트는 실제 Supabase 데이터베이스를 사용하며, 테스트 후 데이터를 삭제합니다.

## 5. API 사용 예시

### 5.1 개발 서버 실행

```bash
# 루트 디렉토리에서
cd ../..
yarn dev

# 또는 API만 실행
cd apps/api
yarn dev
```

서버가 실행되면:
- API: http://localhost:3001
- Swagger 문서: http://localhost:3001/docs

### 5.2 API 테스트

#### curl 사용

```bash
# 1. 사용자 생성
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "name": "John Doe"
  }'

# 2. 모든 사용자 조회
curl http://localhost:3001/users

# 3. 특정 사용자 조회
curl http://localhost:3001/users/1

# 4. 사용자 수 조회
curl http://localhost:3001/users/count

# 5. 사용자 업데이트
curl -X PATCH http://localhost:3001/users/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Updated"
  }'

# 6. 사용자 삭제
curl -X DELETE http://localhost:3001/users/1
```

#### HTTPie 사용 (설치: `brew install httpie`)

```bash
# 사용자 생성
http POST localhost:3001/users email=john@example.com name="John Doe"

# 모든 사용자 조회
http localhost:3001/users

# 사용자 업데이트
http PATCH localhost:3001/users/1 name="John Updated"

# 사용자 삭제
http DELETE localhost:3001/users/1
```

### 5.3 Swagger UI 사용

1. http://localhost:3001/docs 접속
2. "Try it out" 버튼 클릭
3. 요청 데이터 입력
4. "Execute" 버튼 클릭
5. 응답 확인

## 6. 문제 해결

### 데이터베이스 연결 오류

```bash
Error: P1001: Can't reach database server
```

**해결 방법:**
1. DATABASE_URL과 DIRECT_URL이 올바른지 확인
2. 비밀번호에 특수문자가 있다면 URL 인코딩 필요
3. Supabase 프로젝트가 일시정지 상태인지 확인 (무료 플랜: 1주일 미사용 시 일시정지)
4. VPN이나 방화벽이 연결을 차단하는지 확인

### Prisma Client 오류

```bash
Error: @prisma/client did not initialize yet
```

**해결 방법:**
```bash
cd apps/api
npx prisma generate
```

### 마이그레이션 오류

```bash
Error: P3005: The database schema is not empty
```

**해결 방법 (주의: 모든 데이터 삭제됨):**
```bash
npx prisma migrate reset
npx prisma migrate dev
```

### Connection Pooling 오류

```bash
Error: prepared statement already exists
```

**해결 방법:**
Supabase 대시보드에서 Connection pooling 모드를 **Transaction**으로 변경

## 7. 다음 단계

### 새로운 모델 추가하기

1. `apps/api/prisma/schema.prisma`에 모델 추가:

```prisma
model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("posts")
}

// User 모델에 관계 추가
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  posts     Post[]   // 추가
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("users")
}
```

2. 마이그레이션 실행:

```bash
npx prisma migrate dev --name add_posts
```

3. 컨트롤러와 서비스 생성:

```bash
npx nest g module posts
npx nest g controller posts
npx nest g service posts
```

### Supabase 추가 기능 활용

Supabase는 데이터베이스 외에도 다양한 기능 제공:

- **Authentication**: 사용자 인증 및 권한 관리
- **Storage**: 파일 업로드 및 저장
- **Realtime**: 실시간 데이터 구독
- **Edge Functions**: 서버리스 함수

자세한 내용은 [Supabase 공식 문서](https://supabase.com/docs) 참고

## 8. 유용한 명령어 모음

```bash
# Prisma
npx prisma studio              # DB GUI 실행
npx prisma generate            # Client 생성
npx prisma migrate dev         # 마이그레이션 실행
npx prisma migrate reset       # DB 리셋
npx prisma db push            # 스키마 동기화 (프로토타이핑용)
npx prisma db pull            # DB에서 스키마 가져오기

# 개발
yarn dev                       # 개발 서버 실행
yarn build                     # 빌드
yarn test                      # 테스트
yarn test:e2e                  # E2E 테스트

# NestJS
npx nest g module <name>       # 모듈 생성
npx nest g controller <name>   # 컨트롤러 생성
npx nest g service <name>      # 서비스 생성
```

## 📚 참고 자료

- [Supabase 공식 문서](https://supabase.com/docs)
- [Prisma 공식 문서](https://www.prisma.io/docs)
- [NestJS 공식 문서](https://docs.nestjs.com)
- [Supabase + Prisma 가이드](https://supabase.com/docs/guides/database/prisma)

