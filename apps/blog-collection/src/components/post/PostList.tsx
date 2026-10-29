import { fetchPostsPage, type PostListFilters } from "@/lib/posts/query";
import { InfinitePostList } from "./InfinitePostList";

export async function PostList({
  feedId,
  search,
  tag,
  showFavorites,
}: PostListFilters) {
  const filters: PostListFilters = { feedId, search, tag, showFavorites };
  const { posts, hasMore } = await fetchPostsPage(filters, 1);

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg mb-2">No posts found</p>
        <p className="text-sm">Add RSS feeds to start collecting blog posts.</p>
      </div>
    );
  }

  // 필터가 바뀌면 key가 달라져 클라이언트가 쌓아둔 페이지가 초기화된다.
  const listKey = [
    feedId ?? "",
    search ?? "",
    tag ?? "",
    showFavorites ? "fav" : "",
  ].join("|");

  return (
    <InfinitePostList
      key={listKey}
      initialPosts={posts}
      initialHasMore={hasMore}
      filters={filters}
    />
  );
}
