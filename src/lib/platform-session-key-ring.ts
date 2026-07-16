import type { PlatformSessionKeyRing } from "@/lib/platform-session-v2";

type SessionKeyEnvironment = Record<string, string | undefined>;

function required(env: SessionKeyEnvironment, name: string) {
  const value = String(env[name] ?? "").trim();
  if (!value) throw new Error(`SESSION_V2_CONFIG_MISSING:${name}`);
  return value;
}

function assertSecret(name: string, value: string) {
  if (Buffer.byteLength(value, "utf8") < 32) throw new Error(`SESSION_V2_SECRET_TOO_SHORT:${name}`);
}

export function getPlatformSessionKeyRing(env: SessionKeyEnvironment = process.env): PlatformSessionKeyRing {
  const issuer = required(env, "PDM_SESSION_ISSUER");
  const audience = required(env, "PDM_SESSION_AUDIENCE");
  const currentKeyId = required(env, "PDM_SESSION_CURRENT_KEY_ID");
  const currentSecret = required(env, "PDM_SESSION_CURRENT_SECRET");
  assertSecret("PDM_SESSION_CURRENT_SECRET", currentSecret);

  const keys: Record<string, string> = { [currentKeyId]: currentSecret };
  const previousKeyId = String(env.PDM_SESSION_PREVIOUS_KEY_ID ?? "").trim();
  const previousSecret = String(env.PDM_SESSION_PREVIOUS_SECRET ?? "").trim();
  if (Boolean(previousKeyId) !== Boolean(previousSecret)) {
    throw new Error("SESSION_V2_PREVIOUS_KEY_PAIR_INCOMPLETE");
  }
  if (previousKeyId) {
    if (previousKeyId === currentKeyId) throw new Error("SESSION_V2_KEY_IDS_MUST_DIFFER");
    assertSecret("PDM_SESSION_PREVIOUS_SECRET", previousSecret);
    keys[previousKeyId] = previousSecret;
  }

  return { issuer, audience, currentKeyId, keys };
}
