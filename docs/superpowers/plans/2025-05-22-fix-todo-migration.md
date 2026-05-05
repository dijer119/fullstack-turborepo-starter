# Fix Todo Model and Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the Todo model to use snake_case database mapping and establish a proper Prisma migration history.

**Architecture:** Update the Prisma schema to use `@map` for columns and `@@map` for the table name, then use `prisma migrate dev` to generate a migration file.

**Tech Stack:** Prisma, PostgreSQL, NestJS.

---

### Task 1: Update Prisma Schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Update the Todo model in schema.prisma**

Update the `Todo` model to include `@map` for `createdAt` and `updatedAt`, and `@@map("todos")` for the table name.

```prisma
model Todo {
  id        Int      @id @default(autoincrement())
  title     String
  completed Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  @@map("todos")
}
```

### Task 2: Generate Prisma Migration

**Files:**
- Create: `apps/api/prisma/migrations/*/migration.sql`

- [ ] **Step 1: Run prisma migrate dev**

Execute the migration command to generate the migration file and apply it to the database.

Run: `cd apps/api && npx prisma migrate dev --name add_todos`

Expected: A new migration directory created in `apps/api/prisma/migrations/` and the database updated.

### Task 3: Verification

**Files:**
- Check: `apps/api/prisma/migrations/`

- [ ] **Step 1: Verify migration file existence**

Check if the `add_todos` migration folder and `migration.sql` file exist.

Run: `ls -R apps/api/prisma/migrations/ | grep add_todos`

- [ ] **Step 2: Verify database schema (Optional but recommended)**

If possible, check if the table `todos` exists and has columns `created_at` and `updated_at`.

Run: `cd apps/api && npx prisma introspect` (Actually `db pull` is better if we want to check, but we trust migrate dev for now).
Alternative: `npx prisma studio` and check manually if it was interactive, but since it's not, we rely on the migration file and command success.
Better check: `grep -C 5 "todos" apps/api/prisma/migrations/*/migration.sql`
