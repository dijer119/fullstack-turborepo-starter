"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Feed } from "@/types/feed";

export async function addFeed(
  rssUrl: string
): Promise<{ data: Feed | null; error: string | null }> {
  try {
    // 1. RSS fetch & 파싱 (Route Handler 호출)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002";
    const fetchRes = await fetch(`${baseUrl}/api/rss/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: rssUrl }),
    });

    if (!fetchRes.ok) {
      const err = await fetchRes.json();
      return { data: null, error: err.error || "RSS 피드를 가져올 수 없습니다" };
    }

    const { channel } = await fetchRes.json();

    // 2. Supabase INSERT
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("feeds")
      .insert({
        rss_url: rssUrl,
        title: channel.title,
        link: channel.link || null,
        description: channel.description || null,
        image_url: channel.image?.url || null,
        language: channel.language || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { data: null, error: "이미 구독 중인 피드입니다" };
      }
      return { data: null, error: error.message };
    }

    // 3. 등록 직후 글 수집
    await fetch(`${baseUrl}/api/rss/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedId: data.id }),
    });

    revalidatePath("/");
    revalidatePath("/feeds");
    return { data, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export async function deleteFeed(
  feedId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("feeds").delete().eq("id", feedId);

    if (error) return { error: error.message };

    revalidatePath("/");
    revalidatePath("/feeds");
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function updateFeedCategory(
  feedId: string,
  category: string | null
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("feeds")
      .update({ category })
      .eq("id", feedId);

    if (error) return { error: error.message };

    revalidatePath("/");
    revalidatePath("/feeds");
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
