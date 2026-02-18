import { createClient } from "@/lib/supabase/server";

export async function TagFilter({ currentTag }: { currentTag?: string }) {
  const supabase = await createClient();

  // 인기 태그 상위 20개 조회
  const { data } = await supabase
    .from("post_tags")
    .select("tag")
    .limit(1000);

  // 태그별 카운트
  const tagCounts = new Map<string, number>();
  (data || []).forEach((row: { tag: string }) => {
    tagCounts.set(row.tag, (tagCounts.get(row.tag) || 0) + 1);
  });

  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  if (topTags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {currentTag && (
        <a
          href="/"
          className="text-xs px-3 py-1 rounded-full bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400"
        >
          Clear
        </a>
      )}
      {topTags.map(([tag, count]) => (
        <a
          key={tag}
          href={`?tag=${encodeURIComponent(tag)}`}
          className={`text-xs px-3 py-1 rounded-full transition-colors ${
            currentTag === tag
              ? "bg-blue-600 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          {tag} ({count})
        </a>
      ))}
    </div>
  );
}
