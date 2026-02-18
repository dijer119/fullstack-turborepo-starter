"use client";

import { deleteFeed } from "@/actions/feed";
import { useRouter } from "next/navigation";
import type { Feed } from "@/types/feed";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FeedList({
  feeds,
  postCounts,
}: {
  feeds: Feed[];
  postCounts: Map<string, number>;
}) {
  const router = useRouter();

  async function handleDelete(feedId: string, title: string) {
    if (!confirm(`"${title}" 피드를 삭제하시겠습니까?\n관련된 모든 글도 함께 삭제됩니다.`)) {
      return;
    }
    await deleteFeed(feedId);
    router.refresh();
  }

  if (feeds.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg mb-2">No feeds subscribed</p>
        <p className="text-sm">Add your first RSS feed to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feeds.map((feed) => (
        <div
          key={feed.id}
          className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 flex items-center gap-4"
        >
          {feed.image_url && (
            <img
              src={feed.image_url}
              alt=""
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{feed.title}</h3>
            <p className="text-xs text-gray-500 truncate">{feed.rss_url}</p>
            <div className="flex gap-4 mt-1 text-xs text-gray-500">
              <span>{postCounts.get(feed.id) || 0} posts</span>
              <span>Last fetched: {formatDate(feed.last_fetched_at)}</span>
              {feed.category && (
                <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                  {feed.category}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => handleDelete(feed.id, feed.title)}
            className="text-sm px-3 py-1.5 rounded-md text-red-600 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950 transition-colors flex-shrink-0"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
