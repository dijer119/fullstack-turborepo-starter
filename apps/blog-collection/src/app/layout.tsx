import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Blog Collection",
  description: "RSS 피드 구독 기반 블로그 글 자동 수집 및 큐레이션",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex flex-col h-screen">
          <Header />
          <div className="flex flex-1 overflow-hidden">
            {/* 데스크탑 사이드바 */}
            <aside className="hidden md:block w-64 border-r border-gray-200 dark:border-gray-800 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 flex-shrink-0">
              <Sidebar />
            </aside>
            <main className="flex-1 overflow-y-auto p-3 md:p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
