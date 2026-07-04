import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshFeeds } from "@/lib/rss/refresh";

export async function GET(request: Request) {
  // Vercel Cron 시크릿 검증 (프로덕션)
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. 피드 새로고침 (self-fetch 대신 직접 호출 — 5분 헤더 타임아웃 회피)
  const outcome = await refreshFeeds();
  const result = outcome.ok ? outcome.result : { error: outcome.error };

  // 2. 한 달 지난 글 삭제 (즐겨찾기 제외)
  const supabase = await createClient();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const { count } = await supabase
    .from("posts")
    .delete({ count: "exact" })
    .lt("pub_date", oneMonthAgo.toISOString())
    .eq("is_favorite", false);

  return NextResponse.json({
    ...result,
    cleanedUp: count ?? 0,
  });
}
