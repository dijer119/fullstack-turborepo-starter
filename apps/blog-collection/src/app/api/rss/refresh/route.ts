import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRssFeed } from "@/lib/rss/parser";
import { sendNewPostsNotification } from "@/lib/telegram";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const feedId = body.feedId as string | undefined;

    const supabase = await createClient();

    // 피드 목록 조회
    let query = supabase.from("feeds").select("*");
    if (feedId) {
      query = query.eq("id", feedId);
    }
    const { data: feeds, error: feedsError } = await query;

    if (feedsError) {
      return NextResponse.json(
        { error: feedsError.message },
        { status: 500 }
      );
    }

    if (!feeds || feeds.length === 0) {
      return NextResponse.json(
        { error: "No feeds found" },
        { status: 404 }
      );
    }

    let totalNewPosts = 0;
    const errors: string[] = [];
    const newPostsList: { feedTitle: string; title: string; link: string }[] = [];

    for (const feed of feeds) {
      try {
        const response = await fetch(feed.rss_url, {
          headers: { "User-Agent": "BlogCollection/1.0" },
        });

        if (!response.ok) {
          errors.push(`Feed "${feed.title}": HTTP ${response.status}`);
          continue;
        }

        const xmlString = await response.text();
        const { items } = parseRssFeed(xmlString);

        // 기존 guid 목록 조회 (신규 글 판별용)
        const guids = items.map((item) => item.guid);
        const { data: existing } = await supabase
          .from("posts")
          .select("guid")
          .eq("feed_id", feed.id)
          .in("guid", guids.length > 0 ? guids : ["__none__"]);
        const existingGuids = new Set((existing || []).map((r: { guid: string }) => r.guid));

        for (const item of items) {
          const isNew = !existingGuids.has(item.guid);

          const { error: upsertError } = await supabase
            .from("posts")
            .upsert(
              {
                feed_id: feed.id,
                guid: item.guid,
                title: item.title,
                link: item.link,
                description: item.description || null,
                author: item.author || null,
                category: item.category || null,
                thumbnail: item.thumbnail || null,
                pub_date: new Date(item.pubDate).toISOString(),
              },
              { onConflict: "feed_id,guid", ignoreDuplicates: true }
            );

          if (upsertError) {
            errors.push(`Post "${item.title}": ${upsertError.message}`);
            continue;
          }

          // 태그 저장
          if (item.tags.length > 0) {
            const { data: post } = await supabase
              .from("posts")
              .select("id")
              .eq("feed_id", feed.id)
              .eq("guid", item.guid)
              .single();

            if (post) {
              const tagRows = item.tags.map((tag) => ({
                post_id: post.id,
                tag,
              }));
              await supabase
                .from("post_tags")
                .upsert(tagRows, {
                  onConflict: "post_id,tag",
                  ignoreDuplicates: true,
                });
            }
          }

          if (isNew) {
            totalNewPosts++;
            newPostsList.push({
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
    }

    // 신규 글이 있으면 Telegram 알림
    if (newPostsList.length > 0) {
      await sendNewPostsNotification(newPostsList);
    }

    return NextResponse.json({
      refreshed: feeds.length - errors.length,
      newPosts: totalNewPosts,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to refresh feeds",
      },
      { status: 500 }
    );
  }
}
