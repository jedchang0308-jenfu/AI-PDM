import type { Metadata, Viewport } from "next";
import { SidebarNav } from "@/components/sidebar-nav";
import { PrivacyAccessGate } from "@/components/privacy-access-gate";
import { isNumberStateFlowV1Enabled } from "@/lib/number-state-flow-feature";
import "./styles/tokens.css";
import "./globals.css";
import "./styles/responsive.css";

export const metadata: Metadata = {
  title: "AI PDM",
  description: "SolidWorks AI 圖面資料管理系統"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <PrivacyAccessGate>
          <div className="app-shell">
            <SidebarNav numberStateFlowV1Enabled={isNumberStateFlowV1Enabled()} />
            <main className="main">{children}</main>
          </div>
        </PrivacyAccessGate>
      </body>
    </html>
  );
}
