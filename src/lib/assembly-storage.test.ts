import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSEMBLY_PACKAGE_LIMITS } from "@/lib/assembly-archive";
import { GoogleCloudAssemblyStorageAdapter, LocalAssemblyStorageAdapter, type AssemblyStoredObject } from "@/lib/assembly-storage";
const temporary: string[] = [];
afterEach(async () => { for (const root of temporary.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "aipdm-dev129-storage-")); temporary.push(root); return { root, adapter: new LocalAssemblyStorageAdapter(root) }; }
async function all(stream: AsyncIterable<Uint8Array>) { const chunks: Buffer[] = []; for await (const bytes of stream) chunks.push(Buffer.from(bytes)); return Buffer.concat(chunks); }

describe("isolated local resumable immutable storage", () => {
  it("resumes after adapter restart, rejects stale offsets, and reads exact immutable bytes", async () => {
    const { root, adapter } = await fixture(), bytes = Buffer.alloc(256 * 1024 + 32, 7), session = await adapter.startUpload({ key: "assembly/company/package/source.zip", byteSize: bytes.length });
    expect(await adapter.getUploadStatus(session)).toEqual({ nextOffset: 0 });
    expect(await adapter.putChunk(session, 0, bytes.subarray(0, 256 * 1024))).toEqual({ nextOffset: 256 * 1024 });
    const restarted = new LocalAssemblyStorageAdapter(root);
    expect(await restarted.putChunk(session, 0, bytes.subarray(0, 256 * 1024))).toEqual({ nextOffset: 256 * 1024 });
    const finished = await restarted.putChunk(session, 256 * 1024, bytes.subarray(256 * 1024));
    expect(finished.nextOffset).toBe(bytes.length); expect(finished.object?.generation).toBeTruthy();
    expect(await restarted.getUploadStatus(session)).toEqual(finished);
    const source = await restarted.openObject(finished.object!);
    expect(await source.readRange(3, 29)).toEqual(bytes.subarray(3, 29)); expect(await all(source.stream())).toEqual(bytes);
    expect(await all(source.stream(10, 10))).toEqual(Buffer.alloc(0));
    await expect(source.readRange(-1, 10)).rejects.toThrow("ASSEMBLY_RANGE_INVALID");
    await fs.writeFile(path.join(root, session.key), Buffer.from("changed"));
    await expect(source.readRange(0, 1)).rejects.toThrow("ASSEMBLY_OBJECT_CHANGED");
  });
  it("never overwrites an existing key and rejects tampered sessions", async () => {
    const { adapter } = await fixture(), bytes = Buffer.alloc(32), first = await adapter.startUpload({ key: "assembly/source.zip", byteSize: bytes.length });
    const object = (await adapter.putChunk(first, 0, bytes)).object!;
    const second = await adapter.startUpload({ key: first.key, byteSize: bytes.length });
    await expect(adapter.putChunk(second, 0, Buffer.alloc(32, 1))).rejects.toThrow("ASSEMBLY_IMMUTABLE_CONFLICT");
    expect(await all((await adapter.openObject(object)).stream())).toEqual(bytes);
    await expect(adapter.getUploadStatus({ ...first, key: "other.zip" })).rejects.toThrow("ASSEMBLY_SESSION_INVALID");
  });
  it("rejects traversal, invalid chunks and symlink parents", async () => {
    const { adapter, root } = await fixture();
    await expect(adapter.startUpload({ key: "../outside.zip", byteSize: 32 })).rejects.toThrow("ASSEMBLY_STORAGE_KEY_INVALID");
    const session = await adapter.startUpload({ key: "assembly/source.zip", byteSize: ASSEMBLY_PACKAGE_LIMITS.chunkBytes + 1 });
    await expect(adapter.putChunk(session, 0, Buffer.alloc(1))).rejects.toThrow("ASSEMBLY_CHUNK_INVALID");
    await expect(adapter.putChunk(session, 0, Buffer.alloc(ASSEMBLY_PACKAGE_LIMITS.chunkBytes + 1))).rejects.toThrow("ASSEMBLY_CHUNK_INVALID");
    const linked = await adapter.startUpload({ key: "link/source.zip", byteSize: 32 });
    await fs.mkdir(path.join(root, "link"));
    const original = fs.lstat.bind(fs);
    // Windows sandbox cannot create junctions (EPERM); exercise the OS lstat boundary explicitly.
    const spy = vi.spyOn(fs, "lstat").mockImplementation((async (...args: Parameters<typeof fs.lstat>) => {
      const stat = await original(...args); if (String(args[0]) === path.join(root, "link")) stat.isSymbolicLink = () => true; return stat;
    }) as typeof fs.lstat);
    try { await expect(adapter.putChunk(linked, 0, Buffer.alloc(32))).rejects.toThrow("ASSEMBLY_STORAGE_SYMLINK"); }
    finally { spy.mockRestore(); }
  });
});

