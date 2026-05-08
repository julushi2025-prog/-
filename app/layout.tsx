import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anime Radar | 个人动漫情报终端",
  description: "基于个人口味适配度的动漫情报收集与推荐 MVP。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="scanline terminal-grid antialiased">{children}</body>
    </html>
  );
}
