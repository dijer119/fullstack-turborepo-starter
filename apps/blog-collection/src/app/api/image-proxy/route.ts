import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      // 빈 Referer 헤더("")를 보내면 네이버 CDN(dthumb/imgnews)이 403으로 차단한다.
      // Referer는 아예 보내지 않는다.
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BlogCollectionBot/1.0)",
      },
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
