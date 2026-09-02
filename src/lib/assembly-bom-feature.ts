import { isBomStructuredEditorEnabled } from "@/lib/bom-editor-feature";
import { isUnifiedPartRelationWorkbenchV1Enabled } from "@/lib/number-state-flow-feature";

export const ASSEMBLY_SHARED_BOM_V1_FLAG = "PDM_ASSEMBLY_SHARED_BOM_V1";

type EnvLike = Record<string, string | undefined>;

function truthy(value: string | undefined) {
  return ["1", "true", "on", "enabled"].includes(String(value ?? "").trim().toLowerCase());
}

export function isAssemblySharedBomV1Enabled(env: EnvLike = process.env) {
  return truthy(env[ASSEMBLY_SHARED_BOM_V1_FLAG])
    && isUnifiedPartRelationWorkbenchV1Enabled(env)
    && isBomStructuredEditorEnabled(env);
}

export function assemblySharedBomV1ClientStatus(env: EnvLike = process.env) {
  const requested = truthy(env[ASSEMBLY_SHARED_BOM_V1_FLAG]);
  const dependencies = {
    unifiedPartRelationWorkbench: isUnifiedPartRelationWorkbenchV1Enabled(env),
    bomStructuredEditor: isBomStructuredEditorEnabled(env)
  };
  return {
    requested,
    enabled: requested && dependencies.unifiedPartRelationWorkbench && dependencies.bomStructuredEditor,
    flag: ASSEMBLY_SHARED_BOM_V1_FLAG,
    dependencies,
    phase: "DEV-096"
  };
}
