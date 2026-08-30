import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LABIS — Lab Intelligence System",
  description: "연구소 운영 시스템: LIMS · 과제관리 · 인사관리",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
