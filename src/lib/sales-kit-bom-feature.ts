import { isAssemblySharedBomV1Enabled } from "@/lib/assembly-bom-feature";
import { isBomStructuredEditorEnabled } from "@/lib/bom-editor-feature";

export const SALES_KIT_BOM_V1_FLAG = "PDM_SALES_KIT_BOM_V1_ENABLED";

type EnvLike = Record<string, string | undefined>;

function truthy(value: string | undefined) {
  return ["1", "true", "on", "enabled"].includes(String(value ?? "").trim().toLowerCase());
}

export function isSalesKitBomV1Enabled(env: EnvLike = process.env) {
  return truthy(env[SALES_KIT_BOM_V1_FLAG])
    && isAssemblySharedBomV1Enabled(env)
    && isBomStructuredEditorEnabled(env);
}

export function salesKitBomV1ClientStatus(env: EnvLike = process.env) {
  const requested = truthy(env[SALES_KIT_BOM_V1_FLAG]);
  const dependencies = {
    sharedAssemblyBom: isAssemblySharedBomV1Enabled(env),
    bomStructuredEditor: isBomStructuredEditorEnabled(env)
  };
  return {
    requested,
    enabled: requested && dependencies.sharedAssemblyBom && dependencies.bomStructuredEditor,
    flag: SALES_KIT_BOM_V1_FLAG,
    dependencies,
    phase: "DEV-106"
  };
}
