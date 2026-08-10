import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type FileStorageProvider = "local_repository" | "supabase_storage" | "s3_compatible" | "google_cloud_storage";

export type PutObjectInput = {
  key: string;
  bytes: Buffer;
  contentType?: string;
  cacheControl?: string;
};

export type StoredObject = {
  provider: FileStorageProvider;
  key: string;
  bucket?: string;
  localPath: string;
  bytes: number;
  sha256: string;
};

export type StorageObjectMetadata = {
  provider: FileStorageProvider;
  key: string;
  bucket?: string;
  localPath: string;
  bytes: number;
};

export type S3CompatibleStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  liveEnabled: boolean;
  forcePathStyle: boolean;
  providerProfile: "cloudflare_r2" | "aws_s3" | "backblaze_b2" | "wasabi" | "nas_gateway" | "custom";
};

export type GoogleCloudStorageDisabledConfig = {
  projectId: string;
  bucket: string;
};

export type DownloadAccessMode = "server_stream" | "signed_url";

export type CreateDownloadUrlInput = {
  key: string;
  expiresInSeconds?: number;
  filename?: string;
  forceDownload?: boolean;
  purpose?: "preview" | "download" | "release_package" | "supplier_share" | "internal";
};

export type DownloadUrl = {
  provider: FileStorageProvider;
  key: string;
  bucket?: string;
  mode: DownloadAccessMode;
  url: string | null;
  expiresInSeconds: number;
  expiresAt: string | null;
  auditRequired: true;
  authorizationHeaderRequired: boolean;
};

export type StoredFileStoragePointer = {
  provider: FileStorageProvider;
  bucket: string | null;
  key: string;
  legacyLocalPath?: string | null;
};

export interface FileStorageService {
  readonly provider: FileStorageProvider;
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObjectMetadata(key: string): Promise<StorageObjectMetadata | null>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<DownloadUrl>;
  readObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  verifyObjectHash(key: string, expectedSha256: string): Promise<boolean>;
}

export class LocalRepositoryStorageAdapter implements FileStorageService {
  readonly provider = "local_repository" as const;

  constructor(private readonly repositoryDir = getRepositoryDir()) {}

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const contentHash = sha256(input.bytes);
    const existing = await this.findExistingObjectBySha256(contentHash);
    if (existing) {
      return {
        provider: this.provider,
        key: existing.key,
        localPath: existing.localPath,
        bytes: existing.bytes,
        sha256: contentHash
      };
    }

