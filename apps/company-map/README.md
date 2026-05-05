# Company Map

산업·기업 N:M 매핑 시각화 본인용 도구. Prisma + SQLite 단일 파일 DB로 동작 (외부 의존성 0).

## Setup

1. `cp .env.example .env.local` (DATABASE_URL이 들어가 있음 — 그대로 사용 가능)
2. 첫 실행 시 마이그레이션:
   ```
   yarn workspace company-map prisma migrate dev
   yarn workspace company-map prisma generate
   ```
   → `apps/company-map/data/company-map.db` 자동 생성됨
3. 개발 서버:
   ```
   yarn workspace company-map dev
   ```
   포트 3004
4. `/import` 페이지에서 KRX CSV 업로드 → `/industries`에서 트리 작성 → `/`에서 시각화

## 구조

- 데이터: SQLite 단일 파일 — `industries`(self-tree), `companies`, `company_industries`(N:M)
- ORM: Prisma (`prisma/schema.prisma` 단일 source of truth, type 자동 생성)
- 시각화: React Flow + d3-force, 양방향(산업↔기업) 자유 탐색

## 백업

DB 파일(`data/company-map.db`)을 그대로 복사하면 끝. 다른 머신으로 옮기는 것도 같은 방법.

## 마이그레이션 변경

스키마 변경 시:
```
yarn workspace company-map prisma migrate dev --name <change-name>
```
