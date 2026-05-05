# 풀스택 할 일(Todo) 앱 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NestJS 백엔드와 Next.js 프론트엔드를 연동하여 데이터베이스 기반의 풀스택 할 일 관리 앱을 구축합니다.

**Architecture:** NestJS에서 Prisma를 사용하여 PostgreSQL DB와 통신하는 REST API를 구축하고, Next.js 프론트엔드에서는 RTK Query를 사용하여 서버 상태 관리 및 낙관적 업데이트를 구현합니다.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js, RTK Query, Tailwind CSS, Lucide React.

---

### Task 1: 백엔드 데이터베이스 스키마 설정

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Todo 모델 추가**

```prisma
// apps/api/prisma/schema.prisma 하단에 추가
model Todo {
  id        Int      @id @default(autoincrement())
  title     String
  completed Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Prisma 마이그레이션 실행**

명령어: `cd apps/api && npx prisma migrate dev --name add_todo_model`
예상 결과: `Todo` 테이블이 DB에 생성되고 Prisma Client가 업데이트됨.

- [ ] **Step 3: 커밋**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(api): add Todo model to prisma schema"
```

---

### Task 2: 백엔드 REST API 구현

**Files:**
- Create: `apps/api/src/todos/dto/create-todo.dto.ts`
- Create: `apps/api/src/todos/dto/update-todo.dto.ts`
- Create: `apps/api/src/todos/todos.service.ts`
- Create: `apps/api/src/todos/todos.controller.ts`
- Create: `apps/api/src/todos/todos.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: DTO 생성**

```typescript
// apps/api/src/todos/dto/create-todo.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTodoDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;
}

// apps/api/src/todos/dto/update-todo.dto.ts
import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTodoDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  completed?: boolean;
}
```

- [ ] **Step 2: TodosService 구현**

```typescript
// apps/api/src/todos/todos.service.ts
import { Injectable } from '@nestjs/common';
import { PersistenceService } from '../persistence/persistence.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

@Injectable()
export class TodosService {
  constructor(private prisma: PersistenceService) {}

  findAll() {
    return this.prisma.todo.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  create(createTodoDto: CreateTodoDto) {
    return this.prisma.todo.create({
      data: createTodoDto,
    });
  }

  update(id: number, updateTodoDto: UpdateTodoDto) {
    return this.prisma.todo.update({
      where: { id },
      data: updateTodoDto,
    });
  }

  remove(id: number) {
    return this.prisma.todo.delete({
      where: { id },
    });
  }
}
```

- [ ] **Step 3: TodosController 구현**

```typescript
// apps/api/src/todos/todos.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TodosService } from './todos.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

@ApiTags('todos')
@Controller('todos')
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  findAll() {
    return this.todosService.findAll();
  }

  @Post()
  create(@Body() createTodoDto: CreateTodoDto) {
    return this.todosService.create(createTodoDto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateTodoDto: UpdateTodoDto) {
    return this.todosService.update(id, updateTodoDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.todosService.remove(id);
  }
}
```

- [ ] **Step 4: TodosModule 등록**

`apps/api/src/todos/todos.module.ts` 생성 후 `AppModule`에 추가.

- [ ] **Step 5: API 테스트**

`nps dev` 실행 후 `http://localhost:3001/docs`에서 Todo API가 노출되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add apps/api/src/todos apps/api/src/app.module.ts
git commit -m "feat(api): implement Todo REST API"
```

---

### Task 3: 프론트엔드 Redux 및 RTK Query 설정

**Files:**
- Create: `apps/todo/src/store/services/todoApi.ts`
- Create: `apps/todo/src/store/index.ts`
- Modify: `apps/todo/pages/_app.tsx`

- [ ] **Step 1: todoApi 정의**

```typescript
// apps/todo/src/store/services/todoApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

export const todoApi = createApi({
  reducerPath: 'todoApi',
  baseQuery: fetchBaseQuery({ baseUrl: 'http://localhost:3001/' }),
  tagTypes: ['Todo'],
  endpoints: (builder) => ({
    getTodos: builder.query<Todo[], void>({
      query: () => 'todos',
      providesTags: ['Todo'],
    }),
    addTodo: builder.mutation<Todo, string>({
      query: (title) => ({
        url: 'todos',
        method: 'POST',
        body: { title },
      }),
      invalidatesTags: ['Todo'],
    }),
    toggleTodo: builder.mutation<Todo, { id: number; completed: boolean }>({
      query: ({ id, completed }) => ({
        url: `todos/${id}`,
        method: 'PATCH',
        body: { completed },
      }),
      invalidatesTags: ['Todo'],
    }),
    deleteTodo: builder.mutation<void, number>({
      query: (id) => ({
        url: `todos/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Todo'],
    }),
  }),
});

export const { useGetTodosQuery, useAddTodoMutation, useToggleTodoMutation, useDeleteTodoMutation } = todoApi;
```

- [ ] **Step 2: Store 설정 및 Provider 적용**

`apps/todo/src/store/index.ts` 작성 및 `_app.tsx`에서 `Provider`로 감싸기.

- [ ] **Step 3: 커밋**

```bash
git add apps/todo/src/store apps/todo/pages/_app.tsx
git commit -m "feat(todo): setup RTK Query for todo api"
```

---

### Task 4: UI 컴포넌트 및 화면 구현

**Files:**
- Create: `apps/todo/src/screens/TodoScreen.tsx`
- Modify: `apps/todo/pages/index.tsx`
- Create: `apps/todo/src/components/TodoItem.tsx`

- [ ] **Step 1: TodoItem 컴포넌트 구현**

```typescript
// apps/todo/src/components/TodoItem.tsx
import React from 'react';
import { Trash2, CheckCircle, Circle } from 'lucide-react';
import { Todo } from '../store/services/todoApi';

interface Props {
  todo: Todo;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
}

export const TodoItem = ({ todo, onToggle, onDelete }: Props) => (
  <li className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
    <div className="flex items-center gap-3">
      <button onClick={() => onToggle(todo.id, !todo.completed)} className="text-blue-500">
        {todo.completed ? <CheckCircle className="fill-current" /> : <Circle />}
      </button>
      <span className={`${todo.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
        {todo.title}
      </span>
    </div>
    <button onClick={() => onDelete(todo.id)} className="text-red-400 hover:text-red-600 transition-colors">
      <Trash2 size={20} />
    </button>
  </li>
);
```

- [ ] **Step 2: TodoScreen 구현 (RTK Query 연동)**

`useGetTodosQuery` 등을 사용하여 데이터 바인딩 및 핸들러 연결.

- [ ] **Step 3: 필터링 및 요약 정보 추가**

(All, Active, Completed) 필터 상태 구현.

- [ ] **Step 4: 커밋**

```bash
git add apps/todo/src/screens apps/todo/src/components apps/todo/pages/index.tsx
git commit -m "feat(todo): implement todo screen with real api integration"
```

---

### Task 5: 빌드 및 최종 확인

- [ ] **Step 1: 전체 빌드 확인**

명령어: `nps build`
예상 결과: 모든 앱과 패키지가 성공적으로 빌드됨.

- [ ] **Step 2: 런타임 테스트**

명령어: `nps dev`
수동 확인: `http://localhost:3000`에서 할 일 추가/수정/삭제가 DB에 반영되는지 확인.

- [ ] **Step 3: 최종 커밋**

```bash
git commit -m "docs: complete full-stack todo app implementation"
```
