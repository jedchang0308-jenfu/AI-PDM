import { NumberStateLegacyRoute } from "@/components/number-state-legacy-route";

export default function HandoffCompatibilityLayout({ children }: { children: React.ReactNode }) {
  void children;
  return (
    <NumberStateLegacyRoute
      title="製造交接已整合到技術移轉"
      message="交接資料統一由已發布技轉包提供；尚未發布的編號不會出現在交接資料。"
      destination="/technical-transfer?tab=published"
      destinationLabel="前往已發布交接"
      strategy="redirect"
      statusScope="handoffWorkbench"
    />
  );
}
