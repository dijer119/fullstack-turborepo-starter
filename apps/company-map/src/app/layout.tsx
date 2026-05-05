import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Company Map",
  description: "산업과 기업을 한눈에 볼 수 있는 맵 서비스",
};

// FOUC 방지: hydration 전에 localStorage의 테마 선호를 읽어 html에 .dark를 미리 적용.
const themeInitScript = `
(function(){try{
var t=localStorage.getItem('company-map.theme');
var sysDark=window.matchMedia('(prefers-color-scheme: dark)').matches;
var dark=t==='dark'||((t==='system'||t===null)&&sysDark);
if(dark)document.documentElement.classList.add('dark');
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex flex-col h-screen">
          <Header />
          <main className="flex-1 overflow-y-auto p-3 md:p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
