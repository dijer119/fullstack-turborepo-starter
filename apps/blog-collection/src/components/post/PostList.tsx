import { createClient } from "@/lib/supabase/server";
import { PostCard } from "./PostCard";
import type { PostWithFeed } from "@/types/post";

const PAGE_SIZE = 20;

export async function PostList({
  feedId,
  page = 1,
  search,
  tag,
  showFavorites,
}: {
  feedId?: string;
  page?: number;
  search?: string;
  tag?: string;
  showFavorites?: boolean;
}) {
  const supabase = await createClient();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("posts")
    .select("*, feed:feeds(title, image_url)", { count: "exact" })
    .order("pub_date", { ascending: false })
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

  const { data: posts, count } = await query;

  // 태그 필터링이 있는 경우, 해당 태그를 가진 post_id 조회
  let filteredPosts = (posts || []) as PostWithFeed[];

  if (tag) {
    const { data: taggedPostIds } = await supabase
      .from("post_tags")
      .select("post_id")
      .eq("tag", tag);

    const taggedIds = new Set(
      (taggedPostIds || []).map((t: { post_id: string }) => t.post_id)
    );
    filteredPosts = filteredPosts.filter((p) => taggedIds.has(p.id));
  }

  // 각 post의 태그 조회
  const postIds = filteredPosts.map((p) => p.id);
  const { data: allTags } = await supabase
    .from("post_tags")
    .select("post_id, tag")
    .in("post_id", postIds.length > 0 ? postIds : ["__none__"]);

  const tagsByPostId = new Map<string, string[]>();
  (allTags || []).forEach((t: { post_id: string; tag: string }) => {
    const existing = tagsByPostId.get(t.post_id) || [];
    existing.push(t.tag);
    tagsByPostId.set(t.post_id, existing);
  });

  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

  if (filteredPosts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg mb-2">No posts found</p>
        <p className="text-sm">Add RSS feeds to start collecting blog posts.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-4">
        {filteredPosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            tags={tagsByPostId.get(post.id) || []}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`?page=${p}${search ? `&search=${search}` : ""}${tag ? `&tag=${tag}` : ""}`}
              className={`px-3 py-1 rounded-md text-sm ${
                p === page
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
