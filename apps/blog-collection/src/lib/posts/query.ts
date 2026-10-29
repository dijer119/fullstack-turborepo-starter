import { createClient } from "@/lib/supabase/server";
import type { PostWithFeed } from "@/types/post";

export const PAGE_SIZE = 20;

export interface PostListFilters {
  feedId?: string;
  search?: string;
  tag?: string;
  showFavorites?: boolean;
}

export interface PostListItem extends PostWithFeed {
  tags: string[];
}

export interface PostsPage {
  posts: PostListItem[];
  hasMore: boolean;
  error: string | null;
}

// 서버 컴포넌트(1페이지)와 서버 액션(이후 페이지)이 공유하는 목록 조회.
export async function fetchPostsPage(
  { feedId, search, tag, showFavorites }: PostListFilters,
  page: number
): Promise<PostsPage> {
  const supabase = await createClient();

  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // 태그 필터는 inner join으로 쿼리 단계에서 걸러 페이지마다 PAGE_SIZE개가 정확히 나오게 한다.
  const select = tag
    ? "*, feed:feeds(title, image_url), post_tags!inner(tag)"
    : "*, feed:feeds(title, image_url)";

  let query = supabase
    .from("posts")
    .select(select, { count: "exact" })
    // pub_date 동률이 흔해 id 2차 정렬이 없으면 오프셋 페이지 사이에 글이 중복·누락된다.
    .order("pub_date", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (feedId) {
    query = query.eq("feed_id", feedId);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  if (showFavorites) {
    query = query.eq("is_favorite", true);
  }

  if (tag) {
    query = query.eq("post_tags.tag", tag);
  }

  const { data, count, error } = await query;
  if (error) return { posts: [], hasMore: false, error: error.message };

  // select 리터럴이 태그 유무로 달라져 supabase-js가 행 타입을 추론하지 못하므로 명시 캐스트
  const rows = (data || []) as unknown as PostWithFeed[];
  if (rows.length === 0) return { posts: [], hasMore: false, error: null };

  // 각 post의 태그 조회 (inner join 결과에는 필터한 태그만 담기므로 별도로 받는다)
  const postIds = rows.map((p) => p.id);
  const { data: allTags } = await supabase
    .from("post_tags")
    .select("post_id, tag")
    .in("post_id", postIds);

  const tagsByPostId = new Map<string, string[]>();
  (allTags || []).forEach((t: { post_id: string; tag: string }) => {
    const existing = tagsByPostId.get(t.post_id) || [];
    existing.push(t.tag);
    tagsByPostId.set(t.post_id, existing);
  });

  const posts: PostListItem[] = rows.map((p) => ({
    ...p,
    tags: tagsByPostId.get(p.id) || [],
  }));

  const hasMore = from + rows.length < (count ?? 0);

  return { posts, hasMore, error: null };
}
