import { NumberStateLegacyRoute } from "@/components/number-state-legacy-route";
import { isNumberStateFlowV1Enabled } from "@/lib/number-state-flow-feature";

export default function NumberingRequestCompatibilityLayout({ children }: { children: React.ReactNode }) {
  if (!isNumberStateFlowV1Enabled()) return children;
  return (
    <NumberStateLegacyRoute
      title="領號入口已整合"
      message="請從圖料模組建立草稿，再明確取得候選號。"
      destination="/numbering/search?create=numbering"
      destinationLabel="前往建立圖料號"
    />
  );
}
