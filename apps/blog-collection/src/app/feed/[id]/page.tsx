import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PostList } from "@/components/post/PostList";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { SafeImage } from "@/components/ui/SafeImage";
import type { Feed } from "@/types/feed";

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; search?: string; tag?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Number(sp.page) || 1;

  const supabase = await createClient();
  const { data: feed } = await supabase
    .from("feeds")
    .select("*")
    .eq("id", id)
    .single();

  if (!feed) notFound();

  const typedFeed = feed as Feed;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {typedFeed.image_url && (
            <SafeImage
              src={typedFeed.image_url}
              alt=""
              className="w-10 h-10 rounded-full"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold">{typedFeed.title}</h1>
            {typedFeed.description && (
              <p className="text-sm text-gray-500 mt-1">
                {typedFeed.description}
              </p>
            )}
          </div>
        </div>
        <RefreshButton feedId={id} />
      </div>

      <PostList feedId={id} page={page} search={sp.search} tag={sp.tag} />
    </div>
  );
}
