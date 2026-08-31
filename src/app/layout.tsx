import type { Metadata } from "next";
import "./globals.css";
import ContextBioTopBar from "@/components/ContextBioTopBar";

export const metadata: Metadata = {
  title: "LABIS — Lab Intelligence System",
  description: "연구소 운영 시스템: LIMS · 과제관리 · 인사관리",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {/* contextBio 공통 상단 바 — 다른 앱들과 같은 자리, 같은 구성 */}
        <ContextBioTopBar />
        {children}
      </body>
    </html>
  );
}
