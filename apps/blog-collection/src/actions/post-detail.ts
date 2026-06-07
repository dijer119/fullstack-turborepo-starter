"use server";

import {
  naverToMobile,
  fetchHtml,
  extractArticle,
  extractExternalLinks,
} from "@/lib/scrape/article";

export interface ExternalLinkContent {
  url: string;
  title: string;
  contentHtml: string | null;
  error?: string;
}

export interface PostDetailResult {
  ok: boolean;
  title: string;
  contentHtml: string | null;
  externalLinks: ExternalLinkContent[];
  error?: string;
}

const MAX_EXTERNAL_LINKS = 10;

// 블로그 원문 + 본문 내 외부링크들의 본문을 함께 가져온다.
export async function fetchPostDetail(rawUrl: string): Promise<PostDetailResult> {
  const empty = (error: string): PostDetailResult => ({
    ok: false,
    title: "",
    contentHtml: null,
    externalLinks: [],
    error,
  });

  try {
    const url = naverToMobile(rawUrl);
    const html = await fetchHtml(url);
    if (!html) return empty("본문을 불러오지 못했습니다.");

    const article = extractArticle(html, url);
    if (!article) return empty("본문 영역을 찾지 못했습니다.");

    const links = extractExternalLinks(html, url, MAX_EXTERNAL_LINKS);

    // 외부링크 본문을 병렬로 수집. 개별 실패는 error 필드로 표기하고 계속 진행.
    const externalLinks = await Promise.all(
      links.map(async (l): Promise<ExternalLinkContent> => {
        try {
          const linkFetchUrl = naverToMobile(l.url);
          const linkHtml = await fetchHtml(linkFetchUrl);
          const linkArticle = linkHtml ? extractArticle(linkHtml, linkFetchUrl) : null;
          return {
            url: l.url,
            title: linkArticle?.title || l.title || l.url,
            contentHtml: linkArticle?.html ?? null,
            error: linkArticle ? undefined : "내용을 불러오지 못했습니다.",
          };
        } catch (e) {
          return {
            url: l.url,
            title: l.title || l.url,
            contentHtml: null,
            error: e instanceof Error ? e.message : "오류",
          };
        }
      }),
    );

    return {
      ok: true,
      title: article.title,
      contentHtml: article.html,
      externalLinks,
    };
  } catch (e) {
    return empty(e instanceof Error ? e.message : "알 수 없는 오류");
  }
}
