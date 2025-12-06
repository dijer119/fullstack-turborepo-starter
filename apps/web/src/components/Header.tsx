import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Header() {
  const router = useRouter();

  const isActive = (path: string) => router.pathname === path;

  return (
    <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <nav className="flex items-center justify-between">
          <Link
            href="/"
            className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400"
          >
            Value
          </Link>
          <div className="flex gap-6">
            <Link
              href="/"
              className={`transition ${isActive('/') ? 'text-cyan-400 font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              홈
            </Link>
            <Link
              href="/top-stocks"
              className={`transition ${isActive('/top-stocks') ? 'text-cyan-400 font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              상위종목
            </Link>
            <Link
              href="/intrinsic-value"
              className={`transition ${isActive('/intrinsic-value') ? 'text-cyan-400 font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              계산기
            </Link>
            <Link
              href="/maddingstock"
              className={`transition ${isActive('/maddingstock') ? 'text-cyan-400 font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              MaddingStock
            </Link>
            <Link
              href="/users"
              className={`transition ${isActive('/users') ? 'text-cyan-400 font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              사용자
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

