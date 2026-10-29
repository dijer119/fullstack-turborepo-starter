"use server";

import {
  fetchPostsPage,
  type PostListFilters,
  type PostsPage,
} from "@/lib/posts/query";

// 무한 스크롤에서 2페이지 이후를 불러올 때 클라이언트가 호출한다.
export async function loadMorePosts(
  filters: PostListFilters,
  page: number
): Promise<PostsPage> {
  try {
    return await fetchPostsPage(filters, page);
  } catch (e) {
    return {
      posts: [],
      hasMore: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
