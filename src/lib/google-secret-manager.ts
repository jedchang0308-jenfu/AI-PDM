import { GoogleAuth } from "google-auth-library";

const GOOGLE_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_API_BASE_URL = "https://secretmanager.googleapis.com/v1";

export type GoogleSecretManagerConfig = {
  projectId: string;
  secretId: string;
  apiBaseUrl: string;
};

type GoogleAccessTokenClient = {
  getAccessToken(): Promise<{ token?: string | null } | string>;
};

export type GoogleSecretManagerAuth = {
  getClient(): Promise<GoogleAccessTokenClient>;
};

export type GoogleSecretManagerFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class GoogleSecretManagerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
    readonly retryable = false
  ) {
    super(message);
  }
}

export function getGoogleSecretManagerConfig(): GoogleSecretManagerConfig | null {
  const projectId = String(process.env.PDM_GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? "").trim();
  const secretId = String(process.env.PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID ?? "").trim();
  if (!projectId || !secretId) return null;
  return {
    projectId,
    secretId,
    apiBaseUrl: String(process.env.PDM_GOOGLE_SECRET_MANAGER_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/u, "")
  };
}

export function isGoogleSecretManagerReadEnabled() {
  return process.env.PDM_ENABLE_GCP_SECRET_READS === "true";
}

export function isGoogleSecretManagerWriteEnabled() {
  return process.env.PDM_ENABLE_GCP_SECRET_WRITES === "true";
}

export class GoogleSecretManagerProvider {
  private readonly auth: GoogleSecretManagerAuth;
  private readonly fetchImpl: GoogleSecretManagerFetch;

  constructor(
    private readonly config: GoogleSecretManagerConfig = getGoogleSecretManagerConfig() ?? missingConfig(),
    dependencies: { auth?: GoogleSecretManagerAuth; fetchImpl?: GoogleSecretManagerFetch } = {}
  ) {
    this.auth = dependencies.auth ?? new GoogleAuth({ scopes: [GOOGLE_CLOUD_PLATFORM_SCOPE] });
    this.fetchImpl = dependencies.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  get secretName() {
    return `projects/${this.config.projectId}/secrets/${this.config.secretId}`;
  }

  async addVersion(value: string) {
    if (!isGoogleSecretManagerWriteEnabled()) {
      throw new GoogleSecretManagerError(
        "GCP_SECRET_MANAGER_WRITE_GATE_REQUIRED",
        "Google Secret Manager 寫入尚未開啟。",
        409
      );
    }
    const response = await this.request(this.secretName + ":addVersion", {
      method: "POST",
      body: JSON.stringify({ payload: { data: Buffer.from(value, "utf8").toString("base64") } })
    });
    const name = String(response?.name ?? "").trim();
    if (!isExactVersionResource(name, this.secretName)) {
      throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_INVALID_VERSION", "Google Secret Manager 未回傳有效的精確版本。", 502);
    }
    return name;
  }

  async accessVersion(versionName: string) {
    if (!isGoogleSecretManagerReadEnabled()) {
      throw new GoogleSecretManagerError(
        "GCP_SECRET_MANAGER_READ_GATE_REQUIRED",
        "Google Secret Manager 讀取尚未開啟。",
        409
      );
    }
    if (!isExactVersionResource(versionName, this.secretName)) {
      throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_VERSION_REFERENCE_INVALID", "Google Secret Manager 版本 reference 無效。", 400);
    }
    const response = await this.request(`${versionName}:access`, { method: "GET" });
    const encoded = String(response?.payload?.data ?? "").trim();
    if (!encoded) throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_SECRET_EMPTY", "Google Secret Manager 版本沒有可讀取的 key。", 404);
    try {
      const value = Buffer.from(encoded, "base64").toString("utf8").trim();
      if (!value) throw new Error("empty");
      return value;
    } catch {
      throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_PAYLOAD_INVALID", "Google Secret Manager payload 無法解碼。", 502);
    }
  }

  private async request(path: string, init: RequestInit) {
    const client = await this.auth.getClient();
    const accessTokenResult = await client.getAccessToken();
    const accessToken = typeof accessTokenResult === "string" ? accessTokenResult : accessTokenResult?.token;
    if (!accessToken) throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_ADC_UNAVAILABLE", "Google runtime credential 尚未就緒。", 503, true);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.apiBaseUrl}/${path}`, {
        ...init,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
          ...(init.headers ?? {})
        }
      });
    } catch {
      throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_UNREACHABLE", "Google Secret Manager 暫時無法連線。", 503, true);
    }
    if (response.ok) return response.json();
    if (response.status === 401 || response.status === 403) {
      throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_PERMISSION_DENIED", "Google Secret Manager 權限不足。", response.status);
    }
    if (response.status === 404) {
      throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_VERSION_NOT_FOUND", "Google Secret Manager 找不到指定版本。", 404);
    }
    if (response.status === 429) {
      throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_RATE_LIMITED", "Google Secret Manager 暫時限制請求頻率。", 429, true);
    }
    if (response.status === 400) {
      throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_VERSION_DISABLED", "Google Secret Manager 版本目前不可讀取。", 409);
    }
    throw new GoogleSecretManagerError("GCP_SECRET_MANAGER_REQUEST_FAILED", "Google Secret Manager 請求失敗。", 502, response.status >= 500);
  }
}

export function isExactVersionResource(value: string, secretName: string) {
  return new RegExp(`^${escapeRegExp(secretName)}/versions/[1-9][0-9]*$`, "u").test(value) && !value.endsWith("/versions/latest");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function missingConfig(): GoogleSecretManagerConfig {
  throw new GoogleSecretManagerError(
    "GCP_SECRET_MANAGER_CONFIG_MISSING",
    "Google Secret Manager 尚未設定 project 與 SolidWorks secret ID。",
    409
  );
}