    const localPath = this.resolveKey(input.key);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, input.bytes);
    return {
      provider: this.provider,
      key: normalizeStorageKey(input.key),
      localPath,
      bytes: input.bytes.byteLength,
      sha256: contentHash
    };
  }

  async getObjectMetadata(key: string): Promise<StorageObjectMetadata | null> {
    const localPath = this.resolveKey(key);
    try {
      const stat = await fs.stat(localPath);
      if (!stat.isFile()) return null;
      return {
        provider: this.provider,
        key: normalizeStorageKey(key),
        localPath,
        bytes: stat.size
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw error;
    }
  }

  async createDownloadUrl(input: CreateDownloadUrlInput): Promise<DownloadUrl> {
    const key = normalizeStorageKey(input.key);
    return {
      provider: this.provider,
      key,
      mode: "server_stream",
      url: null,
      expiresInSeconds: 0,
      expiresAt: null,
      auditRequired: true,
      authorizationHeaderRequired: true
    };
  }

  async readObject(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async deleteObject(key: string): Promise<void> {
    await fs.rm(this.resolveKey(key), { force: true });
  }

  async verifyObjectHash(key: string, expectedSha256: string): Promise<boolean> {
    const bytes = await this.readObject(key);
    return sha256(bytes) === expectedSha256.toLowerCase();
  }

  private resolveKey(key: string) {
    const repositoryRoot = path.resolve(/*turbopackIgnore: true*/ this.repositoryDir);
    const normalizedKey = normalizeStorageKey(key);
    const targetPath = path.resolve(/*turbopackIgnore: true*/ repositoryRoot, normalizedKey);
    if (!targetPath.startsWith(repositoryRoot + path.sep)) {
      throw new Error("Storage object key resolves outside repository root");
    }
    return targetPath;
  }

  private async findExistingObjectBySha256(expectedSha256: string) {
    const repositoryRoot = path.resolve(/*turbopackIgnore: true*/ this.repositoryDir);
    const candidates = await listLocalRepositoryFiles(repositoryRoot);
    for (const localPath of candidates) {
      try {
        const bytes = await fs.readFile(localPath);
        if (sha256(bytes) !== expectedSha256) continue;
        return {
          key: path.relative(repositoryRoot, localPath).split(path.sep).join("/"),
          localPath,
          bytes: bytes.byteLength
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") continue;
        throw error;
      }
    }
    return null;
  }
}

export class RetiredSupabaseStorageAdapter implements FileStorageService {
  readonly provider = "supabase_storage" as const;

  constructor(private readonly bucket: string | null = null) {}

  async putObject(): Promise<StoredObject> {
    return this.unavailable("putObject");
  }

  async getObjectMetadata(): Promise<StorageObjectMetadata | null> {
    return this.unavailable("getObjectMetadata");
  }

  async readObject(): Promise<Buffer> {
    return this.unavailable("readObject");
  }

  async createDownloadUrl(): Promise<DownloadUrl> {
    return this.unavailable("createDownloadUrl");
  }

  async deleteObject(): Promise<void> {
    return this.unavailable("deleteObject");
  }

  async verifyObjectHash(): Promise<boolean> {
    return this.unavailable("verifyObjectHash");
  }

  private unavailable(operation: string): never {
    const bucket = this.bucket ? `:${this.bucket}` : "";
    throw new Error(`SUPABASE_STORAGE_RETIRED_USE_GCS:${operation}${bucket}`);
  }
}

export class S3CompatibleStorageAdapter implements FileStorageService {
  readonly provider = "s3_compatible" as const;

  constructor(private readonly config: S3CompatibleStorageConfig) {}

  async putObject(): Promise<StoredObject> {
    this.assertLiveEnabled("putObject");
    throw new Error("S3-compatible Storage putObject is disabled until signed request staging gate is implemented");
  }

  async getObjectMetadata(): Promise<StorageObjectMetadata | null> {
    this.assertLiveEnabled("getObjectMetadata");
    throw new Error("S3-compatible Storage metadata lookup is disabled until signed request staging gate is implemented");
  }

  async createDownloadUrl(): Promise<DownloadUrl> {
    this.assertLiveEnabled("createDownloadUrl");
    throw new Error("S3-compatible Storage signed URL generation is disabled until signed request staging gate is implemented");
  }

  async readObject(): Promise<Buffer> {
    this.assertLiveEnabled("readObject");
    throw new Error("S3-compatible Storage readObject is disabled until signed request staging gate is implemented");
  }

  async deleteObject(): Promise<void> {
    throw new Error("S3-compatible Storage delete is disabled until lifecycle and rollback gates are implemented");
  }

  async verifyObjectHash(): Promise<boolean> {
    this.assertLiveEnabled("verifyObjectHash");
    throw new Error("S3-compatible Storage hash verification is disabled until signed request staging gate is implemented");
  }

  buildPointer(key: string) {
    return `s3-compatible://${this.config.bucket}/${normalizeStorageKey(key)}`;
  }

  private assertLiveEnabled(operation: string) {
    if (!this.config.liveEnabled) {
      throw new Error(`S3-compatible Storage ${operation} is disabled; set PDM_S3_COMPATIBLE_LIVE_ENABLED=1 only after staging QC`);
    }
  }
}

export class GoogleCloudStorageDisabledAdapter implements FileStorageService {
  readonly provider = "google_cloud_storage" as const;

  constructor(private readonly config: GoogleCloudStorageDisabledConfig) {}

  async putObject(): Promise<StoredObject> {
    return this.unavailable("putObject");
  }

  async getObjectMetadata(): Promise<StorageObjectMetadata | null> {
    return this.unavailable("getObjectMetadata");
  }

  async createDownloadUrl(): Promise<DownloadUrl> {
    return this.unavailable("createDownloadUrl");
  }

  async readObject(): Promise<Buffer> {
    return this.unavailable("readObject");
  }

  async deleteObject(): Promise<void> {
    return this.unavailable("deleteObject");
  }

  async verifyObjectHash(): Promise<boolean> {
    return this.unavailable("verifyObjectHash");
  }

  buildPointer(key: string) {
    return `gcs://${this.config.bucket}/${normalizeStorageKey(key)}`;
  }

  private unavailable(operation: string): never {
    throw new Error(`GCS_LIVE_ADAPTER_NOT_AVAILABLE_PHASE_1:${operation}`);
  }
}

export function createFileStorageService(): FileStorageService {
  return createConfiguredFileStorageService();
}

export function createConfiguredFileStorageService(env: NodeJS.ProcessEnv = process.env): FileStorageService {
  const provider = resolveFileStorageProvider(env);
  if (provider === "local_repository") return new LocalRepositoryStorageAdapter();
  if (provider === "s3_compatible") return new S3CompatibleStorageAdapter(resolveS3CompatibleStorageConfig(env));
  return new GoogleCloudStorageDisabledAdapter(resolveGoogleCloudStorageDisabledConfig(env));
}

export function createFileStorageServiceForPointer(
  pointer: Pick<StoredFileStoragePointer, "provider" | "bucket">,
  env: NodeJS.ProcessEnv = process.env
): FileStorageService {
  if (pointer.provider === "local_repository") return new LocalRepositoryStorageAdapter();
  if (pointer.provider === "supabase_storage") {
    return new RetiredSupabaseStorageAdapter(pointer.bucket?.trim() || null);
  }
  if (pointer.provider === "google_cloud_storage") {
    const config = resolveGoogleCloudStorageDisabledConfig(env);
    return new GoogleCloudStorageDisabledAdapter({
      ...config,
      bucket: pointer.bucket?.trim() || config.bucket
    });
  }
  const config = resolveS3CompatibleStorageConfig(env);
  return new S3CompatibleStorageAdapter({
    ...config,
    bucket: pointer.bucket?.trim() || config.bucket
  });
}

export function createReleasePackageStorageService(env: NodeJS.ProcessEnv = process.env): FileStorageService {
  const provider = resolveFileStorageProvider(env);
  if (provider === "local_repository") return new LocalRepositoryStorageAdapter(getReleasePackageRoot());
  if (provider === "google_cloud_storage") {
    const config = resolveGoogleCloudStorageDisabledConfig(env);
    return new GoogleCloudStorageDisabledAdapter({
      ...config,
      bucket: env.PDM_GCS_RELEASE_PACKAGE_BUCKET?.trim() || env.PDM_GCS_BUCKET?.trim() || config.bucket
    });
  }
  const config = resolveS3CompatibleStorageConfig(env);
  return new S3CompatibleStorageAdapter({
    ...config,
    bucket: env.PDM_S3_COMPATIBLE_RELEASE_PACKAGE_BUCKET?.trim() || env.PDM_S3_COMPATIBLE_BUCKET?.trim() || config.bucket
  });
}

export function getReleasePackageRoot() {
  const configured = process.env.PDM_DATA_DIR?.trim();
  const dataDir = configured
    ? path.isAbsolute(configured)
      ? configured
      : path.join(/*turbopackIgnore: true*/ process.cwd(), configured)
    : path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  return path.join(/*turbopackIgnore: true*/ dataDir, "release-packages");
}

export function buildStorageKey(parts: string[]) {
  return parts.map((part) => sanitizeStorageKeyPart(part)).filter(Boolean).join("/");
}

export function storageKeyFromLocalPath(localPath: string, repositoryDir = getRepositoryDir()) {
  const repositoryRoot = path.resolve(/*turbopackIgnore: true*/ repositoryDir);
  const resolvedPath = path.resolve(/*turbopackIgnore: true*/ localPath);
  if (!resolvedPath.startsWith(repositoryRoot + path.sep)) {
    throw new Error("Stored file path is outside repository root");
  }
  return path.relative(repositoryRoot, resolvedPath).split(path.sep).join("/");
}

export function storagePointerFromStoredObject(stored: StoredObject): StoredFileStoragePointer {
  return {
    provider: stored.provider,
    bucket: stored.bucket ?? null,
    key: normalizeStorageKey(stored.key),
    legacyLocalPath: stored.localPath
  };
}

export function storagePointerFromRecord(
  input: {
    storage_provider?: string | null;
    storage_bucket?: string | null;
    storage_key?: string | null;
    local_path?: string | null;
    original_path?: string | null;
  },
  repositoryDir = getRepositoryDir()
): StoredFileStoragePointer {
  const explicitKey = input.storage_key?.trim();
  const provider = resolveStoredProvider(input.storage_provider, input.local_path ?? input.original_path ?? null);
  if (explicitKey) {
    return {
      provider,
      bucket: input.storage_bucket?.trim() || null,
      key: normalizeStorageKey(explicitKey),
      legacyLocalPath: input.local_path ?? input.original_path ?? null
    };
  }

  const pathOrPointer = input.local_path ?? input.original_path ?? "";
  const parsedPointer = parseStoragePointer(pathOrPointer);
  if (parsedPointer) return parsedPointer;

  return {
    provider: "local_repository",
    bucket: null,
    key: storageKeyFromLocalPath(pathOrPointer, repositoryDir),
    legacyLocalPath: pathOrPointer
  };
}

export function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function resolveFileStorageProvider(env: NodeJS.ProcessEnv = process.env): FileStorageProvider {
  const provider = env.PDM_STORAGE_PROVIDER?.trim() || "local_repository";
  if (provider === "supabase_storage") throw new Error("SUPABASE_STORAGE_RETIRED_USE_GCS:configured_provider");
  if (provider === "local_repository" || provider === "s3_compatible" || provider === "google_cloud_storage") return provider;
  throw new Error(`Unsupported file storage provider: ${provider}`);
}

export function resolveS3CompatibleStorageConfig(env: NodeJS.ProcessEnv = process.env): S3CompatibleStorageConfig {
  if (env.NEXT_PUBLIC_S3_COMPATIBLE_SECRET_ACCESS_KEY?.trim() || env.NEXT_PUBLIC_S3_COMPATIBLE_ACCESS_KEY_ID?.trim()) {
    throw new Error("S3-compatible credentials must never be exposed through NEXT_PUBLIC_* variables");
  }
  const endpoint = env.PDM_S3_COMPATIBLE_ENDPOINT?.trim();
  const accessKeyId = env.PDM_S3_COMPATIBLE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.PDM_S3_COMPATIBLE_SECRET_ACCESS_KEY?.trim();
  const bucket = env.PDM_S3_COMPATIBLE_BUCKET?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("S3-compatible Storage requires PDM_S3_COMPATIBLE_ENDPOINT, PDM_S3_COMPATIBLE_ACCESS_KEY_ID, PDM_S3_COMPATIBLE_SECRET_ACCESS_KEY, and PDM_S3_COMPATIBLE_BUCKET");
  }
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    region: env.PDM_S3_COMPATIBLE_REGION?.trim() || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    liveEnabled: env.PDM_S3_COMPATIBLE_LIVE_ENABLED === "1",
    forcePathStyle: env.PDM_S3_COMPATIBLE_FORCE_PATH_STYLE !== "0",
    providerProfile: resolveS3CompatibleProviderProfile(env.PDM_S3_COMPATIBLE_PROVIDER_PROFILE)
  };
}

