"use client";

import { toggleFavorite, toggleRead } from "@/actions/post";
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

export function PostCard({
  post,
  tags,
}: {
  post: PostWithFeed;
  tags: string[];
}) {
  async function handleClick() {
    if (!post.is_read) {
      await toggleRead(post.id, false);
    }
  }

  async function handleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await toggleFavorite(post.id, post.is_favorite);
  }

  async function handleRead(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await toggleRead(post.id, post.is_read);
  }

  return (
    <article
      className={`border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ${
        post.is_read ? "opacity-60" : ""
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
          onClick={handleFavorite}
          className="text-lg hover:scale-110 transition-transform"
          title={post.is_favorite ? "Remove from favorites" : "Add to favorites"}
        >
          {post.is_favorite ? "★" : "☆"}
        </button>
        <button
          onClick={handleRead}
          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={post.is_read ? "Mark as unread" : "Mark as read"}
        >
          {post.is_read ? "Unread" : "Read"}
        </button>
      </div>
    </article>
  );
}