function gcsFixture() {
  const config = { projectId: "test-project", bucket: "test-assembly-bucket" }, key = "assembly/company/package/source.zip";
  let received = Buffer.alloc(0), uploadId = "", unknown = false, expired = false, badRange = false;
  const metadata = () => ({ name: key, bucket: config.bucket, generation: "123", size: String(received.length), metadata: { assemblyUploadId: uploadId } });
  const request = vi.fn(async (target: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(target)); expect(url.origin).toBe("https://storage.googleapis.com"); expect(init?.redirect).toBe("error");
    const headers = new Headers(init?.headers);
    if (init?.method === "POST") { expect(url.searchParams.get("ifGenerationMatch")).toBe("0"); uploadId = JSON.parse(String(init.body)).metadata.assemblyUploadId; return new Response(null, { status: 200, headers: { Location: `https://storage.googleapis.com/upload/storage/v1/b/${config.bucket}/o?uploadType=resumable&upload_id=synthetic-only` } }); }
    if (init?.method === "PUT") {
      if (expired) return new Response(null, { status: 410 });
      const contentRange = headers.get("content-range")!;
      if (!contentRange.startsWith("bytes */")) {
        const bytes = Buffer.from(await new Response(init.body).arrayBuffer());
        expect(Number(/^bytes (\d+)-/u.exec(contentRange)![1])).toBe(received.length); received = Buffer.concat([received, bytes]);
        if (unknown) { unknown = false; throw new Error("SIMULATED_UNKNOWN_OUTCOME"); }
      }
      const total = Number(contentRange.split("/")[1]);
      return received.length === total ? Response.json(metadata()) : new Response(null, { status: 308, headers: received.length ? { Range: `bytes=0-${received.length - 1}` } : {} });
    }
    if (url.searchParams.get("alt") === "media") {
      expect(url.searchParams.get("generation")).toBe("123");
      const range = /^bytes=(\d+)-(\d+)$/u.exec(headers.get("range")!)!, start = Number(range[1]), end = Number(range[2]);
      return new Response(new Uint8Array(received.subarray(start, end + 1)), { status: 206, headers: { "Content-Range": badRange ? "bytes 0-0/1" : `bytes ${start}-${end}/${received.length}` } });
    }
    return Response.json(metadata());
  });
  return { key, config, request, adapter: new GoogleCloudAssemblyStorageAdapter(config, { request: request as typeof fetch, accessToken: async () => "synthetic" }), setUnknown: () => { unknown = true; }, expire: () => { expired = true; }, badRange: () => { badRange = true; } };
}
describe("GCS resumable protocol with synthetic transport", () => {
  it("keeps sessions server-side, reads provider offset after unknown outcomes and pins every read generation", async () => {
    const f = gcsFixture(), bytes = Buffer.alloc(256 * 1024 + 32, 9), session = await f.adapter.startUpload({ key: f.key, byteSize: bytes.length });
    f.setUnknown(); await expect(f.adapter.putChunk(session, 0, bytes.subarray(0, 256 * 1024))).rejects.toThrow("SIMULATED_UNKNOWN_OUTCOME");
    expect(await f.adapter.getUploadStatus(session)).toEqual({ nextOffset: 256 * 1024 });
    expect(await f.adapter.putChunk(session, 0, bytes.subarray(0, 256 * 1024))).toEqual({ nextOffset: 256 * 1024 });
    const finished = await f.adapter.putChunk(session, 256 * 1024, bytes.subarray(256 * 1024));
    expect(finished.object).toMatchObject({ generation: "123", bucket: f.config.bucket });
    f.expire(); expect(await f.adapter.getUploadStatus(session)).toEqual(finished);
    const source = await f.adapter.openObject(finished.object!); expect(await source.readRange(5, 32)).toEqual(bytes.subarray(5, 32)); expect(await all(source.stream())).toEqual(bytes);
    f.badRange(); await expect(source.readRange(0, 10)).rejects.toThrow("ASSEMBLY_RANGE_READBACK_MISMATCH");
  });
  it("rejects session SSRF and generation/bucket drift before returning bytes", async () => {
    const f = gcsFixture(), session = await f.adapter.startUpload({ key: f.key, byteSize: 32 }); const before = f.request.mock.calls.length;
    await expect(f.adapter.getUploadStatus({ ...session, sessionUri: "https://example.invalid/private-token" })).rejects.toThrow("ASSEMBLY_SESSION_INVALID"); expect(f.request.mock.calls.length).toBe(before);
    const finished = await f.adapter.putChunk(session, 0, Buffer.alloc(32));
    await expect(f.adapter.openObject({ ...finished.object!, generation: "124" })).rejects.toThrow("ASSEMBLY_OBJECT_READBACK_MISMATCH");
    await expect(f.adapter.openObject({ ...finished.object!, bucket: "sibling-bucket" } as AssemblyStoredObject)).rejects.toThrow("ASSEMBLY_OBJECT_INVALID");
    f.expire(); await expect(f.adapter.getUploadStatus({ ...session, uploadId: "other" })).rejects.toThrow("ASSEMBLY_OBJECT_READBACK_MISMATCH");
  });
});