export function resolveGoogleCloudStorageDisabledConfig(env: NodeJS.ProcessEnv = process.env): GoogleCloudStorageDisabledConfig {
  if (env.NEXT_PUBLIC_GCS_BUCKET?.trim() || env.NEXT_PUBLIC_GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Error("GCS server configuration must never be exposed through NEXT_PUBLIC_* variables");
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Error("GCS service-account key files are forbidden; use the Cloud Run service identity in Phase 3B");
  }
  const projectId = env.PDM_GCS_PROJECT_ID?.trim();
  const bucket = env.PDM_GCS_BUCKET?.trim();
  if (!projectId || !bucket) throw new Error("GCS pointer configuration requires PDM_GCS_PROJECT_ID and PDM_GCS_BUCKET");
  return { projectId, bucket };
}

function resolveS3CompatibleProviderProfile(value: string | undefined): S3CompatibleStorageConfig["providerProfile"] {
  const profile = value?.trim() || "custom";
  if (profile === "cloudflare_r2" || profile === "aws_s3" || profile === "backblaze_b2" || profile === "wasabi" || profile === "nas_gateway" || profile === "custom") {
    return profile;
  }
  throw new Error(`Unsupported S3-compatible provider profile: ${profile}`);
}

function normalizeStorageKey(key: string) {
  const normalized = key.replaceAll("\\", "/").split("/").filter(Boolean).join("/");
  if (!normalized || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("Invalid storage object key");
  }
  return normalized;
}

