import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "工業簿記 小テストシステム",
  description: "商業高校 工業簿記 小テスト自動化システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
