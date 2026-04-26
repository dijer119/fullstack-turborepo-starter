# Full-stack Todo App Design Spec

> **Status:** Draft
> **Topic:** Full-stack Todo Application implementation using NestJS, Prisma, and Next.js within a Turborepo.

## 1. Overview
The goal is to implement a production-ready Todo application that demonstrates the full-stack capabilities of this Turborepo starter. This includes database persistence, a RESTful API, and a modern frontend with efficient state management.

## 2. Technical Stack
- **Backend:** NestJS (apps/api), Prisma ORM, PostgreSQL.
- **Frontend:** Next.js (apps/todo), RTK Query, Tailwind CSS.
- **Shared:** `packages/ui` for shared components, `packages/config` for linting/styling.

## 3. Data Model (Prisma)
A new `Todo` model will be added to `apps/api/prisma/schema.prisma`:
```prisma
model Todo {
  id        Int      @id @default(autoincrement())
  title     String
  completed Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## 4. Backend Implementation (NestJS)
- **Module:** `TodoModule`
- **Controller:** `TodoController` providing REST endpoints:
  - `GET /todos`: Fetch all todos.
  - `POST /todos`: Create a new todo.
  - `PATCH /todos/:id`: Update title or completion status.
  - `DELETE /todos/:id`: Remove a todo.
- **Service:** `TodoService` using `PersistenceService` (Prisma) for DB operations.

## 5. Frontend Implementation (Next.js)
- **State Management:** Redux Toolkit Query (RTK Query) for API synchronization.
- **API Slice:** `todoApi` in `apps/todo/src/store/services/todoApi.ts`.
- **UI Pattern:** Screen pattern with `apps/todo/src/screens/TodoScreen.tsx`.
- **Features:**
  - Real-time CRUD operations.
  - Optimistic updates for immediate UI feedback.
  - Filtering by status (All, Active, Completed).
  - Responsive design using Tailwind CSS.

## 6. Success Criteria
- [ ] Prisma migration successfully adds the `Todo` table.
- [ ] API endpoints are functional and verified via Swagger.
- [ ] Frontend successfully performs all CRUD operations.
- [ ] No build errors in `apps/api` or `apps/todo`.
- [ ] Shared UI components from `packages/ui` are utilized.
