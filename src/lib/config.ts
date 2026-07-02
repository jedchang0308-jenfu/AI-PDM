import path from "node:path";
import { llmConfig } from "@/lib/llm-config";
import { getStorageUploadPolicy } from "@/lib/storage-upload-policy";

const root = /*turbopackIgnore: true*/ process.cwd();

function resolveAppPath(value: string | undefined, fallback: string) {
  const configured = value?.trim();
  if (!configured) return path.join(root, fallback);
  return path.isAbsolute(configured) ? configured : path.join(root, configured);
}

export const config = {
  dataDir: resolveAppPath(process.env.PDM_DATA_DIR, "data"),
  repositoryDir: resolveAppPath(process.env.PDM_REPOSITORY_DIR, path.join("data", "repository")),
  maxUploadFileBytes: getStorageUploadPolicy().maxUploadFileBytes,
  releaseFunctionUrl: process.env.RELEASE_FUNCTION_URL ?? "",
  releaseFunctionToken: process.env.RELEASE_FUNCTION_TOKEN ?? "",
  llmProvider: llmConfig.provider,
  openAiApiKey: llmConfig.openAiApiKey,
  openAiModel: llmConfig.openAiModel,
  openAiApiBaseUrl: llmConfig.openAiApiBaseUrl,
  openAiTimeoutMs: llmConfig.openAiTimeoutMs,
  openAiMaxContextChars: llmConfig.openAiMaxContextChars,
  openAiCacheTtlMs: llmConfig.openAiCacheTtlMs,
  openAiRateLimitPerMinute: llmConfig.openAiRateLimitPerMinute,
  googleServiceAccountKeyPath: resolveAppPath(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, path.join("secrets", "sa-key.json")),
  googleDrivePendingFolderId: process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID ?? "",
  googleDriveReleasedFolderId: process.env.GOOGLE_DRIVE_RELEASED_FOLDER_ID ?? ""
};
