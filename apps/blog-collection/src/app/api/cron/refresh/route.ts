import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // Vercel Cron 시크릿 검증 (프로덕션)
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. 피드 새로고침
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002";
  const response = await fetch(`${baseUrl}/api/rss/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const result = await response.json();

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
