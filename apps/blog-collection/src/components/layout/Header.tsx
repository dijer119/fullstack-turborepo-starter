import Link from "next/link";
import { RefreshButton } from "@/components/ui/RefreshButton";

export function Header() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-6 py-3 flex items-center justify-between flex-shrink-0">
      <Link href="/" className="text-lg font-bold">
        Blog Collection
      </Link>
      <div className="flex items-center gap-3">
        <RefreshButton />
        <Link
          href="/feeds"
          className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Manage Feeds
        </Link>
      </div>
    </header>
  );
}
