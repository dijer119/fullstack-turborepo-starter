import { createClient } from "@/lib/supabase/server";
import { parseRssFeed } from "@/lib/rss/parser";
import { sendNewPostsNotification } from "@/lib/telegram";

const FEED_FETCH_TIMEOUT_MS = 10_000;

export interface RefreshResult {
  refreshed: number;
  newPosts: number;
  errors: string[];
}

export type RefreshOutcome =
  | { ok: true; result: RefreshResult }
  | { ok: false; status: number; error: string };

interface FeedRow {
  id: string;
  title: string;
  rss_url: string;
}

interface NewPost {
  feedTitle: string;
  title: string;
  link: string;
}

interface FeedOutcome {
  errors: string[];
  newPosts: NewPost[];
}

async function refreshSingleFeed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  feed: FeedRow
): Promise<FeedOutcome> {
  const errors: string[] = [];
  const newPosts: NewPost[] = [];

  try {
    const response = await fetch(feed.rss_url, {
      headers: { "User-Agent": "BlogCollection/1.0" },
      signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { errors: [`Feed "${feed.title}": HTTP ${response.status}`], newPosts };
    }

    const xmlString = await response.text();
    const { items: rawItems } = parseRssFeed(xmlString);

    // 같은 guid가 한 피드에 중복되면 배치 upsert가 실패하므로 제거
    const items = [...new Map(rawItems.map((item) => [item.guid, item])).values()];

    // 기존 guid 목록 조회 (신규 글 판별용)
    const guids = items.map((item) => item.guid);
    const { data: existing } = await supabase
      .from("posts")
      .select("guid")
      .eq("feed_id", feed.id)
      .in("guid", guids.length > 0 ? guids : ["__none__"]);
    const existingGuids = new Set(
      (existing || []).map((r: { guid: string }) => r.guid)
    );

    // 글 전체를 한 번에 upsert
    const postRows = items.map((item) => ({
      feed_id: feed.id,
      guid: item.guid,
      title: item.title,
      link: item.link,
      description: item.description || null,
      author: item.author || null,
      category: item.category || null,
      thumbnail: item.thumbnail || null,
      pub_date: new Date(item.pubDate).toISOString(),
    }));

    if (postRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("posts")
        .upsert(postRows, { onConflict: "feed_id,guid", ignoreDuplicates: true });

      if (upsertError) {
        return {
          errors: [`Feed "${feed.title}": ${upsertError.message}`],
          newPosts,
        };
      }
    }

    // 태그 저장 — 태그가 있는 글의 id를 한 번에 조회한 뒤 한 번에 upsert
    const taggedItems = items.filter((item) => item.tags.length > 0);
    if (taggedItems.length > 0) {
      const { data: posts } = await supabase
        .from("posts")
        .select("id, guid")
        .eq("feed_id", feed.id)
        .in("guid", taggedItems.map((item) => item.guid));

      const idByGuid = new Map(
        (posts || []).map((p: { id: string; guid: string }) => [p.guid, p.id])
      );

      const tagRows = taggedItems.flatMap((item) => {
        const postId = idByGuid.get(item.guid);
        if (!postId) return [];
        return item.tags.map((tag) => ({ post_id: postId, tag }));
      });

      if (tagRows.length > 0) {
        await supabase
          .from("post_tags")
          .upsert(tagRows, { onConflict: "post_id,tag", ignoreDuplicates: true });
      }
    }

    for (const item of items) {
      if (!existingGuids.has(item.guid)) {
        newPosts.push({
          feedTitle: feed.title,
          title: item.title,
          link: item.link,
        });
      }
    }

    // last_fetched_at 업데이트
    await supabase
      .from("feeds")
      .update({ last_fetched_at: new Date().toISOString() })
      .eq("id", feed.id);
  } catch (e) {
    errors.push(
      `Feed "${feed.title}": ${e instanceof Error ? e.message : "Unknown error"}`
    );
  }

  return { errors, newPosts };
}

export async function refreshFeeds(feedId?: string): Promise<RefreshOutcome> {
  const supabase = await createClient();

  // 피드 목록 조회
  let query = supabase.from("feeds").select("*");
  if (feedId) {
    query = query.eq("id", feedId);
  }
  const { data: feeds, error: feedsError } = await query;

  if (feedsError) {
    return { ok: false, status: 500, error: feedsError.message };
  }

  if (!feeds || feeds.length === 0) {
    return { ok: false, status: 404, error: "No feeds found" };
  }

  const outcomes = await Promise.all(
    (feeds as FeedRow[]).map((feed) => refreshSingleFeed(supabase, feed))
  );

  const errors = outcomes.flatMap((o) => o.errors);
  const newPostsList = outcomes.flatMap((o) => o.newPosts);

  // 신규 글이 있으면 Telegram 알림
  if (newPostsList.length > 0) {
    await sendNewPostsNotification(newPostsList);
  }

  return {
    ok: true,
    result: {
      refreshed: feeds.length - errors.length,
      newPosts: newPostsList.length,
      errors,
    },
  };
}
