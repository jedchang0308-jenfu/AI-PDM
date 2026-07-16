import { NumberStateLegacyRoute } from "@/components/number-state-legacy-route";
import { isNumberStateFlowV1Enabled } from "@/lib/number-state-flow-feature";

export default function PartDraftCompatibilityLayout({ children }: { children: React.ReactNode }) {
  if (!isNumberStateFlowV1Enabled()) return children;
  return (
    <NumberStateLegacyRoute
      title="料號草稿已整合"
      message="料號草稿已移到料號模組的草稿分頁。"
      destination="/parts?tab=drafts"
      destinationLabel="前往草稿分頁"
    />
  );
}
