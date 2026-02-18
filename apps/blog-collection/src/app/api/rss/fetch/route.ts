import { NextResponse } from "next/server";
import { parseRssFeed } from "@/lib/rss/parser";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // URL 형식 검증
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "BlogCollection/1.0" },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch RSS feed: ${response.status}` },
        { status: 400 }
      );
    }

    const xmlString = await response.text();
    const { channel, items } = parseRssFeed(xmlString);

    return NextResponse.json({
      channel,
      items,
      itemCount: items.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid RSS feed URL or unable to parse",
      },
      { status: 400 }
    );
  }
}
