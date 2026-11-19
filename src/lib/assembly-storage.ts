import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Compute } from "google-auth-library";
import { ASSEMBLY_PACKAGE_LIMITS, type AssemblyArchiveSource } from "@/lib/assembly-archive";
import { resolveFileStorageProvider, resolveGoogleCloudStorageDisabledConfig } from "@/lib/file-storage";
import type { GcsTransport } from "@/lib/google-cloud-file-storage";

export type AssemblyStorageProvider = "local_repository" | "google_cloud_storage";
/** Server-only durable state. Never include sessionUri in browser projections/logs. */
export type AssemblyUploadSession = { provider: AssemblyStorageProvider; key: string; byteSize: number; uploadId: string; sessionUri?: string };
export type AssemblyStoredObject = { provider: AssemblyStorageProvider; key: string; bucket?: string; generation: string; byteSize: number };
export type AssemblyUploadStatus = { nextOffset: number; object?: AssemblyStoredObject };
export interface AssemblyStorageService {
  startUpload(input: { key: string; byteSize: number }): Promise<AssemblyUploadSession>;
  getUploadStatus(session: AssemblyUploadSession): Promise<AssemblyUploadStatus>;
  /** Caller holds the package's durable upload lease; unknown outcomes require status readback. */
  putChunk(session: AssemblyUploadSession, offset: number, bytes: Buffer): Promise<AssemblyUploadStatus>;
  openObject(object: AssemblyStoredObject): Promise<AssemblyArchiveSource>;
}
function keyOf(key: string) {
  if (!key || key.startsWith(".") || key.startsWith("/") || /[\\\u0000-\u001f\u007f<>:"|?*]/u.test(key) || key.split("/").some(p => !p || p === "." || p === ".." || /[. ]$/u.test(p))) throw new Error("ASSEMBLY_STORAGE_KEY_INVALID");
  return key;
}
function declaration(input: { key: string; byteSize: number }) {
  keyOf(input.key);
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 22 || input.byteSize > ASSEMBLY_PACKAGE_LIMITS.maxArchiveBytes) throw new Error("ASSEMBLY_STORAGE_SIZE_INVALID");
}
function chunk(session: AssemblyUploadSession, offset: number, bytes: Buffer) {
  declaration(session);
  if (!Number.isSafeInteger(offset) || offset < 0 || !bytes.length || bytes.length > ASSEMBLY_PACKAGE_LIMITS.chunkBytes || offset + bytes.length > session.byteSize || (offset + bytes.length < session.byteSize && bytes.length % (256 * 1024) !== 0)) throw new Error("ASSEMBLY_CHUNK_INVALID");
}
function range(object: AssemblyStoredObject, start: number, end: number) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > object.byteSize) throw new Error("ASSEMBLY_RANGE_INVALID");
}
function generationOf(stat: Awaited<ReturnType<typeof fs.stat>>) { return `${stat.dev}-${stat.ino}-${stat.birthtimeMs}-${stat.mtimeMs}-${stat.size}`; }
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";
// Cross-process serialization belongs to the package row's durable lease. This
// additional process guard leaves no stale filesystem lock after process death.
const activeLocalWrites = new Set<string>();

