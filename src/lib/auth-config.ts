export type UserRole = "Engineer" | "R&D Manager" | "Admin" | "Manufacturing" | "Procurement";

export type AuthMode = "demo" | "managed" | "firebase_bff";

export type JenfuPlatformAuthMode = "off" | "on";

export type JenfuIdentityConfig = {
  firebaseProjectId: string;
  identityIssuer: string;
  identityAudience: string;
};

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
};

export type GoogleWorkspaceMfaTrustPolicy = {
  enabled: boolean;
  allowAal1PrivilegedPilot: boolean;
  domains: string[];
};

export type JenfuSsoHandoffConfig = {
  broker: string;
  base: string;
  issuer: string;
  callback: string;
};

export type JenfuSsoHandoffEntryState = "off" | "on" | "invalid";

function enabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function splitDomains(value: string | undefined) {
  return String(value ?? "jenfu.com.tw")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getAuthMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  const configured = String(env.PDM_AUTH_MODE ?? "").trim().toLowerCase();
  if (configured === "managed" || configured === "firebase_bff") return configured;
  return "demo";
}

export function getJenfuPlatformAuthMode(env: NodeJS.ProcessEnv = process.env): JenfuPlatformAuthMode {
  const configured = String(env.PDM_JENFU_PLATFORM_AUTH_MODE ?? "off").trim().toLowerCase();
  if (configured === "off" || configured === "on") return configured;
  throw new Error("JENFU_PLATFORM_AUTH_MODE_INVALID");
}

function requiredJenfuIdentityValue(env: NodeJS.ProcessEnv, name: string) {
  const value = String(env[name] ?? "").trim();
  if (!value) throw new Error(`JENFU_IDENTITY_CONFIG_MISSING:${name}`);
  return value;
}

export function getJenfuIdentityConfig(env: NodeJS.ProcessEnv = process.env): JenfuIdentityConfig {
  if (getJenfuPlatformAuthMode(env) !== "on") throw new Error("JENFU_PLATFORM_AUTH_MODE_NOT_ENABLED");
  if (getAuthMode(env) !== "firebase_bff") throw new Error("JENFU_IDENTITY_REQUIRES_FIREBASE_BFF");

  const firebaseProjectId = requiredJenfuIdentityValue(env, "JENFU_FIREBASE_PROJECT_ID");
  const identityIssuer = requiredJenfuIdentityValue(env, "JENFU_IDENTITY_ISSUER");
  const identityAudience = requiredJenfuIdentityValue(env, "JENFU_IDENTITY_AUDIENCE");
  const pdmFirebaseProjectId = requiredJenfuIdentityValue(env, "PDM_FIREBASE_PROJECT_ID");
  const expectedIssuer = `https://securetoken.google.com/${firebaseProjectId}`;
  if (
    identityIssuer !== expectedIssuer ||
    identityAudience !== firebaseProjectId ||
    pdmFirebaseProjectId !== firebaseProjectId
  ) {
    throw new Error("JENFU_IDENTITY_CONFIG_MISMATCH");
  }
  return { firebaseProjectId, identityIssuer, identityAudience };
}

export function getFirebaseWebConfig(env: NodeJS.ProcessEnv = process.env): FirebaseWebConfig | null {
  const config = {
    apiKey: String(env.PDM_FIREBASE_API_KEY ?? "").trim(),
    authDomain: String(env.PDM_FIREBASE_AUTH_DOMAIN ?? "").trim(),
    projectId: String(env.PDM_FIREBASE_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT ?? "").trim(),
    appId: String(env.PDM_FIREBASE_APP_ID ?? "").trim()
  };
  return Object.values(config).every(Boolean) ? config : null;
}

export function getJenfuSsoHandoffConfig(env: NodeJS.ProcessEnv = process.env): JenfuSsoHandoffConfig {
  if (getAuthMode(env) !== "firebase_bff" || getJenfuPlatformAuthMode(env) !== "on" || String(env.PDM_JENFU_SSO_HANDOFF_MODE ?? "off").trim().toLowerCase() !== "on") {
    throw new Error("SSO_DISABLED");
  }
  const broker = String(env.PDM_JENFU_SSO_BROKER_ORIGIN ?? "").trim();
  const base = String(env.PDM_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/u, "");
  if (!broker || !base) throw new Error("SSO_CONFIG_MISSING");
  const brokerUrl = new URL(broker);
  const baseUrl = new URL(base);
  if (!["http:", "https:"].includes(brokerUrl.protocol) || !["http:", "https:"].includes(baseUrl.protocol) || brokerUrl.search || brokerUrl.hash || brokerUrl.pathname !== "/" || baseUrl.search || baseUrl.hash || baseUrl.pathname !== "/") {
    throw new Error("SSO_ORIGIN_INVALID");
  }
  return { broker: brokerUrl.origin, base: baseUrl.origin, issuer: `${brokerUrl.origin}/api/sso`, callback: `${baseUrl.origin}/api/auth/jenfu-sso/callback` };
}

export function getJenfuSsoHandoffEntryState(env: NodeJS.ProcessEnv = process.env): JenfuSsoHandoffEntryState {
  const mode = String(env.PDM_JENFU_SSO_HANDOFF_MODE ?? "off").trim().toLowerCase();
  if (!mode || mode === "off") return "off";
  if (mode !== "on") return "invalid";
  try {
    getJenfuSsoHandoffConfig(env);
    return "on";
  } catch {
    return "invalid";
  }
}

export function getGoogleWorkspaceMfaTrustPolicy(env: NodeJS.ProcessEnv = process.env): GoogleWorkspaceMfaTrustPolicy {
  return {
    enabled: enabled(env.PDM_TRUST_GOOGLE_WORKSPACE_MFA),
    allowAal1PrivilegedPilot: enabled(env.PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED),
    domains: splitDomains(env.PDM_GOOGLE_WORKSPACE_DOMAINS)
  };
}

export function isTrustedGoogleWorkspaceEmail(email: string, policy: GoogleWorkspaceMfaTrustPolicy) {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.includes("@") ? normalized.split("@").pop() ?? "" : "";
  return Boolean(domain) && policy.domains.includes(domain);
}
