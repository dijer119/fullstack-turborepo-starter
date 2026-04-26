# 풀스택 할 일(Todo) 앱 디자인 스펙

> **상태:** 초안 (Draft)
> **주제:** NestJS, Prisma, Next.js를 활용한 Turborepo 기반 풀스택 할 일 앱 구현

## 1. 개요
이 프로젝트의 목표는 Turborepo 스타터의 풀스택 역량을 보여주는 완성도 높은 할 일 앱을 구현하는 것입니다. 데이터베이스 영속성, RESTful API, 그리고 효율적인 상태 관리가 포함된 현대적인 프론트엔드를 포함합니다.

## 2. 기술 스택
- **백엔드:** NestJS (apps/api), Prisma ORM, PostgreSQL.
- **프론트엔드:** Next.js (apps/todo), RTK Query, Tailwind CSS.
- **공유 패키지:** `packages/ui` (공용 컴포넌트), `packages/config` (린팅 및 스타일 설정).

## 3. 데이터 모델 (Prisma)
`apps/api/prisma/schema.prisma`에 새로운 `Todo` 모델을 추가합니다:
```prisma
model Todo {
  id        Int      @id @default(autoincrement())
  title     String
  completed Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## 4. 백엔드 구현 (NestJS)
- **모듈:** `TodoModule`
- **컨트롤러:** 다음 REST 엔드포인트를 제공하는 `TodoController`:
  - `GET /todos`: 모든 할 일 목록 조회
  - `POST /todos`: 새로운 할 일 생성
  - `PATCH /todos/:id`: 제목 또는 완료 상태 수정
  - `DELETE /todos/:id`: 할 일 삭제
- **서비스:** `PersistenceService` (Prisma)를 사용하여 DB 작업을 수행하는 `TodoService`.

## 5. 프론트엔드 구현 (Next.js)
- **상태 관리:** API 동기화를 위한 Redux Toolkit Query (RTK Query).
- **API Slice:** `apps/todo/src/store/services/todoApi.ts`에 정의된 `todoApi`.
- **UI 패턴:** `apps/todo/src/screens/TodoScreen.tsx`를 활용한 Screen 패턴.
- **주요 기능:**
  - 실시간 CRUD 작업.
  - 즉각적인 UI 피드백을 위한 낙관적 업데이트 (Optimistic Updates).
  - 상태별 필터링 (전체, 진행 중, 완료).
  - Tailwind CSS를 사용한 반응형 디자인.

## 6. 성공 기준
- [ ] Prisma 마이그레이션을 통해 `Todo` 테이블이 성공적으로 추가됨.
- [ ] API 엔드포인트가 정상 작동하며 Swagger를 통해 확인됨.
- [ ] 프론트엔드에서 모든 CRUD 작업이 성공적으로 수행됨.
- [ ] `apps/api` 및 `apps/todo`에서 빌드 오류가 없음.
- [ ] `packages/ui`의 공유 UI 컴포넌트가 적절히 사용됨.