export class LocalAssemblyStorageAdapter implements AssemblyStorageService {
  constructor(private readonly repositoryDir: string) { if (!repositoryDir) throw new Error("ASSEMBLY_REPOSITORY_REQUIRED"); }
  private async resolve(key: string, create = false) {
    keyOf(key);
    const root = path.resolve(/*turbopackIgnore: true*/ this.repositoryDir);
    if (create) await fs.mkdir(root, { recursive: true });
    if ((await fs.lstat(root)).isSymbolicLink()) throw new Error("ASSEMBLY_STORAGE_SYMLINK");
    const parts = key.split("/"); let current = root;
    for (let i = 0; i < parts.length; i++) {
      current = path.join(/*turbopackIgnore: true*/ current, parts[i]);
      try { const stat = await fs.lstat(current); if (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory())) throw new Error("ASSEMBLY_STORAGE_SYMLINK"); }
      catch (error) { if (!missing(error)) throw error; if (create && i < parts.length - 1) { try { await fs.mkdir(current); } catch (mkdirError) { if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") throw mkdirError; } if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("ASSEMBLY_STORAGE_SYMLINK"); } }
    }
    return current;
  }
  private sessionKey(session: AssemblyUploadSession, suffix: string) {
    if (session.provider !== "local_repository" || !/^[a-f0-9-]{36}$/u.test(session.uploadId)) throw new Error("ASSEMBLY_SESSION_INVALID");
    declaration(session); return `assembly-upload-staging/${session.uploadId}/${suffix}`;
  }
  private async verifySession(session: AssemblyUploadSession) {
    const saved = JSON.parse(await fs.readFile(await this.resolve(this.sessionKey(session, "session.json")), "utf8")) as AssemblyUploadSession;
    if (saved.key !== session.key || saved.byteSize !== session.byteSize || saved.uploadId !== session.uploadId || saved.provider !== session.provider) throw new Error("ASSEMBLY_SESSION_INVALID");
  }
  async startUpload(input: { key: string; byteSize: number }): Promise<AssemblyUploadSession> {
    declaration(input);
    const session: AssemblyUploadSession = { ...input, provider: "local_repository", uploadId: crypto.randomUUID() };
    const state = await this.resolve(this.sessionKey(session, "session.json"), true);
    await fs.writeFile(state, JSON.stringify(session), { flag: "wx", mode: 0o600 });
    await fs.writeFile(await this.resolve(this.sessionKey(session, "content.part")), Buffer.alloc(0), { flag: "wx", mode: 0o600 });
    return session;
  }
  private async status(session: AssemblyUploadSession): Promise<AssemblyUploadStatus> {
    const partial = await fs.stat(await this.resolve(this.sessionKey(session, "content.part")));
    if (!partial.isFile() || partial.size > session.byteSize) throw new Error("ASSEMBLY_UPLOAD_CORRUPT");
    if (partial.size < session.byteSize) return { nextOffset: partial.size };
    const target = await this.resolve(session.key, true);
    // Hard linking a finished staging inode is create-only and never replaces an existing key.
    try { await fs.link(await this.resolve(this.sessionKey(session, "content.part")), target); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const stored = await fs.stat(target);
    if (stored.dev !== partial.dev || stored.ino !== partial.ino || stored.size !== session.byteSize) throw new Error("ASSEMBLY_IMMUTABLE_CONFLICT");
    return { nextOffset: stored.size, object: { provider: "local_repository", key: session.key, generation: generationOf(stored), byteSize: stored.size } };
  }
  async getUploadStatus(session: AssemblyUploadSession) { await this.verifySession(session); return this.status(session); }
  async putChunk(session: AssemblyUploadSession, offset: number, bytes: Buffer) {
    chunk(session, offset, bytes); await this.verifySession(session);
    const lockKey = await this.resolve(this.sessionKey(session, "content.part"));
    if (activeLocalWrites.has(lockKey)) throw new Error("ASSEMBLY_UPLOAD_BUSY");
    activeLocalWrites.add(lockKey);
    try {
      const status = await this.status(session);
      if (status.nextOffset !== offset || status.object) return status;
      const file = await fs.open(await this.resolve(this.sessionKey(session, "content.part")), "r+");
      try { let written = 0; while (written < bytes.length) { const result = await file.write(bytes, written, bytes.length - written, offset + written); if (!result.bytesWritten) throw new Error("ASSEMBLY_UPLOAD_WRITE_FAILED"); written += result.bytesWritten; } await file.sync(); }
      finally { await file.close(); }
      return this.status(session);
    } finally { activeLocalWrites.delete(lockKey); }
  }
  async openObject(object: AssemblyStoredObject): Promise<AssemblyArchiveSource> {
    declaration(object); if (object.provider !== "local_repository" || !object.generation) throw new Error("ASSEMBLY_OBJECT_INVALID");
    const target = await this.resolve(object.key);
    const open = async () => {
      // A read-only handle pins the inode for each operation; the generation also detects replacement.
      await this.resolve(object.key);
      const file = await fs.open(target, "r");
      const stat = await file.stat();
      if (!stat.isFile() || generationOf(stat) !== object.generation || stat.size !== object.byteSize) { await file.close(); throw new Error("ASSEMBLY_OBJECT_CHANGED"); }
      return file;
    };
    const probe = await open(); await probe.close();
    return { byteSize: object.byteSize,
      readRange: async (start, end) => { range(object, start, end); if (end - start > ASSEMBLY_PACKAGE_LIMITS.chunkBytes) throw new Error("ASSEMBLY_RANGE_LIMIT"); const file = await open(); try { const result = Buffer.alloc(end - start); let offset = 0; while (offset < result.length) { const { bytesRead } = await file.read(result, offset, result.length - offset, start + offset); if (!bytesRead) throw new Error("ASSEMBLY_OBJECT_TRUNCATED"); offset += bytesRead; } return result; } finally { await file.close(); } },
      stream: async function* (start = 0, end = object.byteSize) { range(object, start, end); const file = await open(); try { if (start === end) return; for await (const value of file.createReadStream({ start, end: end - 1, autoClose: false, highWaterMark: 64 * 1024 })) yield value as Buffer; } finally { await file.close(); } }
    };
  }
}

const credentials = new Compute({ scopes: ["https://www.googleapis.com/auth/devstorage.read_write"] });
const workloadTransport: GcsTransport = { request: (...args) => fetch(...args), accessToken: async () => {
  if (!process.env.K_SERVICE || process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("GCS_WORKLOAD_IDENTITY_REQUIRED");
  const result = await credentials.getAccessToken(); if (!result.token) throw new Error("GCS_WORKLOAD_TOKEN_UNAVAILABLE"); return result.token;
} };
type GcsObject = { name: string; bucket: string; generation: string; size: string; metadata?: { assemblyUploadId?: string } };
export class GoogleCloudAssemblyStorageAdapter implements AssemblyStorageService {
  constructor(private readonly config: { projectId: string; bucket: string }, private readonly transport: GcsTransport = workloadTransport) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u.test(config.projectId) || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/u.test(config.bucket)) throw new Error("GCS_TARGET_INVALID");
  }
  private request = async (url: string, init: RequestInit = {}) => this.transport.request(url, { ...init, redirect: "error", headers: { ...init.headers, Authorization: `Bearer ${await this.transport.accessToken()}` }, signal: init.signal ?? AbortSignal.timeout(60000) });
  private sessionUri(session: AssemblyUploadSession) {
    declaration(session);
    if (session.provider !== "google_cloud_storage" || !session.sessionUri) throw new Error("ASSEMBLY_SESSION_INVALID");
    const url = new URL(session.sessionUri);
    if (url.origin !== "https://storage.googleapis.com" || url.username || url.password || url.hash || url.pathname !== `/upload/storage/v1/b/${this.config.bucket}/o` || url.searchParams.get("uploadType") !== "resumable" || !url.searchParams.get("upload_id")) throw new Error("ASSEMBLY_SESSION_INVALID");
    return url.href;
  }
  private object(value: GcsObject, expected: { key: string; byteSize: number; generation?: string; uploadId?: string }): AssemblyStoredObject {
    if (value.name !== expected.key || value.bucket !== this.config.bucket || !/^[1-9][0-9]*$/u.test(value.generation ?? "") || !/^\d+$/u.test(value.size ?? "") || Number(value.size) !== expected.byteSize || (expected.generation && expected.generation !== value.generation) || (expected.uploadId && value.metadata?.assemblyUploadId !== expected.uploadId)) throw new Error("ASSEMBLY_OBJECT_READBACK_MISMATCH");
    return { provider: "google_cloud_storage", key: expected.key, bucket: this.config.bucket, generation: value.generation, byteSize: expected.byteSize };
  }
  private objectUrl(key: string) { return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.config.bucket)}/o/${encodeURIComponent(keyOf(key))}`; }
  async startUpload(input: { key: string; byteSize: number }): Promise<AssemblyUploadSession> {
    declaration(input);
    const uploadId = crypto.randomUUID(), query = new URLSearchParams({ uploadType: "resumable", name: input.key, ifGenerationMatch: "0" });
    const response = await this.request(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.config.bucket)}/o?${query}`, { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/zip", "X-Upload-Content-Length": String(input.byteSize) }, body: JSON.stringify({ name: input.key, contentType: "application/zip", cacheControl: "private,no-store", metadata: { assemblyUploadId: uploadId } }) });
    if (!response.ok) throw new Error(`ASSEMBLY_UPLOAD_START_FAILED:${response.status}`);
    const session: AssemblyUploadSession = { ...input, provider: "google_cloud_storage", uploadId, sessionUri: response.headers.get("location") ?? undefined };
    this.sessionUri(session); return session;
  }
  private async status(response: Response, session: AssemblyUploadSession): Promise<AssemblyUploadStatus> {
    if (response.status === 200 || response.status === 201) return { nextOffset: session.byteSize, object: this.object(await response.json() as GcsObject, session) };
    if (response.status === 308) {
      const received = response.headers.get("range");
      if (received !== null && !/^bytes=0-\d+$/u.test(received)) throw new Error("ASSEMBLY_UPLOAD_OFFSET_INVALID");
      const nextOffset = received === null ? 0 : Number(received.slice(8)) + 1;
      if (!Number.isSafeInteger(nextOffset) || nextOffset < 0 || nextOffset >= session.byteSize) throw new Error("ASSEMBLY_UPLOAD_OFFSET_INVALID");
      return { nextOffset };
    }
    // Expired completed sessions are recoverable only by immutable object readback.
    if (response.status === 404 || response.status === 410) {
      const readback = await this.request(this.objectUrl(session.key));
      if (readback.ok) return { nextOffset: session.byteSize, object: this.object(await readback.json() as GcsObject, session) };
    }
    throw new Error(`ASSEMBLY_UPLOAD_STATUS_FAILED:${response.status}`);
  }
  async getUploadStatus(session: AssemblyUploadSession) {
    return this.status(await this.request(this.sessionUri(session), { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${session.byteSize}` } }), session);
  }
  async putChunk(session: AssemblyUploadSession, offset: number, bytes: Buffer) {
    chunk(session, offset, bytes);
    const before = await this.getUploadStatus(session); if (before.nextOffset !== offset || before.object) return before;
    const response = await this.request(this.sessionUri(session), { method: "PUT", headers: { "Content-Type": "application/zip", "Content-Length": String(bytes.length), "Content-Range": `bytes ${offset}-${offset + bytes.length - 1}/${session.byteSize}` }, body: new Uint8Array(bytes) });
    return this.status(response, session);
  }
  async openObject(object: AssemblyStoredObject): Promise<AssemblyArchiveSource> {
    declaration(object);
    if (object.provider !== "google_cloud_storage" || object.bucket !== this.config.bucket || !/^[1-9][0-9]*$/u.test(object.generation)) throw new Error("ASSEMBLY_OBJECT_INVALID");
    const metadata = await this.request(`${this.objectUrl(object.key)}?generation=${object.generation}`);
    if (!metadata.ok) throw new Error(`ASSEMBLY_OBJECT_READ_FAILED:${metadata.status}`);
    this.object(await metadata.json() as GcsObject, object);
    const request = this.request, url = `${this.objectUrl(object.key)}?alt=media&generation=${object.generation}`;
    async function* stream(start = 0, end = object.byteSize) {
      range(object, start, end); if (start === end) return;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60_000);
      let body: ReadableStream<Uint8Array> | null = null;
      try {
        const response = await request(url, { headers: { Range: `bytes=${start}-${end - 1}`, "Accept-Encoding": "identity" }, signal: controller.signal }); body = response.body;
        if (response.status !== 206 || response.headers.get("content-range") !== `bytes ${start}-${end - 1}/${object.byteSize}` || !body) throw new Error("ASSEMBLY_RANGE_READBACK_MISMATCH");
        let received = 0; const reader = body.getReader();
        try { for (;;) { const next = await reader.read(); if (next.done) break; received += next.value.length; if (received > end - start) throw new Error("ASSEMBLY_OBJECT_SIZE_MISMATCH"); yield next.value; } }
        finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        if (received !== end - start) throw new Error("ASSEMBLY_OBJECT_SIZE_MISMATCH");
      } finally { clearTimeout(timer); controller.abort(); if (body && !body.locked) await body.cancel().catch(() => {}); }
    }
    return { byteSize: object.byteSize, stream, readRange: async (start, end) => { range(object, start, end); if (end - start > ASSEMBLY_PACKAGE_LIMITS.chunkBytes) throw new Error("ASSEMBLY_RANGE_LIMIT"); const chunks: Buffer[] = []; for await (const value of stream(start, end)) chunks.push(Buffer.from(value)); return Buffer.concat(chunks, end - start); } };
  }
}
export function createAssemblyStorageService(env: NodeJS.ProcessEnv = process.env): AssemblyStorageService {
  const provider = resolveFileStorageProvider(env);
  if (provider === "local_repository") return new LocalAssemblyStorageAdapter(env.PDM_REPOSITORY_DIR?.trim() || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "repository"));
  if (provider !== "google_cloud_storage" || env.PDM_GCS_LIVE_ENABLED !== "1" || !env.K_SERVICE || env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("ASSEMBLY_STORAGE_PROVIDER_UNAVAILABLE");
  return new GoogleCloudAssemblyStorageAdapter(resolveGoogleCloudStorageDisabledConfig(env));
}
