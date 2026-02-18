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
        <Pagination page={page} totalPages={totalPages} search={search} tag={tag} />
      )}
    </div>
  );
}

function buildHref(p: number, search?: string, tag?: string) {
  const params = new URLSearchParams();
  params.set("page", String(p));
  if (search) params.set("search", search);
  if (tag) params.set("tag", tag);
  return `?${params.toString()}`;
}

function getPageNumbers(page: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (page > 3) pages.push("...");

  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (page < totalPages - 2) pages.push("...");

  pages.push(totalPages);
  return pages;
}

function Pagination({
  page,
  totalPages,
  search,
  tag,
}: {
  page: number;
  totalPages: number;
  search?: string;
  tag?: string;
}) {
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-8">
      {page > 1 && (
        <a
          href={buildHref(page - 1, search, tag)}
          className="px-2 py-1 rounded-md text-sm border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          &lt;
        </a>
      )}
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-1 text-sm text-gray-400">
            ...
          </span>
        ) : (
          <a
            key={p}
            href={buildHref(p, search, tag)}
            className={`min-w-[32px] px-2 py-1 rounded-md text-sm text-center ${
              p === page
                ? "bg-blue-600 text-white"
                : "border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {p}
          </a>
        )
      )}
      {page < totalPages && (
        <a
          href={buildHref(page + 1, search, tag)}
          className="px-2 py-1 rounded-md text-sm border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          &gt;
        </a>
      )}
    </div>
  );
}
