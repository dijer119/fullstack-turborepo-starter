"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadMorePosts } from "@/actions/post-list";
import type { PostListFilters, PostListItem } from "@/lib/posts/query";
import { PostCard } from "./PostCard";

export function InfinitePostList({
  initialPosts,
  initialHasMore,
  filters,
}: {
  initialPosts: PostListItem[];
  initialHasMore: boolean;
  filters: PostListFilters;
}) {
  const { feedId, search, tag, showFavorites } = filters;
  const [morePosts, setMorePosts] = useState<PostListItem[]>([]);
  const [loadedPage, setLoadedPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadNext = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const nextPage = loadedPage + 1;
    const result = await loadMorePosts(
      { feedId, search, tag, showFavorites },
      nextPage
    );

    if (result.error) {
      setError(result.error);
    } else {
      setMorePosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...result.posts.filter((p) => !seen.has(p.id))];
      });
      setLoadedPage(nextPage);
      setHasMore(result.hasMore);
    }

    setLoading(false);
    loadingRef.current = false;
  }, [feedId, search, tag, showFavorites, loadedPage, hasMore]);

  // 하단 sentinel이 뷰포트(여유 400px)에 들어오면 다음 페이지를 붙인다.
  // 페이지가 붙은 뒤에도 sentinel이 계속 보이면 observer가 재생성되며 즉시 다음 페이지를 이어 받는다.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadNext();
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadNext, error]);

  // 1페이지는 서버가 매번 새로 내려주므로(revalidate·AutoRefresh) 그쪽을 우선하고,
  // 클라이언트가 쌓아둔 페이지에서 겹치는 글은 제외한다.
  const initialIds = new Set(initialPosts.map((p) => p.id));
  const posts = [
    ...initialPosts,
    ...morePosts.filter((p) => !initialIds.has(p.id)),
  ];

  return (
    <div>
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} tags={post.tags} />
        ))}
      </div>

      {hasMore && !error && (
        <div ref={sentinelRef} className="h-px" aria-hidden />
      )}

      {loading && (
        <p className="text-center py-6 text-sm text-gray-500 animate-pulse">
          불러오는 중…
        </p>
      )}

      {error && (
        <div className="text-center py-6">
          <p className="text-sm text-red-500 mb-2">{error}</p>
          <button
            type="button"
            onClick={() => void loadNext()}
            className="text-sm px-3 py-1 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            다시 시도
          </button>
        </div>
      )}

      {!hasMore && (
        <p className="text-center py-8 text-xs text-gray-400">
          모든 글을 불러왔습니다
        </p>
      )}
    </div>
  );
}
