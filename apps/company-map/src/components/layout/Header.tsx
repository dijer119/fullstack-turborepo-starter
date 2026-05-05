import Link from "next/link";
import { AppMenu } from "./AppMenu";

export function Header() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800 px-3 py-2.5 flex items-center gap-3 bg-white dark:bg-black sticky top-0 z-20">
      <AppMenu />
      <Link href="/" className="font-semibold">금융 포털</Link>
      <span className="text-gray-300 dark:text-gray-700 select-none">|</span>
      <span className="text-sm text-gray-600 dark:text-gray-400">Company Map</span>
      <nav className="ml-auto flex gap-4 text-sm text-gray-600 dark:text-gray-400">
        <Link href="/map" className="hover:underline">Map</Link>
        <Link href="/companies" className="hover:underline">Companies</Link>
        <Link href="/industries" className="hover:underline">Industries</Link>
        <Link href="/import" className="hover:underline">Import</Link>
      </nav>
    </header>
  );
}
