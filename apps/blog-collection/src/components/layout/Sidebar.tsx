import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SafeImage } from "@/components/ui/SafeImage";
import type { Feed } from "@/types/feed";

export async function Sidebar() {
  const supabase = await createClient();
  const { data: feeds } = await supabase
    .from("feeds")
    .select("*")
    .order("title");

  // 카테고리별 그룹핑
  const categories = new Map<string, Feed[]>();
  const uncategorized: Feed[] = [];

  (feeds || []).forEach((feed: Feed) => {
    if (feed.category) {
      const list = categories.get(feed.category) || [];
      list.push(feed);
      categories.set(feed.category, list);
    } else {
      uncategorized.push(feed);
    }
  });

  return (
    <nav className="p-4 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
        >
          <span>All Posts</span>
        </Link>

        <div className="pt-4 pb-2">
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Feeds
          </h3>
        </div>

        {uncategorized.map((feed) => (
          <Link
            key={feed.id}
            href={`/feed/${feed.id}`}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors truncate"
            title={feed.title}
          >
            {feed.image_url && (
              <SafeImage
                src={feed.image_url}
                alt=""
                className="w-5 h-5 rounded-full flex-shrink-0"
              />
            )}
            <span className="truncate">{feed.title}</span>
          </Link>
        ))}

        {Array.from(categories.entries()).map(([category, categoryFeeds]) => (
          <div key={category}>
            <div className="pt-4 pb-2">
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {category}
              </h3>
            </div>
            {categoryFeeds.map((feed) => (
              <Link
                key={feed.id}
                href={`/feed/${feed.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors truncate"
                title={feed.title}
              >
                {feed.image_url && (
                  <SafeImage
                    src={feed.image_url}
                    alt=""
                    className="w-5 h-5 rounded-full flex-shrink-0"
                  />
                )}
                <span className="truncate">{feed.title}</span>
              </Link>
            ))}
          </div>
        ))}

        <div className="pt-4">
          <Link
            href="/feeds"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            Manage Feeds
          </Link>
        </div>
    </nav>
  );
}
