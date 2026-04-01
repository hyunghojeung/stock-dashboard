import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackcopy.kr | 인쇄전용 ERP Bcount",
  description: "인쇄/출력 작업기록, 견적서, 거래명세서, 발주서까지 올인원 업무관리 시스템",
  keywords: "인쇄, ERP, 견적서, 거래명세서, 발주서, 업무관리, 인쇄관리",
  openGraph: {
    title: "Blackcopy.kr | 인쇄전용 ERP Bcount",
    description: "인쇄/출력 작업기록, 견적서, 거래명세서, 발주서까지 올인원 업무관리",
    url: "https://blackcopy.kr",
    siteName: "Blackcopy.kr",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-gray-50">
        {children}
      </body>
    </html>
  );
}
