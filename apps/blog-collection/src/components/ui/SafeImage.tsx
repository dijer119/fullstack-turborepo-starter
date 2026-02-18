"use client";

import { useState } from "react";

function proxyUrl(src: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

export function SafeImage({
  src,
  alt,
  className,
  fallback,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      fallback ?? (
        <div
          className={`bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-400 text-xs ${className ?? ""}`}
        >
          IMG
        </div>
      )
    );
  }

  return (
    <img
      src={proxyUrl(src)}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
}
