import path from "node:path";
import { getStorageUploadPolicy } from "@/lib/storage-upload-policy";

const root = /*turbopackIgnore: true*/ process.cwd();

function resolveAppPath(value: string | undefined, fallback: string) {
  const configured = value?.trim();
  if (!configured) return path.join(root, fallback);
  return path.isAbsolute(configured) ? configured : path.join(root, configured);
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  dataDir: resolveAppPath(process.env.PDM_DATA_DIR, "data"),
  repositoryDir: resolveAppPath(process.env.PDM_REPOSITORY_DIR, path.join("data", "repository")),
  maxUploadFileBytes: getStorageUploadPolicy().maxUploadFileBytes,
  releaseFunctionUrl: process.env.RELEASE_FUNCTION_URL ?? "",
  releaseFunctionToken: process.env.RELEASE_FUNCTION_TOKEN ?? "",
  llmProvider: process.env.LLM_PROVIDER ?? "local",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  openAiApiBaseUrl: process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1",
  openAiTimeoutMs: parsePositiveInt(process.env.OPENAI_TIMEOUT_MS, 30000),
  openAiMaxContextChars: parsePositiveInt(process.env.OPENAI_MAX_CONTEXT_CHARS, 12000),
  openAiCacheTtlMs: parsePositiveInt(process.env.OPENAI_CACHE_TTL_MS, 300000),
  openAiRateLimitPerMinute: parsePositiveInt(process.env.OPENAI_RATE_LIMIT_PER_MINUTE, 20),
  googleServiceAccountKeyPath: resolveAppPath(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, path.join("secrets", "sa-key.json")),
  googleDrivePendingFolderId: process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID ?? "",
  googleDriveReleasedFolderId: process.env.GOOGLE_DRIVE_RELEASED_FOLDER_ID ?? ""
};
