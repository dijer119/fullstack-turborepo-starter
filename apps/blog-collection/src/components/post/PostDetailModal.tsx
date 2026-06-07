"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, Loader2, ChevronDown } from "lucide-react";
import type { PostDetailResult } from "@/actions/post-detail";

// 스크래핑한 본문 HTML 렌더링용 자식 요소 스타일 (Tailwind v4 arbitrary variants)
const PROSE =
  "text-[15px] leading-7 break-words " +
  "[&_img]:my-3 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg " +
  "[&_p]:my-3 [&_br]:content-[''] " +
  "[&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline [&_a]:break-all " +
  "[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2 " +
  "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 " +
  "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 " +
  "[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 dark:[&_blockquote]:border-gray-600 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500 [&_blockquote]:my-3 " +
  "[&_table]:w-full [&_table]:my-3 [&_td]:border [&_td]:border-gray-200 dark:[&_td]:border-gray-700 [&_td]:p-1.5 " +
  "[&_iframe]:my-3 [&_iframe]:max-w-full [&_iframe]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:bg-gray-100 dark:[&_pre]:bg-gray-800 [&_pre]:p-3 [&_pre]:rounded";

export function PostDetailModal({
  open,
  onClose,
  loading,
  error,
  detail,
  sourceUrl,
  fallbackTitle,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  detail: PostDetailResult | null;
  sourceUrl: string;
  fallbackTitle: string;
}) {
  // 포털은 클라이언트 마운트 후에만 (document 접근).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const title = detail?.title || fallbackTitle;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/70 p-2 sm:p-6 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-3xl my-auto rounded-xl bg-white dark:bg-gray-950 shadow-2xl border border-gray-200 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur px-4 py-3 rounded-t-xl">
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold line-clamp-2">{title}</h2>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
            >
              원문 열기 <ExternalLink size={12} />
            </a>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 본문 */}
        <div className="px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
              <Loader2 className="animate-spin" size={20} />
              <span className="text-sm">본문을 불러오는 중…</span>
            </div>
          )}

          {!loading && error && (
            <div className="py-12 text-center">
              <p className="text-sm text-red-500">{error}</p>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                원문에서 직접 보기 <ExternalLink size={14} />
              </a>
            </div>
          )}

          {!loading && !error && detail?.contentHtml && (
            <>
              <div
                className={PROSE}
                dangerouslySetInnerHTML={{ __html: detail.contentHtml }}
              />

              {detail.externalLinks.length > 0 && (
                <div className="mt-6 border-t border-gray-200 dark:border-gray-800 pt-4">
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">
                    본문에 포함된 링크 ({detail.externalLinks.length})
                  </h3>
                  <div className="space-y-2">
                    {detail.externalLinks.map((link) => (
                      <details
                        key={link.url}
                        open
                        className="group rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-2 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800">
                          <ChevronDown
                            size={16}
                            className="flex-shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                          />
                          <span className="flex-1 min-w-0 truncate">{link.title}</span>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex-shrink-0 text-blue-600 dark:text-blue-400"
                            aria-label="외부링크 원문 열기"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </summary>
                        <div className="px-3 py-3">
                          {link.contentHtml ? (
                            <div
                              className={PROSE}
                              dangerouslySetInnerHTML={{ __html: link.contentHtml }}
                            />
                          ) : (
                            <p className="text-sm text-gray-500">
                              {link.error ?? "내용을 불러오지 못했습니다."}
                            </p>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