function resolveStoredProvider(value: string | null | undefined, pathOrPointer: string | null): FileStorageProvider {
  const provider = value?.trim();
  if (provider === "j_drive" || provider === "local" || provider === "local_repository") return "local_repository";
  if (provider === "supabase_storage" || provider === "s3_compatible" || provider === "google_cloud_storage") return provider;
  if (pathOrPointer?.startsWith("supabase://")) return "supabase_storage";
  if (pathOrPointer?.startsWith("s3-compatible://")) return "s3_compatible";
  if (pathOrPointer?.startsWith("gcs://")) return "google_cloud_storage";
  if (!provider) return "local_repository";
  throw new Error(`Unsupported stored file provider: ${provider}`);
}

function parseStoragePointer(pointer: string): StoredFileStoragePointer | null {
  if (pointer.startsWith("supabase://")) {
    const parsed = parseProviderPointer(pointer, "supabase://");
    return { provider: "supabase_storage", bucket: parsed.bucket, key: parsed.key, legacyLocalPath: pointer };
  }
  if (pointer.startsWith("s3-compatible://")) {
    const parsed = parseProviderPointer(pointer, "s3-compatible://");
    return { provider: "s3_compatible", bucket: parsed.bucket, key: parsed.key, legacyLocalPath: pointer };
  }
  if (pointer.startsWith("gcs://")) {
    const parsed = parseProviderPointer(pointer, "gcs://");
    return { provider: "google_cloud_storage", bucket: parsed.bucket, key: parsed.key, legacyLocalPath: pointer };
  }
  return null;
}

function parseProviderPointer(pointer: string, prefix: string) {
  const rest = pointer.slice(prefix.length);
  const separatorIndex = rest.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === rest.length - 1) {
    throw new Error("Invalid storage provider pointer");
  }
  return {
    bucket: rest.slice(0, separatorIndex),
    key: normalizeStorageKey(rest.slice(separatorIndex + 1))
  };
}

function sanitizeStorageKeyPart(part: string) {
  return part.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
}

async function listLocalRepositoryFiles(repositoryRoot: string) {
  try {
    const entries = await fs.readdir(repositoryRoot, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = path.join(/*turbopackIgnore: true*/ repositoryRoot, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listLocalRepositoryFiles(entryPath)));
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
    return files.sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }
}

function getRepositoryDir() {
  const configured = process.env.PDM_REPOSITORY_DIR?.trim();
  if (!configured) return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "repository");
  return path.isAbsolute(configured) ? configured : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}
