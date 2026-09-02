export const BOM_EDITOR_V2_FLAG = "PDM_BOM_XMIND_EDITOR_V2_ENABLED";

type EnvLike = Record<string, string | undefined>;

export function isBomStructuredEditorEnabled(env: EnvLike = process.env) {
  return ["1", "true", "on", "enabled"].includes(String(env[BOM_EDITOR_V2_FLAG] ?? "").trim().toLowerCase());
}

export function bomStructuredEditorClientStatus(env: EnvLike = process.env) {
  return {
    enabled: isBomStructuredEditorEnabled(env),
    flag: BOM_EDITOR_V2_FLAG,
    phase: "DEV-104"
  };
}
