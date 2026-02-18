# Blog Collection Planning Document

> **Summary**: RSS 피드를 구독하여 블로그 글을 자동 수집하고 큐레이션하는 웹 애플리케이션
>
> **Project**: fullstack-turborepo-starter
> **Version**: 0.0.0
> **Author**: dijer
> **Date**: 2026-02-18
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

RSS 피드 URL을 등록하면 블로그 글을 자동으로 수집하여, 피드별/카테고리별/태그별로 정리하고 쉽게 탐색할 수 있는 RSS 리더형 블로그 큐레이션 도구를 제공합니다.

### 1.2 Background

- 관심 블로거의 새 글을 빠짐없이 확인하고 싶지만, 일일이 방문하기 번거로움
- 네이버 블로그 등 RSS를 제공하는 플랫폼의 피드를 구독하여 자동 수집
- 참고 RSS: `https://rss.blog.naver.com/{blogId}.xml`
- Supabase를 활용하여 별도 백엔드 없이 빠르게 구축 가능

### 1.3 Related Documents

- CLAUDE.md: 프로젝트 아키텍처 가이드
- apps/blog-collection: Next.js 16.1 앱 (App Router + Supabase SSR 설정 완료)

---

## 2. Scope

### 2.1 In Scope

- [ ] RSS 피드 구독 관리 (피드 URL 등록/삭제)
- [ ] RSS 피드 파싱 및 블로그 글 자동 수집
- [ ] 피드별/카테고리별 글 목록 조회 (페이지네이션, 정렬)
- [ ] 블로그 글 상세 보기 (본문 미리보기, 원본 링크)
- [ ] 태그 기반 필터링 (RSS item의 tag 필드 활용)
- [ ] 즐겨찾기 및 읽음 표시
- [ ] 텍스트 검색 (제목, 설명)
- [ ] RSS 자동 갱신 (cron/스케줄링) — 10분마다

### 2.2 Out of Scope

- 사용자 인증/회원가입 (개인 사용 목적, 추후 확장 가능)
- RSS 자동 갱신 (cron/스케줄링) — 수동 새로고침으로 시작
- 블로그 글 전문 크롤링/스크래핑
- OPML 가져오기/내보내기
- 소셜 공유 기능
- 모바일 앱

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | RSS 피드 URL 등록 (URL 입력 → 피드 유효성 검증 → 채널 정보 저장) | High | Pending |
| FR-02 | RSS 피드 파싱 및 글 수집 (피드별 수동 새로고침) | High | Pending |
| FR-03 | 글 목록 조회 (전체/피드별, 페이지네이션, 최신순 정렬) | High | Pending |
| FR-04 | 글 상세 보기 (본문 미리보기 + 원본 링크 이동) | High | Pending |
| FR-05 | 피드 관리 (목록 조회, 삭제, 카테고리 지정) | High | Pending |
| FR-06 | 태그 필터링 (RSS item의 tag 필드 기반) | Medium | Pending |
| FR-07 | 텍스트 검색 (제목, 설명) | Medium | Pending |
| FR-08 | 즐겨찾기 토글 | Medium | Pending |
| FR-09 | 읽음/안읽음 표시 | Medium | Pending |
| FR-10 | 피드 카테고리 관리 (그룹핑) | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 목록 조회 < 500ms | Supabase query 시간 측정 |
| Performance | RSS 피드 파싱 < 3s | Route Handler 응답 시간 |
| UX | 반응형 디자인 (모바일/태블릿/데스크톱) | 브라우저 DevTools 검증 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 모든 Functional Requirements (High) 구현 완료
- [ ] Supabase 테이블 및 RLS 정책 설정
- [ ] 빌드 성공 (`yarn build`)
- [ ] 반응형 UI 동작 확인

### 4.2 Quality Criteria

- [ ] TypeScript strict mode 에러 없음
- [ ] Lint 에러 없음
- [ ] 빌드 성공

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| RSS 피드 fetch 실패 (CORS) | High | High | Next.js Route Handler로 서버사이드 fetch 처리 |
| RSS 형식 비표준 (파싱 실패) | Medium | Medium | xml2js 등 유연한 파서 사용, 에러 핸들링 |
| Supabase 무료 플랜 제한 | Low | Medium | 쿼리 최적화, 필요시 유료 전환 |
| 대량 글 수집 시 성능 저하 | Medium | Low | 페이지네이션, 인덱스, 중복 방지 (guid 기반) |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites, portfolios | ☐ |
| **Dynamic** | Feature-based modules, BaaS integration | Web apps with backend, SaaS MVPs | ☑ |
| **Enterprise** | Strict layer separation, DI, microservices | High-traffic systems | ☐ |

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | Next.js 16.1 | Next.js 16.1 | 이미 초기화 완료, App Router 사용 |
| Data Layer | Supabase | Supabase | 직접 DB 접근, 별도 API 서버 불필요 |
| Styling | Tailwind CSS v4 | Tailwind CSS v4 | 이미 설정 완료, 빠른 UI 개발 |
| RSS Parsing | Route Handler + xml2js | Route Handler | CORS 우회, 서버사이드 XML 파싱 |
| State | Server Components | Server Components | Next.js 16 기본, 클라이언트 상태 최소화 |

