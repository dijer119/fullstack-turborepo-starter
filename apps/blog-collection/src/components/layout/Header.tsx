import Link from "next/link";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";

export function Header() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2">
        <MobileNav>
          <Sidebar />
        </MobileNav>
        <Link href="/" className="text-lg font-bold">
          Blog Collection
        </Link>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        {/* <RefreshButton /> */}
        <Link
          href="/feeds"
          className="text-sm px-2 md:px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="hidden sm:inline">Manage </span>Feeds
        </Link>
      </div>
    </header>
  );
}
