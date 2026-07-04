import { NextResponse } from "next/server";
import { refreshFeeds } from "@/lib/rss/refresh";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const feedId = body.feedId as string | undefined;

    const outcome = await refreshFeeds(feedId);

    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.error },
        { status: outcome.status }
      );
    }

    return NextResponse.json(outcome.result);
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