### 6.3 RSS 수집 흐름

```
사용자가 RSS URL 등록
    ↓
Route Handler: RSS XML fetch & 파싱
    ↓
채널 정보 저장 (feeds 테이블)
    ↓
사용자가 "새로고침" 클릭
    ↓
Route Handler: RSS XML fetch & 파싱
    ↓
새 글만 저장 (guid 기반 중복 방지 → posts 테이블)
    ↓
태그 저장 (post_tags 테이블)
```

### 6.4 Clean Architecture Approach

```
Selected Level: Dynamic

Folder Structure:
apps/blog-collection/src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx
│   ├── page.tsx            # 메인 피드 목록 (전체 글)
│   ├── feeds/              # 피드 관리
│   │   ├── page.tsx        # 구독 피드 목록
│   │   └── add/page.tsx    # 새 피드 등록
│   ├── feed/[id]/          # 특정 피드의 글 목록
│   │   └── page.tsx
│   └── api/                # Route Handlers
│       └── rss/            # RSS fetch & 파싱
├── components/             # UI 컴포넌트
│   ├── feed/               # 피드 관련 컴포넌트
│   ├── post/               # 글 관련 컴포넌트
│   └── ui/                 # 공통 UI 컴포넌트
├── lib/
│   ├── supabase/           # Supabase 클라이언트 (설정 완료)
│   ├── rss/                # RSS 파싱 유틸리티
│   └── utils/              # 유틸리티 함수
└── types/                  # TypeScript 타입 정의
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` has coding conventions section
- [ ] `docs/01-plan/conventions.md` exists
- [ ] `CONVENTIONS.md` exists
- [x] ESLint configuration (`eslint.config.mjs`)
- [ ] Prettier configuration
- [x] TypeScript configuration (`tsconfig.json`)

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **Naming** | exists (monorepo) | kebab-case 파일명, PascalCase 컴포넌트 | High |
| **Folder structure** | exists (App Router) | feature-based 구조 | High |
| **Import order** | missing | external → internal → relative | Medium |
| **Error handling** | missing | Server Action try/catch 패턴 | Medium |

### 7.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Client | ☑ (완료) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 | Client | ☑ (완료) |

---

## 8. Database Schema (Supabase)

### 8.1 Tables

**feeds** (RSS 피드 구독 정보)
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| rss_url | text | NOT NULL, UNIQUE |
| title | text | NOT NULL |
| link | text | nullable (블로그 홈 URL) |
| description | text | nullable |
| image_url | text | nullable (블로그 프로필 이미지) |
| language | text | nullable |
| category | text | nullable (피드 그룹핑용) |
| last_fetched_at | timestamptz | nullable |
| created_at | timestamptz | default now() |

**posts** (RSS에서 수집한 블로그 글)
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| feed_id | uuid | FK → feeds.id, ON DELETE CASCADE |
| guid | text | NOT NULL |
| title | text | NOT NULL |
| link | text | NOT NULL |
| description | text | nullable (본문 미리보기 HTML) |
| author | text | nullable |
| category | text | nullable (RSS item의 category) |
| thumbnail | text | nullable (description 내 첫 이미지) |
| pub_date | timestamptz | NOT NULL |
| is_read | boolean | default false |
| is_favorite | boolean | default false |
| created_at | timestamptz | default now() |
| UNIQUE(feed_id, guid) | | |

**post_tags** (RSS item의 태그)
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| post_id | uuid | FK → posts.id, ON DELETE CASCADE |
| tag | text | NOT NULL |
| UNIQUE(post_id, tag) | | |

### 8.2 Indexes

- `feeds.rss_url` (UNIQUE)
- `posts.feed_id`
- `posts.pub_date DESC`
- `posts.is_read`
- `posts.is_favorite`
- `posts.(feed_id, guid)` (UNIQUE)
- `post_tags.post_id`
- `post_tags.tag`

### 8.3 RSS → DB 매핑

| RSS Field | DB Column | 비고 |
|-----------|-----------|------|
| **Channel** | | |
| channel.title | feeds.title | 블로그 이름 |
| channel.link | feeds.link | 블로그 홈 URL |
| channel.description | feeds.description | 블로그 설명 |
| channel.image.url | feeds.image_url | 프로필 이미지 |
| channel.language | feeds.language | "ko" 등 |
| **Item** | | |
| item.guid | posts.guid | 중복 방지 키 |
| item.title | posts.title | 글 제목 |
| item.link | posts.link | 글 URL |
| item.description | posts.description | 본문 HTML |
| item.author | posts.author | 작성자 ID |
| item.category | posts.category | RSS 카테고리 |
| item.pubDate | posts.pub_date | 발행일 |
| item.tag | post_tags.tag | 쉼표 구분 → 개별 행 |
| description 내 img | posts.thumbnail | 첫 번째 이미지 URL 추출 |

---

## 9. Next Steps

1. [ ] Design 문서 작성 (`/pdca design blog-collection`)
2. [ ] Supabase 테이블 생성 (Migration)
3. [ ] 구현 시작

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-18 | Initial draft | dijer |
| 0.2 | 2026-02-18 | RSS 피드 기반으로 수집 방식 변경 | dijer |
