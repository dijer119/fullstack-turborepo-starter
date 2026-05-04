import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center gap-6 bg-white dark:bg-black sticky top-0 z-20">
      <Link href="/" className="font-semibold">Company Map</Link>
      <nav className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
        <Link href="/" className="hover:underline">Map</Link>
        <Link href="/companies" className="hover:underline">Companies</Link>
        <Link href="/industries" className="hover:underline">Industries</Link>
        <Link href="/import" className="hover:underline">Import</Link>
      </nav>
    </header>
  );
}
