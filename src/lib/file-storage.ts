import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type FileStorageProvider = "local_repository" | "supabase_storage" | "s3_compatible";

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

export type SupabaseStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  liveEnabled: boolean;
  signedUrlTtlSeconds: number;
  signedUrlMaxTtlSeconds: number;
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

export class SupabaseStorageAdapter implements FileStorageService {
  readonly provider = "supabase_storage" as const;

  constructor(private readonly config: SupabaseStorageConfig) {}

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    this.assertLiveEnabled("putObject");
    const key = normalizeStorageKey(input.key);
    const response = await this.request(`object/${this.config.bucket}/${encodeStorageKey(key)}`, {
      method: "POST",
      headers: {
        "cache-control": input.cacheControl ?? "3600",
        "content-type": input.contentType ?? "application/octet-stream",
        "x-upsert": "false"
      },
      body: new Uint8Array(input.bytes)
    });
    if (!response.ok) await throwSupabaseStorageError("putObject", response);
    return {
      provider: this.provider,
      key,
      bucket: this.config.bucket,
      localPath: this.toPointer(key),
      bytes: input.bytes.byteLength,
      sha256: sha256(input.bytes)
    };
  }

  async getObjectMetadata(key: string): Promise<StorageObjectMetadata | null> {
    this.assertLiveEnabled("getObjectMetadata");
    const normalizedKey = normalizeStorageKey(key);
    const response = await this.request(`object/authenticated/${this.config.bucket}/${encodeStorageKey(normalizedKey)}`, {
      method: "HEAD"
    });
    if (response.status === 404) return null;
    if (!response.ok) await throwSupabaseStorageError("getObjectMetadata", response);
    return {
      provider: this.provider,
      key: normalizedKey,
      bucket: this.config.bucket,
      localPath: this.toPointer(normalizedKey),
      bytes: Number(response.headers.get("content-length") ?? 0)
    };
  }

  async readObject(key: string): Promise<Buffer> {
    this.assertLiveEnabled("readObject");
    const normalizedKey = normalizeStorageKey(key);
    const response = await this.request(`object/authenticated/${this.config.bucket}/${encodeStorageKey(normalizedKey)}`, {
      method: "GET"
    });
    if (!response.ok) await throwSupabaseStorageError("readObject", response);
    return Buffer.from(await response.arrayBuffer());
  }

  async createDownloadUrl(input: CreateDownloadUrlInput): Promise<DownloadUrl> {
    this.assertLiveEnabled("createDownloadUrl");
    const key = normalizeStorageKey(input.key);
    const expiresInSeconds = resolveDownloadUrlTtlSeconds(input.expiresInSeconds, this.config);
    const response = await this.request(`object/sign/${this.config.bucket}/${encodeStorageKey(key)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        expiresIn: expiresInSeconds,
        ...(input.forceDownload ? { download: input.filename ?? true } : {})
      })
    });
    if (!response.ok) await throwSupabaseStorageError("createDownloadUrl", response);
    const payload = (await response.json()) as { signedURL?: string; signedUrl?: string };
    const signedUrl = payload.signedUrl ?? payload.signedURL;
    if (!signedUrl) throw new Error("Supabase Storage createDownloadUrl response did not include a signed URL");
    return {
      provider: this.provider,
      key,
      bucket: this.config.bucket,
      mode: "signed_url",
      url: absoluteSupabaseStorageUrl(this.config.url, signedUrl),
      expiresInSeconds,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      auditRequired: true,
      authorizationHeaderRequired: false
    };
  }

  async deleteObject(): Promise<void> {
    throw new Error("Supabase Storage delete is disabled until lifecycle and rollback gates are implemented");
  }

  async verifyObjectHash(key: string, expectedSha256: string): Promise<boolean> {
    const bytes = await this.readObject(key);
    return sha256(bytes) === expectedSha256.toLowerCase();
  }

  private request(pathname: string, init: RequestInit) {
    return fetch(`${this.config.url}/storage/v1/${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        apikey: this.config.serviceRoleKey,
        ...init.headers
      }
    });
  }

  private assertLiveEnabled(operation: string) {
    if (!this.config.liveEnabled) {
      throw new Error(`Supabase Storage ${operation} is disabled; set PDM_SUPABASE_STORAGE_LIVE_ENABLED=1 after staging QC`);
    }
  }

  private toPointer(key: string) {
    return `supabase://${this.config.bucket}/${key}`;
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

export function createFileStorageService(): FileStorageService {
  return new LocalRepositoryStorageAdapter();
}

export function createConfiguredFileStorageService(env: NodeJS.ProcessEnv = process.env): FileStorageService {
  const provider = resolveFileStorageProvider(env);
  if (provider === "local_repository") return new LocalRepositoryStorageAdapter();
  if (provider === "supabase_storage") return new SupabaseStorageAdapter(resolveSupabaseStorageConfig(env));
  return new S3CompatibleStorageAdapter(resolveS3CompatibleStorageConfig(env));
}

export function createReleasePackageStorageService(): FileStorageService {
  return new LocalRepositoryStorageAdapter(getReleasePackageRoot());
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

export function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function resolveFileStorageProvider(env: NodeJS.ProcessEnv = process.env): FileStorageProvider {
  const provider = env.PDM_STORAGE_PROVIDER?.trim() || "local_repository";
  if (provider === "local_repository" || provider === "supabase_storage" || provider === "s3_compatible") return provider;
  throw new Error(`Unsupported file storage provider: ${provider}`);
}

export function resolveSupabaseStorageConfig(env: NodeJS.ProcessEnv = process.env): SupabaseStorageConfig {
  if (env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Supabase service role key must never be exposed through NEXT_PUBLIC_* variables");
  }
  const url = env.PDM_SUPABASE_URL?.trim();
  const serviceRoleKey = env.PDM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase Storage requires PDM_SUPABASE_URL and PDM_SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    url: url.replace(/\/+$/, ""),
    serviceRoleKey,
    bucket: env.PDM_SUPABASE_STORAGE_BUCKET?.trim() || "pdm-hot",
    liveEnabled: env.PDM_SUPABASE_STORAGE_LIVE_ENABLED === "1",
    signedUrlTtlSeconds: readPositiveIntEnv(env.PDM_SUPABASE_SIGNED_URL_TTL_SECONDS, 300),
    signedUrlMaxTtlSeconds: readPositiveIntEnv(env.PDM_SUPABASE_SIGNED_URL_MAX_TTL_SECONDS, 3600)
  };
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

function sanitizeStorageKeyPart(part: string) {
  return part.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
}

function encodeStorageKey(key: string) {
  return normalizeStorageKey(key).split("/").map(encodeURIComponent).join("/");
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

function resolveDownloadUrlTtlSeconds(requestedSeconds: number | undefined, config: SupabaseStorageConfig) {
  const ttl = requestedSeconds && Number.isFinite(requestedSeconds) ? Math.floor(requestedSeconds) : config.signedUrlTtlSeconds;
  return Math.max(1, Math.min(ttl, config.signedUrlMaxTtlSeconds));
}

function absoluteSupabaseStorageUrl(projectUrl: string, signedUrl: string) {
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
  const pathPrefix = signedUrl.startsWith("/") ? "" : "/";
  return `${projectUrl}/storage/v1${pathPrefix}${signedUrl}`;
}

function readPositiveIntEnv(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRepositoryDir() {
  const configured = process.env.PDM_REPOSITORY_DIR?.trim();
  if (!configured) return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "repository");
  return path.isAbsolute(configured) ? configured : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}

async function throwSupabaseStorageError(operation: string, response: Response): Promise<never> {
  const body = await response.text().catch(() => "");
  throw new Error(`Supabase Storage ${operation} failed with ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`);
}
