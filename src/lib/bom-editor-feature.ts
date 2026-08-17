export const BOM_XMIND_EDITOR_V2_FLAG = "PDM_BOM_XMIND_EDITOR_V2_ENABLED";

type EnvLike = Record<string, string | undefined>;

export function isBomXmindEditorV2Enabled(env: EnvLike = process.env) {
  return ["1", "true", "on", "enabled"].includes(String(env[BOM_XMIND_EDITOR_V2_FLAG] ?? "").trim().toLowerCase());
}

export function bomXmindEditorV2ClientStatus(env: EnvLike = process.env) {
  return {
    enabled: isBomXmindEditorV2Enabled(env),
    flag: BOM_XMIND_EDITOR_V2_FLAG,
    phase: "DEV-071"
  };
}
