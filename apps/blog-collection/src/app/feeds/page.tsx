import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FeedList } from "@/components/feed/FeedList";
import type { Feed } from "@/types/feed";

export default async function FeedsPage() {
  const supabase = await createClient();

  const { data: feeds } = await supabase
    .from("feeds")
    .select("*")
    .order("created_at", { ascending: false });

  // 각 피드별 글 수 조회
  const { data: counts } = await supabase
    .from("posts")
    .select("feed_id");

  const postCounts = new Map<string, number>();
  (counts || []).forEach((row: { feed_id: string }) => {
    postCounts.set(row.feed_id, (postCounts.get(row.feed_id) || 0) + 1);
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Manage Feeds</h1>
        <Link
          href="/feeds/add"
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
        >
          + Add Feed
        </Link>
      </div>

      <FeedList feeds={(feeds || []) as Feed[]} postCounts={postCounts} />
    </div>
  );
}
