"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Trash2, Plus } from "lucide-react";
import {
  addLink,
  updateLink,
  deleteLink,
  type StockLinkView,
} from "@/actions/stock-links";

export function RelatedLinksCard({
  code,
  initialLinks,
}: {
  code: string;
  initialLinks: StockLinkView[];
}) {
  const [links, setLinks] = useState<StockLinkView[]>(initialLinks);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onAdd = () => {
    const value = url.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      const res = await addLink(code, value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLinks((prev) =>
        prev.some((l) => l.id === res.link.id) ? prev : [res.link, ...prev],
      );
      setUrl("");
    });
  };

  const onToggleKind = (link: StockLinkView) => {
    const next = link.kind === "news" ? "blog" : "news";
    setLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, kind: next } : l)),
    );
    startTransition(async () => {
      await updateLink(link.id, { kind: next });
    });
  };

  const onMemoBlur = (link: StockLinkView, memo: string) => {
    if (memo === (link.memo ?? "")) return;
    setLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, memo: memo || null } : l)),
    );
    startTransition(async () => {
      await updateLink(link.id, { memo });
    });
  };

  const onDelete = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    startTransition(async () => {
      await deleteLink(id);
    });
  };

  return (
    <section id="links" className="scroll-mt-6">
      <h2 className="mb-3 text-lg font-semibold">관련 링크</h2>

      <div className="mb-4 flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
          }}
          placeholder="블로그·뉴스 URL 붙여넣기"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={pending || url.trim() === ""}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={14} />
          {pending ? "가져오는 중…" : "추가"}
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {links.length === 0 ? (
        <p className="text-sm text-gray-500">아직 저장된 링크가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
            >
              {link.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={link.imageUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleKind(link)}
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      link.kind === "news"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                    }`}
                    title="클릭하여 종류 전환"
                  >
                    {link.kind === "news" ? "뉴스" : "블로그"}
                  </button>
                  <span className="truncate text-xs text-gray-500">
                    {link.siteName ?? ""}
                  </span>
                </div>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-start gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  <span className="min-w-0 break-words">{link.title ?? link.url}</span>
                  <ExternalLink size={12} className="mt-1 shrink-0" />
                </a>
                <input
                  type="text"
                  defaultValue={link.memo ?? ""}
                  onBlur={(e) => onMemoBlur(link, e.target.value.trim())}
                  placeholder="메모"
                  className="mt-2 w-full rounded border border-gray-200 bg-transparent px-2 py-1 text-xs dark:border-gray-700"
                />
              </div>
              <button
                type="button"
                onClick={() => onDelete(link.id)}
                aria-label="삭제"
                className="shrink-0 self-start rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
