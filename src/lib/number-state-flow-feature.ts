export const NUMBER_STATE_FLOW_V1_FLAG = "PDM_NUMBER_STATE_FLOW_V1";
export const NUMBER_LIFECYCLE_V2_FLAG = "PDM_NUMBER_LIFECYCLE_V2";

type EnvLike = Record<string, string | undefined>;

export function isNumberStateFlowV1Enabled(env: EnvLike = process.env) {
  const value = String(env[NUMBER_STATE_FLOW_V1_FLAG] ?? "").trim().toLowerCase();
  if (!value) return true;
  return ["1", "true", "on", "enabled"].includes(value);
}

export function numberStateFlowV1ClientStatus(env: EnvLike = process.env) {
  return {
    enabled: isNumberStateFlowV1Enabled(env),
    flag: NUMBER_STATE_FLOW_V1_FLAG,
    phase: "1B"
  };
}

export function isNumberLifecycleV2Enabled(env: EnvLike = process.env) {
  const value = String(env[NUMBER_LIFECYCLE_V2_FLAG] ?? "").trim().toLowerCase();
  if (!value) return false;
  return ["1", "true", "on", "enabled"].includes(value);
}

export function numberLifecycleV2ClientStatus(env: EnvLike = process.env) {
  return {
    enabled: isNumberLifecycleV2Enabled(env),
    flag: NUMBER_LIFECYCLE_V2_FLAG,
    phase: "1D"
  };
}
