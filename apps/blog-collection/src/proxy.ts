import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // webpack-hmr fallback 요청을 빈 응답으로 처리 (Next.js 16은 WebSocket HMR 사용)
  if (request.nextUrl.pathname === "/_next/webpack-hmr") {
    return new NextResponse(null, { status: 200 });
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 요청에 대해 프록시 실행:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico (파비콘)
     * - 이미지 파일들
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
