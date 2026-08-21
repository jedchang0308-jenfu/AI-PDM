import type { Metadata, Viewport } from "next";
import { SidebarNav } from "@/components/sidebar-nav";
import "./styles/tokens.css";
import "./globals.css";
import "./styles/responsive.css";

export const metadata: Metadata = {
  title: "AI PDM",
  description: "SolidWorks AI 圖面資料管理系統",
  icons: { icon: "/icon.svg" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
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
