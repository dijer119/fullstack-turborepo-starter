import Link from "next/link";
import Header from "../src/components/Header";
import { useHelloQuery } from "../src/store/services/api";

export default function Web() {
  const { data, isLoading, error } = useHelloQuery();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* 공통 헤더 */}
      <Header />
      
      <div className="flex items-center justify-center p-4 min-h-[calc(100vh-73px)]">
        <div className="max-w-2xl w-full">
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-8 backdrop-blur-sm">
            <h1 className="text-4xl font-bold text-white mb-4">
              📊 Fullstack Turborepo Starter
            </h1>
          
          <div className="mb-6">
            {isLoading && (
              <div className="flex items-center text-cyan-400">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-400 mr-2"></div>
                Loading...
              </div>
            )}
            {error && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-400 px-4 py-3 rounded-lg">
                ⚠️ Error fetching data from backend
              </div>
            )}
            {data && (
              <div className="bg-emerald-900/30 border border-emerald-700/50 text-emerald-400 px-4 py-3 rounded-lg">
                ✅ Backend: {data.message}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Link 
              href="/maddingstock"
              className="block w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all transform hover:scale-105 shadow-lg text-center font-semibold"
            >
              📈 MaddingStock 메시지 보기
            </Link>

            <Link 
              href="/intrinsic-value"
              className="block w-full bg-gradient-to-r from-cyan-600 to-emerald-600 text-white px-6 py-4 rounded-xl hover:from-cyan-700 hover:to-emerald-700 transition-all transform hover:scale-105 shadow-lg text-center font-semibold"
            >
              💎 내재가치 계산기
            </Link>

            <Link 
              href="/top-stocks"
              className="block w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-4 rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all transform hover:scale-105 shadow-lg text-center font-semibold"
            >
              🏆 안전마진 상위 종목
            </Link>

            <div className="grid grid-cols-2 gap-4">
              <a
                href="http://localhost:3001/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 px-4 py-3 rounded-xl transition-colors text-center font-medium border border-slate-600/50"
              >
                📚 API Docs
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 px-4 py-3 rounded-xl transition-colors text-center font-medium border border-slate-600/50"
              >
                💻 GitHub
              </a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-700/50">
            <h2 className="text-lg font-semibold text-slate-300 mb-3">🚀 Tech Stack</h2>
            <div className="flex flex-wrap gap-2">
              {["Next.js", "NestJS", "Prisma", "Supabase", "Telegram", "WebSocket", "Tailwind"].map((tech) => (
                <span
                  key={tech}
                  className="px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded-full text-sm font-medium"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
