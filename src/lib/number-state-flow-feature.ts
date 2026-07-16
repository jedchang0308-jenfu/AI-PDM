export const NUMBER_STATE_FLOW_V1_FLAG = "PDM_NUMBER_STATE_FLOW_V1";

type EnvLike = Record<string, string | undefined>;

export function isNumberStateFlowV1Enabled(env: EnvLike = process.env) {
  return ["1", "true", "on", "enabled"].includes(String(env[NUMBER_STATE_FLOW_V1_FLAG] ?? "").trim().toLowerCase());
}

export function numberStateFlowV1ClientStatus(env: EnvLike = process.env) {
  return {
    enabled: isNumberStateFlowV1Enabled(env),
    flag: NUMBER_STATE_FLOW_V1_FLAG,
    phase: "1B"
  };
}
