"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleFavorite(
  postId: string,
  currentValue: boolean
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("posts")
      .update({ is_favorite: !currentValue })
      .eq("id", postId);

    if (error) return { error: error.message };

    revalidatePath("/");
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function toggleRead(
  postId: string,
  currentValue: boolean
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("posts")
      .update({ is_read: !currentValue })
      .eq("id", postId);

    if (error) return { error: error.message };

    revalidatePath("/");
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function markAllAsRead(
  feedId?: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("posts")
      .update({ is_read: true })
      .eq("is_read", false);

    if (feedId) {
      query = query.eq("feed_id", feedId);
    }

    const { error } = await query;
    if (error) return { error: error.message };

    revalidatePath("/");
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
