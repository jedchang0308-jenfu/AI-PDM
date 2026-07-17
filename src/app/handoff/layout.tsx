import { NumberStateLegacyRoute } from "@/components/number-state-legacy-route";
import { isNumberStateFlowV1Enabled } from "@/lib/number-state-flow-feature";

export default function HandoffCompatibilityLayout({ children }: { children: React.ReactNode }) {
  if (!isNumberStateFlowV1Enabled()) return children;
  return (
    <NumberStateLegacyRoute
      title="製造交接已整合到技術移轉"
      message="交接資料統一由已發布技轉包提供；已保留但尚未正式生效的號碼不會出現在正式交接。"
      destination="/technical-transfer?tab=published"
      destinationLabel="前往已發布交接"
      strategy="redirect"
      statusScope="handoffWorkbench"
    />
  );
}
