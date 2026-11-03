import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import { SiteChrome } from "@/components/SiteChrome";
import "./globals.css";

const latin = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-latin",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Frontier Hub · AI 前沿每日扫读",
  description:
    "从官方 RSS 与公开 API 汇总 AI 论文、模型、实验室与中文媒体动态，中文摘要，外链原文。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={latin.variable}>
      <body>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
