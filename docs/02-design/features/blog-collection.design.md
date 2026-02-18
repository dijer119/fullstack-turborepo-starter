# Blog Collection Design Document

> **Summary**: RSS 피드 구독 기반 블로그 글 자동 수집 및 큐레이션 앱 설계
>
> **Project**: fullstack-turborepo-starter
> **Version**: 0.0.0
> **Author**: dijer
> **Date**: 2026-02-18
> **Status**: Draft
> **Planning Doc**: [blog-collection.plan.md](../../01-plan/features/blog-collection.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- RSS XML 파싱을 서버사이드에서 안정적으로 처리
- Supabase를 직접 사용하여 별도 API 서버 없이 데이터 관리
- Server Components 중심으로 클라이언트 상태 최소화
- 10분 간격 자동 갱신으로 최신 글 유지

### 1.2 Design Principles

- **Server-First**: 데이터 fetch는 Server Components에서, 인터랙션만 Client Components에서 처리
- **중복 방지**: guid 기반 upsert로 동일 글 중복 저장 방지
- **점진적 구현**: High 우선순위 기능부터 구현 후 Medium/Low 확장

---

## 2. Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Browser                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ 피드 목록 │  │ 글 목록  │  │ 피드 등록 폼     │  │
│  │ (Server)  │  │ (Server) │  │ (Client)         │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
└───────┼──────────────┼─────────────────┼────────────┘
        │              │                 │
        ▼              ▼                 ▼
┌─────────────────────────────────────────────────────┐
│              Next.js 16.1 (App Router)               │
│  ┌──────────────────┐  ┌────────────────────────┐   │
│  │ Server Components │  │ Route Handlers         │   │
│  │ (Supabase 직접)   │  │ POST /api/rss/fetch    │   │
│  └────────┬─────────┘  │ POST /api/rss/refresh   │   │
│           │             │ GET  /api/cron/refresh   │   │
│           │             └────────────┬───────────┘   │
└───────────┼──────────────────────────┼───────────────┘
            │                          │
            ▼                          ▼
┌──────────────────┐       ┌──────────────────────┐
│    Supabase      │       │  External RSS Feeds   │
│  (PostgreSQL)    │       │  (Naver Blog 등)      │
│  feeds / posts   │       └──────────────────────┘
│  post_tags       │
└──────────────────┘
```

### 2.2 Data Flow

```
[피드 등록]
사용자 RSS URL 입력
    → Route Handler: fetch XML → 파싱 → 채널 정보 추출
    → Supabase: feeds 테이블 INSERT
    → 응답: 성공/실패

[글 수집 (수동/자동)]
새로고침 버튼 또는 cron 트리거
    → Route Handler: feeds 테이블에서 URL 조회
    → 각 피드별 XML fetch → 파싱 → items 추출
    → guid 기반 중복 체크
    → Supabase: posts UPSERT + post_tags INSERT
    → feeds.last_fetched_at 업데이트

[글 조회]
Server Component에서 Supabase 직접 쿼리
    → posts JOIN feeds (피드 정보 포함)
    → 페이지네이션, 필터, 정렬 적용
    → RSC로 렌더링
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| Route Handlers | fast-xml-parser | RSS XML 파싱 |
| Server Components | @supabase/ssr | DB 직접 쿼리 |
| Client Components | @supabase/ssr | 인터랙션 (즐겨찾기 등) |
| Cron (자동 갱신) | Vercel Cron / Route Handler | 10분 간격 피드 갱신 |

---

## 3. Data Model

### 3.1 Entity Definition

```typescript
// types/feed.ts
interface Feed {
  id: string;
  rss_url: string;
  title: string;
  link: string | null;
  description: string | null;
  image_url: string | null;
  language: string | null;
  category: string | null;
  last_fetched_at: string | null;
  created_at: string;
}

// types/post.ts
interface Post {
  id: string;
  feed_id: string;
  guid: string;
  title: string;
  link: string;
  description: string | null;
  author: string | null;
  category: string | null;
  thumbnail: string | null;
  pub_date: string;
  is_read: boolean;
  is_favorite: boolean;
  created_at: string;
}

interface PostWithFeed extends Post {
  feed: Pick<Feed, 'title' | 'image_url'>;
}

// types/post-tag.ts
interface PostTag {
  id: string;
  post_id: string;
  tag: string;
}

// types/rss.ts (파싱 결과)
interface RssChannel {
  title: string;
  link: string;
  description: string;
  image?: { url: string };
  language?: string;
}

interface RssItem {
  guid: string;
  title: string;
  link: string;
  description?: string;
  author?: string;
  category?: string;
  pubDate: string;
  tags: string[];       // 쉼표 구분 tag 필드 → 배열
  thumbnail?: string;   // description 내 첫 img 추출
}
```

### 3.2 Entity Relationships

```
[Feed] 1 ──── N [Post] 1 ──── N [PostTag]
```

### 3.3 Database Schema (Supabase SQL)

```sql
-- feeds 테이블
CREATE TABLE feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rss_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  link TEXT,
  description TEXT,
  image_url TEXT,
  language TEXT,
  category TEXT,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- posts 테이블
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id UUID NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  description TEXT,
  author TEXT,
  category TEXT,
  thumbnail TEXT,
  pub_date TIMESTAMPTZ NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(feed_id, guid)
);

CREATE INDEX idx_posts_feed_id ON posts(feed_id);
CREATE INDEX idx_posts_pub_date ON posts(pub_date DESC);
CREATE INDEX idx_posts_is_read ON posts(is_read);
CREATE INDEX idx_posts_is_favorite ON posts(is_favorite);

-- post_tags 테이블
CREATE TABLE post_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  UNIQUE(post_id, tag)
);

CREATE INDEX idx_post_tags_post_id ON post_tags(post_id);
CREATE INDEX idx_post_tags_tag ON post_tags(tag);

-- RLS (개인 사용이므로 anon 접근 허용)
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON feeds FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON posts FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON post_tags FOR ALL USING (true);
```

---

## 4. API Specification

### 4.1 Route Handlers

| Method | Path | Description | Input |
|--------|------|-------------|-------|
| POST | `/api/rss/fetch` | RSS 피드 파싱 (등록 시 검증용) | `{ url: string }` |
| POST | `/api/rss/refresh` | 특정 피드 또는 전체 피드 글 수집 | `{ feedId?: string }` |
| GET | `/api/cron/refresh` | 자동 갱신 (10분 간격 cron) | - |

### 4.2 Detailed Specification

#### `POST /api/rss/fetch`

피드 URL을 받아 RSS XML을 파싱하고 채널/아이템 정보를 반환합니다. 피드 등록 전 유효성 검증에 사용됩니다.

**Request:**
```json
{ "url": "https://rss.blog.naver.com/park3da.xml" }
```

**Response (200):**
```json
{
  "channel": {
    "title": "무난하게",
    "link": "https://blog.naver.com/park3da",
    "description": "게시글은 모두 저의 주관적인 견해로...",
    "image": { "url": "http://blogpfthumb..." },
    "language": "ko"
  },
  "items": [
    {
      "guid": "https://blog.naver.com/park3da/224184977775",
      "title": "[한국자산신탁] 저PBR 관련주...",
      "link": "https://blog.naver.com/park3da/224184977775",
      "description": "저렴할 때 모아가시라고...",
      "author": "park3da",
      "category": "주식_투자",
      "pubDate": "2026-02-18T07:40:00+09:00",
      "tags": ["무난하게", "한자신", "배당금"],
      "thumbnail": "https://blogthumb.pstatic.net/..."
    }
  ],
  "itemCount": 10
}
```

**Error (400):**
```json
{ "error": "Invalid RSS feed URL or unable to parse" }
```

#### `POST /api/rss/refresh`

등록된 피드의 새 글을 수집합니다.

**Request:**
```json
{ "feedId": "uuid" }       // 특정 피드만
// 또는
{}                          // 전체 피드
```

**Response (200):**
```json
{
  "refreshed": 3,
  "newPosts": 5,
  "errors": []
}
```

#### `GET /api/cron/refresh`

cron에 의해 10분마다 호출됩니다. 모든 피드를 순회하며 새 글을 수집합니다.

**Response (200):**
```json
{ "refreshed": 3, "newPosts": 2 }
```

**Cron 설정 (vercel.json):**
```json
{
  "crons": [
    {
      "path": "/api/cron/refresh",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

**로컬 개발 시**: Route Handler를 수동 호출하거나, `setInterval`로 클라이언트에서 polling

### 4.3 Server Actions

Supabase 데이터 변경은 Server Actions으로 처리합니다.

```typescript
// actions/feed.ts
"use server"
async function addFeed(rssUrl: string): Promise<Feed>
async function deleteFeed(feedId: string): Promise<void>
async function updateFeedCategory(feedId: string, category: string): Promise<void>

// actions/post.ts
"use server"
async function toggleFavorite(postId: string): Promise<void>
async function toggleRead(postId: string): Promise<void>
async function markAllAsRead(feedId?: string): Promise<void>
```

---

## 5. UI/UX Design

### 5.1 Screen Layout

```
┌────────────────────────────────────────────────────────┐
│  Header: Blog Collection          [새로고침] [피드관리]  │
├──────────┬─────────────────────────────────────────────┤
│ Sidebar  │  Main Content                               │
│          │                                              │
│ 전체 글  │  ┌─────────────────────────────────────────┐ │
│ ────── │  │ 검색바 + 필터 (태그, 읽음 상태)          │ │
│ 피드 A  │  ├─────────────────────────────────────────┤ │
│ 피드 B  │  │ PostCard                                │ │
│ 피드 C  │  │ ┌──────┐ 글 제목                        │ │
│          │  │ │ 썸네일│ 블로그명 · 2시간 전  ☆ 📖   │ │
│ ────── │  │ │      │ 글 설명 미리보기...            │ │
│ 카테고리 │  │ └──────┘ [태그1] [태그2]                │ │
│ 투자     │  ├─────────────────────────────────────────┤ │
│ 기술     │  │ PostCard ...                            │ │
│          │  ├─────────────────────────────────────────┤ │
│          │  │ 페이지네이션: < 1 2 3 ... >             │ │
│          │  └─────────────────────────────────────────┘ │
└──────────┴─────────────────────────────────────────────┘

모바일:
┌────────────────────────┐
│ Blog Collection  [≡]   │
├────────────────────────┤
│ [검색] [필터]           │
├────────────────────────┤
│ PostCard               │
│ ┌────┐ 글 제목         │
│ │썸네│ 블로그명 · 2h전 │
│ │일  │ 미리보기...     │
│ └────┘ [태그1] [태그2]  │
├────────────────────────┤
│ PostCard ...           │
└────────────────────────┘
```

### 5.2 User Flow

```
[메인] 전체 글 목록 (최신순)
  ├── 사이드바에서 피드 선택 → 해당 피드 글만 표시
  ├── 태그 클릭 → 태그별 필터링
  ├── 검색 → 제목/설명 검색 결과
  ├── 글 카드 클릭 → 원본 블로그 새 탭으로 열기 + 읽음 표시
  ├── ☆ 클릭 → 즐겨찾기 토글
  └── [피드 관리] → 피드 목록/등록/삭제 페이지

[피드 관리]
  ├── 피드 목록 (이름, URL, 글 수, 마지막 수집일)
  ├── [+ 피드 추가] → RSS URL 입력 → 검증 → 등록
  └── [삭제] → 확인 → 피드 + 관련 글 삭제
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `Sidebar` | `components/layout/Sidebar.tsx` | 피드 목록, 카테고리 네비게이션 |
| `Header` | `components/layout/Header.tsx` | 앱 헤더, 새로고침/피드관리 버튼 |
| `PostCard` | `components/post/PostCard.tsx` | 글 카드 (썸네일, 제목, 설명, 태그) |
| `PostList` | `components/post/PostList.tsx` | 글 목록 + 페이지네이션 |
| `SearchBar` | `components/ui/SearchBar.tsx` | 검색 입력 |
| `TagFilter` | `components/ui/TagFilter.tsx` | 태그 필터 칩 |
| `FeedForm` | `components/feed/FeedForm.tsx` | RSS URL 입력 폼 (Client) |
| `FeedList` | `components/feed/FeedList.tsx` | 구독 피드 목록 |
| `RefreshButton` | `components/ui/RefreshButton.tsx` | 새로고침 버튼 (Client) |

---

## 6. Error Handling

### 6.1 Error Scenarios

| Scenario | Cause | Handling |
|----------|-------|----------|
| RSS fetch 실패 | 네트워크 오류, 유효하지 않은 URL | 에러 메시지 표시, 재시도 안내 |
| RSS 파싱 실패 | 비표준 XML 형식 | "파싱할 수 없는 피드입니다" 메시지 |
| 중복 피드 등록 | 이미 등록된 RSS URL | "이미 구독 중인 피드입니다" 메시지 |
| Supabase 오류 | DB 연결/쿼리 실패 | 콘솔 로그 + 사용자에게 일반 에러 표시 |
| Cron 실패 | 서버 오류 | 로그 기록, 다음 주기에 재시도 |

### 6.2 Server Action 에러 패턴

```typescript
"use server"
async function addFeed(rssUrl: string) {
  try {
    // 1. RSS fetch & 파싱
    // 2. Supabase INSERT
    return { data: feed, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
```

---

## 7. Security Considerations

- [x] Server-side RSS fetch (CORS 우회, 외부 URL 직접 노출 방지)
- [x] Input validation (URL 형식 검증)
- [ ] Supabase RLS 설정 (개인 사용이므로 anon 전체 허용)
- [x] Cron 엔드포인트 보호 (Vercel Cron 시크릿 또는 환경변수 체크)
- [x] HTML sanitization (description 렌더링 시 XSS 방지)

---

## 8. RSS Parsing Logic

### 8.1 파싱 라이브러리

`fast-xml-parser` 사용 (경량, 빠름, 타입 지원)

### 8.2 파싱 흐름

```typescript
// lib/rss/parser.ts
import { XMLParser } from "fast-xml-parser";

function parseRssFeed(xmlString: string): { channel: RssChannel; items: RssItem[] } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: true,
    htmlEntities: true,
  });
  const result = parser.parse(xmlString);
  const channel = result.rss.channel;

  return {
    channel: {
      title: extractCDATA(channel.title),
      link: extractCDATA(channel.link),
      description: extractCDATA(channel.description),
      image: channel.image ? { url: extractCDATA(channel.image.url) } : undefined,
      language: channel.language,
    },
    items: normalizeItems(channel.item).map(item => ({
      guid: extractCDATA(item.guid) || extractCDATA(item.link),
      title: extractCDATA(item.title),
      link: extractCDATA(item.link),
      description: extractCDATA(item.description),
      author: item.author,
      category: extractCDATA(item.category),
      pubDate: item.pubDate,
      tags: parseCommaTags(item.tag),
      thumbnail: extractFirstImage(item.description),
    })),
  };
}

function parseCommaTags(tagStr?: string): string[] {
  if (!tagStr) return [];
  return extractCDATA(tagStr).split(",").map(t => t.trim()).filter(Boolean);
}

function extractFirstImage(html?: string): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src="([^"]+)"/);
  return match ? match[1] : null;
}
```

---

## 9. Clean Architecture

### 9.1 Layer Structure

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Presentation** | Pages, UI 컴포넌트 | `src/app/`, `src/components/` |
| **Application** | Server Actions, 비즈니스 로직 | `src/actions/`, `src/app/api/` |
| **Domain** | 타입 정의, 비즈니스 규칙 | `src/types/` |
| **Infrastructure** | Supabase 클라이언트, RSS 파서 | `src/lib/supabase/`, `src/lib/rss/` |

### 9.2 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| PostCard, PostList, Sidebar | Presentation | `src/components/` |
| addFeed, toggleFavorite | Application | `src/actions/` |
| Feed, Post, RssItem types | Domain | `src/types/` |
| Supabase client, RSS parser | Infrastructure | `src/lib/` |
| RSS Route Handlers | Application | `src/app/api/rss/` |
| Cron Handler | Application | `src/app/api/cron/` |

---

## 10. Coding Convention

### 10.1 Naming Conventions

| Target | Rule | Example |
|--------|------|---------|
| Components | PascalCase | `PostCard`, `FeedForm` |
| Server Actions | camelCase | `addFeed()`, `toggleFavorite()` |
| Types/Interfaces | PascalCase | `Feed`, `PostWithFeed` |
| Files (component) | PascalCase.tsx | `PostCard.tsx` |
| Files (utility) | camelCase.ts | `parser.ts` |
| Folders | kebab-case | `post-tags/`, `feed/` |
| Route Handlers | route.ts in kebab-case dir | `api/rss/fetch/route.ts` |

### 10.2 This Feature's Conventions

| Item | Convention Applied |
|------|-------------------|
| Component naming | PascalCase, 기능별 디렉토리 분리 |
| File organization | App Router 기반, `components/`, `actions/`, `lib/`, `types/` |
| State management | Server Components 기본, 인터랙션만 Client Components |
| Error handling | Server Action try/catch → `{ data, error }` 패턴 |

---

## 11. Implementation Guide

### 11.1 File Structure

```
apps/blog-collection/src/
├── app/
│   ├── layout.tsx                  # 루트 레이아웃 (Sidebar 포함)
│   ├── page.tsx                    # 전체 글 목록
│   ├── feed/[id]/page.tsx          # 특정 피드 글 목록
│   ├── feeds/
│   │   ├── page.tsx                # 피드 관리 페이지
│   │   └── add/page.tsx            # 피드 등록 페이지
│   └── api/
│       ├── rss/
│       │   ├── fetch/route.ts      # RSS 파싱 API
│       │   └── refresh/route.ts    # 글 수집 API
│       └── cron/
│           └── refresh/route.ts    # 자동 갱신 cron
├── actions/
│   ├── feed.ts                     # 피드 CRUD Server Actions
│   └── post.ts                     # 글 상태 변경 Server Actions
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   ├── feed/
│   │   ├── FeedForm.tsx
│   │   └── FeedList.tsx
│   ├── post/
│   │   ├── PostCard.tsx
│   │   └── PostList.tsx
│   └── ui/
│       ├── SearchBar.tsx
│       ├── TagFilter.tsx
│       └── RefreshButton.tsx
├── lib/
│   ├── supabase/                   # (설정 완료)
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── proxy.ts
│   └── rss/
│       └── parser.ts               # RSS XML 파싱 유틸
├── types/
│   ├── feed.ts
│   ├── post.ts
│   └── rss.ts
└── proxy.ts                        # (설정 완료)
```

### 11.2 Implementation Order

1. [ ] **인프라**: 패키지 설치 (`fast-xml-parser`)
2. [ ] **Domain**: 타입 정의 (`types/feed.ts`, `types/post.ts`, `types/rss.ts`)
3. [ ] **DB**: Supabase 테이블 생성 (SQL 실행)
4. [ ] **Infrastructure**: RSS 파서 (`lib/rss/parser.ts`)
5. [ ] **API**: Route Handlers (`api/rss/fetch`, `api/rss/refresh`)
6. [ ] **API**: Cron Handler (`api/cron/refresh`)
7. [ ] **Actions**: Server Actions (`actions/feed.ts`, `actions/post.ts`)
8. [ ] **UI**: 레이아웃 컴포넌트 (`Sidebar`, `Header`)
9. [ ] **UI**: 글 컴포넌트 (`PostCard`, `PostList`)
10. [ ] **Page**: 메인 페이지 (`page.tsx` — 전체 글 목록)
11. [ ] **Page**: 피드별 글 페이지 (`feed/[id]/page.tsx`)
12. [ ] **UI**: 피드 관리 (`FeedForm`, `FeedList`)
13. [ ] **Page**: 피드 관리 페이지 (`feeds/page.tsx`, `feeds/add/page.tsx`)
14. [ ] **기능**: 검색, 태그 필터, 즐겨찾기, 읽음 표시
15. [ ] **검증**: 빌드, 타입 체크, 전체 동작 확인

### 11.3 Dependencies to Install

```bash
cd apps/blog-collection
yarn add fast-xml-parser
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-18 | Initial draft | dijer |
