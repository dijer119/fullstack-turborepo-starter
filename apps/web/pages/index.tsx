import Link from "next/link";
import { useHelloQuery } from "../src/store/services/api";

export default function Web() {
  const { data, isLoading, error } = useHelloQuery();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            📊 Fullstack Turborepo Starter
          </h1>
          
          <div className="mb-6">
            {isLoading && (
              <div className="flex items-center text-blue-600">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                Loading...
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                ⚠️ Error fetching data from backend
              </div>
            )}
            {data && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                ✅ Backend: {data.message}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Link 
              href="/maddingstock"
              className="block w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all transform hover:scale-105 shadow-lg text-center font-semibold"
            >
              📈 MaddingStock 메시지 보기
            </Link>

            <div className="grid grid-cols-2 gap-4">
              <a
                href="http://localhost:3001/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-3 rounded-lg transition-colors text-center font-medium"
              >
                📚 API Docs
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-3 rounded-lg transition-colors text-center font-medium"
              >
                💻 GitHub
              </a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">🚀 Tech Stack</h2>
            <div className="flex flex-wrap gap-2">
              {["Next.js", "NestJS", "Prisma", "Supabase", "Telegram", "WebSocket", "Tailwind"].map((tech) => (
                <span
                  key={tech}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
