import fs from "node:fs/promises";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

let authClient: any = null;

async function getAuthClient() {
  if (authClient) return authClient;

  const keyPath = resolveServiceAccountKeyPath();
  if (!keyPath) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not configured");
  }

  try {
    const keyFileExists = await fs
      .access(keyPath)
      .then(() => true)
      .catch(() => false);

    if (!keyFileExists) {
      throw new Error(`Service account key file not found at: ${keyPath}`);
    }

    const auth = new GoogleAuth({
      keyFile: keyPath,
      scopes: ["https://www.googleapis.com/auth/drive"]
    });
    authClient = await auth.getClient();
    return authClient;
  } catch (error) {
    throw new Error(`Failed to initialize Google Drive auth: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getAccessToken() {
  const mockToken = process.env.GOOGLE_DRIVE_MOCK_ACCESS_TOKEN?.trim();
  if (mockToken) return mockToken;

  const client = await getAuthClient();
  const token = await client.getAccessToken();
  return token.token ?? "";
}

function resolveServiceAccountKeyPath() {
  const configured = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim();
  if (!configured) return "";
  if (path.isAbsolute(configured)) return configured;
  return path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function getDriveApiBaseUrl() {
  return process.env.GOOGLE_DRIVE_API_BASE_URL?.trim() || "https://www.googleapis.com/drive/v3";
}

function getDriveUploadBaseUrl() {
  return process.env.GOOGLE_DRIVE_UPLOAD_BASE_URL?.trim() || "https://www.googleapis.com/upload/drive/v3";
}

async function requestDriveApi(path: string, options: { method?: string; body?: any; headers?: any } = {}) {
  const token = await getAccessToken();

  const url = `${getDriveApiBaseUrl()}${path}`;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers
    },
    body: options.body
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive API Error (${response.status}): ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

/**
 * Uploads a local file to Google Drive.
 * Uses a multipart upload to send metadata and content simultaneously.
 */
export async function uploadFileToDrive(input: {
  localPath: string;
  filename: string;
  targetFolderId: string;
  mimeType?: string;
}): Promise<string> {
  const token = await getAccessToken();

  const metadata = {
    name: input.filename,
    parents: [input.targetFolderId]
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );

  const fileBuffer = await fs.readFile(input.localPath);
  form.append(
    "file",
    new Blob([fileBuffer], { type: input.mimeType || "application/octet-stream" })
  );

  const url = `${getDriveUploadBaseUrl()}/files?uploadType=multipart`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive Upload Error (${response.status}): ${body}`);
  }

  const result = await response.json();
  return result.id;
}

/**
 * Moves an existing Drive file to a new folder.
 */
export async function moveFileToFolder(fileId: string, newFolderId: string) {
  // First, get the current parents
  const fileInfo = await requestDriveApi(`/files/${fileId}?fields=parents`);
  const previousParents = Array.isArray(fileInfo.parents) ? fileInfo.parents : [];

  // Move the file to the new folder
  await requestDriveApi(`/files/${fileId}?${formatParentMoveQuery([newFolderId], previousParents)}`, {
    method: "PATCH"
  });

  return { previousParents };
}

export async function moveFileToParents(fileId: string, parentIds: string[]) {
  const fileInfo = await requestDriveApi(`/files/${fileId}?fields=parents`);
  const currentParents = Array.isArray(fileInfo.parents) ? fileInfo.parents : [];

  await requestDriveApi(`/files/${fileId}?${formatParentMoveQuery(parentIds, currentParents)}`, {
    method: "PATCH"
  });
}

/**
 * Sets appProperties (anti-forgery metadata) on a Drive file.
 */
export async function setFileAppProperties(fileId: string, properties: Record<string, string>) {
  await requestDriveApi(`/files/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appProperties: properties })
  });
}

function formatParentMoveQuery(addParents: string[], removeParents: string[]) {
  const params = new URLSearchParams();
  if (addParents.length > 0) params.set("addParents", addParents.join(","));
  if (removeParents.length > 0) params.set("removeParents", removeParents.join(","));
  return params.toString();
}
