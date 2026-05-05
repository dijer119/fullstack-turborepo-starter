import Link from "next/link";
import { AppMenu } from "./AppMenu";
import { ThemeToggle } from "./ThemeToggle";
import { ActiveNav } from "./ActiveNav";
import { ActiveGroupLabel } from "./ActiveGroupLabel";

export function Header() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800 px-3 py-2.5 flex items-center gap-3 bg-white dark:bg-black sticky top-0 z-20">
      <AppMenu />
      <Link href="/" className="font-semibold">금융 포털</Link>
      <ActiveGroupLabel />
      <nav className="ml-auto flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
        <ActiveNav />
        <ThemeToggle />
      </nav>
    </header>
  );
}
