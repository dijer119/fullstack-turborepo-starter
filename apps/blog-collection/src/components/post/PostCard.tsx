"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { toggleFavorite, toggleRead } from "@/actions/post";
import { fetchPostDetail, type PostDetailResult } from "@/actions/post-detail";
import { PostDetailModal } from "@/components/post/PostDetailModal";
import { SafeImage } from "@/components/ui/SafeImage";
import type { PostWithFeed } from "@/types/post";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").slice(0, 200);
}

// 서버 값이 바뀌면(revalidate·AutoRefresh) 그쪽을 따르고, 그 사이에는 로컬 토글 값을 유지한다.
// 무한 스크롤로 붙인 2페이지 이후 카드는 서버 재렌더의 영향을 받지 않으므로 로컬 상태가 필요하다.
function useSyncedState<T>(serverValue: T) {
  const [value, setValue] = useState(serverValue);
  const [prevServerValue, setPrevServerValue] = useState(serverValue);
  if (serverValue !== prevServerValue) {
    setPrevServerValue(serverValue);
    setValue(serverValue);
  }
  return [value, setValue] as const;
}

export function PostCard({
  post,
  tags,
}: {
  post: PostWithFeed;
  tags: string[];
}) {
  const [isRead, setIsRead] = useSyncedState(post.is_read);
  const [isFavorite, setIsFavorite] = useSyncedState(post.is_favorite);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<PostDetailResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function markRead() {
    if (isRead) return;
    setIsRead(true);
    const { error } = await toggleRead(post.id, false);
    if (error) setIsRead(false);
  }

  async function handleClick() {
    await markRead();
  }

  async function handleOpenDetail(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setModalOpen(true);
    void markRead();
    // 이미 받아둔 본문이 있으면 재요청하지 않음
    if (detail || detailLoading) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const result = await fetchPostDetail(post.link);
      if (!result.ok) setDetailError(result.error ?? "본문을 불러오지 못했습니다.");
      setDetail(result);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "본문을 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsFavorite(!isFavorite);
    const { error } = await toggleFavorite(post.id, isFavorite);
    if (error) setIsFavorite(isFavorite);
  }

  async function handleRead(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsRead(!isRead);
    const { error } = await toggleRead(post.id, isRead);
    if (error) setIsRead(isRead);
  }

  return (
    <article
      className={`border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ${
        isRead ? "opacity-60" : ""
      }`}
    >
      <a
        href={post.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="flex flex-col sm:flex-row gap-3 sm:gap-4"
      >
        {post.thumbnail && (
          <div className="flex-shrink-0">
            <SafeImage
              src={post.thumbnail}
              alt=""
              className="w-full h-40 sm:w-24 sm:h-24 object-cover rounded-md"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold line-clamp-2 mb-1">
            {post.title}
          </h3>
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <span>{post.feed?.title}</span>
            <span>·</span>
            <span>{timeAgo(post.pub_date)}</span>
          </div>
          {post.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {stripHtml(post.description)}
            </p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </a>
      <div className="flex items-center gap-2 mt-3 justify-end">
        <button
          onClick={handleOpenDetail}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
          title="본문을 모달로 보기"
        >
          <BookOpen size={13} />
          본문 보기
        </button>
        <button
          onClick={handleFavorite}
          className="text-lg hover:scale-110 transition-transform"
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? "★" : "☆"}
        </button>
        <button
          onClick={handleRead}
          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={isRead ? "Mark as unread" : "Mark as read"}
        >
          {isRead ? "Unread" : "Read"}
        </button>
      </div>

      <PostDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={detailLoading}
        error={detailError}
        detail={detail}
        sourceUrl={post.link}
        fallbackTitle={post.title}
      />
    </article>
  );
}
