import { describe, it, expect } from "vitest";
import { parseOgMeta, inferKind } from "./og-meta";

describe("parseOgMeta", () => {
  it("OG 태그 완비 → 전 필드 추출", () => {
    const html = `<html><head>
      <meta property="og:title" content="삼성전자 실적 분석">
      <meta property="og:site_name" content="네이버 블로그">
      <meta property="og:image" content="https://img.example.com/a.png">
    </head><body></body></html>`;
    expect(parseOgMeta(html, "https://blog.naver.com/x/1")).toEqual({
      title: "삼성전자 실적 분석",
      siteName: "네이버 블로그",
      imageUrl: "https://img.example.com/a.png",
    });
  });

  it("OG 누락 → title·twitter:image 폴백, siteName은 null", () => {
    const html = `<html><head>
      <title>대체 제목</title>
      <meta name="twitter:image" content="https://img.example.com/t.png">
    </head><body></body></html>`;
    const r = parseOgMeta(html, "https://example.com/post");
    expect(r.title).toBe("대체 제목");
    expect(r.imageUrl).toBe("https://img.example.com/t.png");
    expect(r.siteName).toBeNull();
  });

  it("상대경로 og:image를 페이지 URL 기준 절대경로로 보정", () => {
    const html = `<meta property="og:image" content="/thumb/1.jpg">`;
    const r = parseOgMeta(html, "https://news.example.com/article/5");
    expect(r.imageUrl).toBe("https://news.example.com/thumb/1.jpg");
  });

  it("빈 HTML → 모두 null", () => {
    expect(parseOgMeta("", "https://example.com")).toEqual({
      title: null,
      siteName: null,
      imageUrl: null,
    });
  });
});

describe("inferKind", () => {
  it("알려진 언론사 도메인 → news", () => {
    expect(inferKind("https://n.news.naver.com/article/001/0001")).toBe("news");
    expect(inferKind("https://www.hankyung.com/article/2026")).toBe("news");
  });

  it("블로그·미지 호스트 → blog", () => {
    expect(inferKind("https://blog.naver.com/user/123")).toBe("blog");
    expect(inferKind("https://someone.tistory.com/45")).toBe("blog");
  });

  it("파싱 불가 URL → blog", () => {
    expect(inferKind("not a url")).toBe("blog");
  });
});
