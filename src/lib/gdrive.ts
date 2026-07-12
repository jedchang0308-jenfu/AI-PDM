import fs from "node:fs/promises";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

let authClient: any = null;

const driveFolderMimeType = "application/vnd.google-apps.folder";

export type DriveFolderListItem = {
  id: string;
  name: string;
  mimeType: string;
  driveId: string | null;
  hasChildren: boolean;
  webViewLink: string;
};

export type VerifiedDriveFolder = {
  valid: boolean;
  folder: {
    id: string;
    name: string;
    path: string;
    webViewLink: string;
    driveId: string | null;
  };
  capabilities: {
    canRead: boolean;
    canUpload: boolean;
    canMoveInto: boolean;
  };
  verifiedAt: string;
};

export type DriveFileListItem = {
  id: string;
  name: string;
  mimeType: string;
  driveId: string | null;
  webViewLink: string;
};

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

export function isGoogleDriveServiceConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim() ||
      process.env.GOOGLE_DRIVE_MOCK_ACCESS_TOKEN?.trim() ||
      process.env.GOOGLE_DRIVE_API_BASE_URL?.trim()
  );
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

export async function listDriveFolders(parentId = "root"): Promise<DriveFolderListItem[]> {
  const normalizedParentId = parentId.trim() || "root";
  const params = new URLSearchParams({
    q: `'${escapeDriveQueryValue(normalizedParentId)}' in parents and mimeType = '${driveFolderMimeType}' and trashed = false`,
    fields: "files(id,name,mimeType,driveId,webViewLink,capabilities(canAddChildren),parents)",
    pageSize: "100",
    orderBy: "folder,name",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true"
  });
  const result = await requestDriveApi(`/files?${params.toString()}`);
  const files = Array.isArray(result.files) ? result.files : [];
  return files.map(mapDriveFolderListItem);
}

export async function findDriveFileInFolderByName(input: {
  parentId: string;
  filename: string;
  includeFolders?: boolean;
}): Promise<DriveFileListItem | null> {
  const normalizedParentId = input.parentId.trim() || "root";
  const normalizedName = input.filename.trim();
  if (!normalizedName) return null;
  const folderFilter = input.includeFolders ? "" : ` and mimeType != '${driveFolderMimeType}'`;
  const params = new URLSearchParams({
    q: `'${escapeDriveQueryValue(normalizedParentId)}' in parents and name = '${escapeDriveQueryValue(normalizedName)}'${folderFilter} and trashed = false`,
    fields: "files(id,name,mimeType,driveId,webViewLink)",
    pageSize: "10",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true"
  });
  const result = await requestDriveApi(`/files?${params.toString()}`);
  const files = Array.isArray(result.files) ? result.files : [];
  return files[0] ? mapDriveFileListItem(files[0]) : null;
}

export async function ensureDriveFolder(input: { parentId: string; folderName: string }): Promise<DriveFolderListItem> {
  const existing = await findDriveFileInFolderByName({
    parentId: input.parentId,
    filename: input.folderName,
    includeFolders: true
  });
  if (existing) {
    if (existing.mimeType !== driveFolderMimeType) {
      throw new Error(`Drive path collision: ${input.folderName} exists but is not a folder`);
    }
    return {
      id: existing.id,
      name: existing.name,
      mimeType: existing.mimeType,
      driveId: existing.driveId,
      hasChildren: true,
      webViewLink: existing.webViewLink
    };
  }

  const created = await requestDriveApi("/files?supportsAllDrives=true&fields=id,name,mimeType,driveId,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.folderName,
      mimeType: driveFolderMimeType,
      parents: [input.parentId.trim() || "root"]
    })
  });
  return {
    ...mapDriveFolderListItem(created),
    hasChildren: true
  };
}

export async function verifyDriveFolder(folderId: string): Promise<VerifiedDriveFolder> {
  const normalizedFolderId = folderId.trim();
  if (!normalizedFolderId) {
    throw new Error("Google Drive folder ID is required");
  }

  const folder = await getDriveFolderMetadata(normalizedFolderId);
  if (folder.mimeType !== driveFolderMimeType) {
    throw new Error("Google Drive target is not a folder");
  }

  const canUpload = folder.capabilities?.canAddChildren !== false;
  const pathText = await buildDriveFolderPath(folder);

  return {
    valid: true,
    folder: {
      id: folder.id,
      name: folder.name,
      path: pathText,
      webViewLink: folder.webViewLink || driveFolderUrl(folder.id),
      driveId: folder.driveId ?? null
    },
    capabilities: {
      canRead: true,
      canUpload,
      canMoveInto: canUpload
    },
    verifiedAt: new Date().toISOString()
  };
}

async function getDriveFolderMetadata(folderId: string): Promise<any> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,driveId,parents,webViewLink,capabilities(canAddChildren,canEdit,canShare)",
    supportsAllDrives: "true"
  });
  return requestDriveApi(`/files/${encodeURIComponent(folderId)}?${params.toString()}`);
}

async function buildDriveFolderPath(folder: any) {
  const segments = [folder.name || folder.id];
  let current = folder;
  const visited = new Set<string>([folder.id]);

  for (let depth = 0; depth < 12; depth += 1) {
    const parentId = Array.isArray(current.parents) ? current.parents[0] : "";
    if (!parentId || parentId === "root" || visited.has(parentId)) break;
    visited.add(parentId);
    try {
      current = await getDriveFolderMetadata(parentId);
      segments.unshift(current.name || current.id);
    } catch {
      break;
    }
  }

  return ["Google Drive", ...segments].join(" / ");
}

function mapDriveFolderListItem(file: any): DriveFolderListItem {
  return {
    id: String(file.id ?? ""),
    name: String(file.name ?? ""),
    mimeType: String(file.mimeType ?? driveFolderMimeType),
    driveId: file.driveId ? String(file.driveId) : null,
    hasChildren: true,
    webViewLink: String(file.webViewLink ?? driveFolderUrl(String(file.id ?? "")))
  };
}

function mapDriveFileListItem(file: any): DriveFileListItem {
  return {
    id: String(file.id ?? ""),
    name: String(file.name ?? ""),
    mimeType: String(file.mimeType ?? ""),
    driveId: file.driveId ? String(file.driveId) : null,
    webViewLink: String(file.webViewLink ?? driveFileUrl(String(file.id ?? "")))
  };
}

function driveFolderUrl(folderId: string) {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

function driveFileUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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

export async function uploadBytesToDrive(input: {
  bytes: Buffer;
  filename: string;
  targetFolderId: string;
  mimeType?: string;
  appProperties?: Record<string, string>;
}): Promise<string> {
  const token = await getAccessToken();

  const metadata = {
    name: input.filename,
    parents: [input.targetFolderId],
    ...(input.appProperties ? { appProperties: input.appProperties } : {})
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([bufferToArrayBuffer(input.bytes)], { type: input.mimeType || "application/octet-stream" }));

  const url = `${getDriveUploadBaseUrl()}/files?uploadType=multipart&supportsAllDrives=true`;
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

function bufferToArrayBuffer(bytes: Buffer) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
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
