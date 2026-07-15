export type UserRole = "Engineer" | "R&D Manager" | "Admin" | "Manufacturing" | "Procurement";

export type AuthMode = "demo" | "managed" | "firebase_bff";

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

function enabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function splitDomains(value: string | undefined) {
  return String(value ?? "jenfu.com.tw")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getAuthMode(): AuthMode {
  const configured = String(process.env.PDM_AUTH_MODE ?? "").trim().toLowerCase();
  if (configured === "managed" || configured === "firebase_bff") return configured;
  return "demo";
}

export function getFirebaseWebConfig(): FirebaseWebConfig | null {
  const config = {
    apiKey: String(process.env.PDM_FIREBASE_API_KEY ?? "").trim(),
    authDomain: String(process.env.PDM_FIREBASE_AUTH_DOMAIN ?? "").trim(),
    projectId: String(process.env.PDM_FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? "").trim(),
    appId: String(process.env.PDM_FIREBASE_APP_ID ?? "").trim()
  };
  return Object.values(config).every(Boolean) ? config : null;
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
