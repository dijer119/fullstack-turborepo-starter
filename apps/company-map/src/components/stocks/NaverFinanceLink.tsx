import { ExternalLink } from "lucide-react";

interface Props {
  code: string;
  name: string;
  className?: string;
  iconSize?: number;
  showIcon?: boolean;
}

/** 종목명을 네이버 금융 종목 페이지로 새 탭 링크. */
export function NaverFinanceLink({
  code,
  name,
  className = "",
  iconSize = 12,
  showIcon = true,
}: Props) {
  return (
    <a
      href={`https://finance.naver.com/item/main.naver?code=${code}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 hover:text-blue-600 hover:underline ${className}`}
    >
      {name}
      {showIcon && (
        <ExternalLink
          size={iconSize}
          className="opacity-50 group-hover:opacity-100"
        />
      )}
    </a>
  );
}
