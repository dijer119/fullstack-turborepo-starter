# API - NestJS Backend

NestJS와 Prisma를 사용한 백엔드 API 서버입니다.

## 기능

- ✅ NestJS v10.4
- ✅ Prisma ORM v6.1
- ✅ PostgreSQL (Supabase 지원)
- ✅ Swagger API 문서
- ✅ Class Validator를 통한 입력 검증
- ✅ Jest 유닛 & E2E 테스트

## 환경변수 설정

### Supabase 사용 시

```bash
cp .env.supabase.example .env
```

`.env` 파일을 열어서 다음 정보를 입력:

```env
# Database
DATABASE_URL="postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"

# Supabase (Optional)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your-anon-key-here

# Application
NODE_ENV=development
PORT=3001
```

## 개발 서버 실행

```bash
# 개발 모드 (HMR)
yarn dev

# 일반 모드
yarn start

# Watch 모드
yarn start:debug
```

## 빌드

```bash
yarn build
```

## 테스트

```bash
# 유닛 테스트
yarn test

# E2E 테스트
yarn test:e2e

# 테스트 커버리지
yarn test:cov

# Watch 모드
yarn test:watch
```

## Prisma 명령어

```bash
# Prisma Client 생성
npx prisma generate

# 마이그레이션 생성 및 실행
npx prisma migrate dev --name init

# Prisma Studio (DB GUI)
npx prisma studio

# 데이터베이스 리셋
npx prisma migrate reset
```

## API 문서

서버 실행 후 다음 URL에서 Swagger 문서 확인:

```
http://localhost:3001/docs
```

## Users API 엔드포인트

### Create User
```http
POST /users
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "John Doe"
}
```

### Get All Users
```http
GET /users
```

### Get User by ID
```http
GET /users/:id
```

### Update User
```http
PATCH /users/:id
Content-Type: application/json

{
  "name": "Updated Name"
}
```

### Delete User
```http
DELETE /users/:id
```

### Get Users Count
```http
GET /users/count
```

## 테스트 예시

### 유닛 테스트 실행
```bash
# Users Service 테스트
yarn test users.service

# Users Controller 테스트
yarn test users.controller
```

### E2E 테스트 실행
```bash
# Users E2E 테스트
yarn test:e2e users.e2e-spec
```

## 프로젝트 구조

```
src/
├── config/              # 환경변수 설정
│   └── environment-variables.ts
├── persistence/         # 데이터베이스 모듈
│   └── prisma/
│       ├── prisma.service.ts
│       └── prisma.service.spec.ts
├── users/              # Users 모듈
│   ├── dto/
│   │   ├── create-user.dto.ts
│   │   └── update-user.dto.ts
│   ├── users.controller.ts
│   ├── users.controller.spec.ts
│   ├── users.service.ts
│   ├── users.service.spec.ts
│   └── users.module.ts
├── app.module.ts       # 루트 모듈
└── main.ts            # 엔트리 포인트

prisma/
├── schema.prisma      # Prisma 스키마
└── migrations/        # 마이그레이션 파일

test/
├── app.e2e-spec.ts    # App E2E 테스트
├── users.e2e-spec.ts  # Users E2E 테스트
└── jest-e2e.json      # E2E 테스트 설정
```

## 새로운 모듈 추가하기

1. 모듈 생성
```bash
npx nest g module posts
npx nest g controller posts
npx nest g service posts
```

2. Prisma 스키마에 모델 추가
```prisma
model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("posts")
}
```

3. 마이그레이션 실행
```bash
npx prisma migrate dev --name add_posts
```

## 문제 해결

### Prisma Client 오류
```bash
npx prisma generate
```

### 마이그레이션 실패
```bash
npx prisma migrate reset
npx prisma migrate dev
```

### 테스트 실패
데이터베이스 연결 확인 및 환경변수 설정 확인
