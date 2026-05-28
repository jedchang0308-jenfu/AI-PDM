import type { Metadata } from "next";
import { SidebarNav } from "@/components/sidebar-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI PDM",
  description: "SolidWorks AI 圖面資料管理系統"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <div className="app-shell">
          <SidebarNav />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
