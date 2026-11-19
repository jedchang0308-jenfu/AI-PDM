import crypto from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { assemblyCrc32, extractAssemblyArchiveEntry, normalizeAssemblyEntryPath, validateAssemblyArchive, type AssemblyArchiveSource } from "@/lib/assembly-archive";

type Entry = { name: string; bytes?: Buffer; method?: number; flags?: number; attrs?: number; descriptor?: boolean; extra?: Buffer };
/** Synthetic ZIP32 fixture with independent local records, central records and EOCD. */
function zip(inputs: Entry[]) {
  const locals: Buffer[] = [], centrals: Buffer[] = []; let offset = 0;
  for (const input of inputs) {
    const name = Buffer.from(input.name), bytes = input.bytes ?? Buffer.from("synthetic CAD"), method = input.method ?? 8;
    const compressed = method === 8 ? deflateRawSync(bytes) : bytes, crc = assemblyCrc32(bytes), flags = (input.flags ?? 0x800) | (input.descriptor ? 8 : 0), extra = input.extra ?? Buffer.alloc(0);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    if (!input.descriptor) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(bytes.length, 22); }
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(extra.length, 28);
    const descriptor = input.descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (input.descriptor) { descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4); descriptor.writeUInt32LE(compressed.length, 8); descriptor.writeUInt32LE(bytes.length, 12); }
    locals.push(local, name, extra, compressed, descriptor);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(extra.length, 30); central.writeUInt32LE(input.attrs ?? (input.name.endsWith("/") ? 16 : 0), 38); central.writeUInt32LE(offset, 42);
    centrals.push(central, name, extra); offset += local.length + name.length + extra.length + compressed.length + descriptor.length;
  }
  const central = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(inputs.length, 8); end.writeUInt16LE(inputs.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
function source(bytes: Buffer): AssemblyArchiveSource {
  return { byteSize: bytes.length, readRange: async (start, end) => bytes.subarray(start, end), stream: async function* (start = 0, end = bytes.length) { for (let pos = start; pos < end; pos += 7) yield bytes.subarray(pos, Math.min(pos + 7, end)); } };
}
describe("assembly ZIP receipt validation", () => {
  it("hashes original ZIP and every stored/deflated entry, retains nested paths and extracts the exact main", async () => {
    const main = Buffer.from("主組立 original CAD bytes"), bytes = zip([{ name: "組立/主件.SLDASM", bytes: main, descriptor: true }, { name: "組立/子件.SLDPRT", method: 0 }]);
    const manifest = await validateAssemblyArchive(source(bytes));
    expect(manifest.sha256).toBe(crypto.createHash("sha256").update(bytes).digest("hex"));
    expect(manifest.assemblyEntryKeys).toHaveLength(1); expect(manifest.entries[0].relativePath).toBe("組立/主件.SLDASM");
    expect(await extractAssemblyArchiveEntry(source(bytes), manifest, manifest.assemblyEntryKeys[0], 100)).toEqual(main);
    await expect(extractAssemblyArchiveEntry(source(bytes), manifest, manifest.assemblyEntryKeys[0], 1)).rejects.toThrow("ASSEMBLY_ZIP_LIMIT");
    const wrong = structuredClone(manifest); wrong.entries[0].sha256 = "0".repeat(64);
    await expect(extractAssemblyArchiveEntry(source(bytes), wrong, wrong.assemblyEntryKeys[0], 100)).rejects.toThrow("ASSEMBLY_ENTRY_HASH_MISMATCH");
  });
  it.each(["../main.SLDASM", "C:/main.SLDASM", "/main.SLDASM", "\\\\server\\main.SLDASM", "dir/../main.SLDASM", "a//main.SLDASM", "aux.SLDASM", "dir./main.SLDASM", "COM¹.SLDASM", "main.SLDASM:payload", "main?.SLDASM", "a\u0000.SLDASM"]) ("rejects unsafe Windows path %s", async name => {
    await expect(validateAssemblyArchive(source(zip([{ name }])))).rejects.toThrow("ASSEMBLY_ZIP_UNSAFE_PATH");
  });
  it.each([["A.SLDASM", "a.sldasm"], ["a\\main.SLDASM", "a/main.SLDASM"], ["é.SLDASM", "e\u0301.SLDASM"], ["a.SLDASM", "a.SLDASM/part.SLDPRT"]])("rejects normalized aliases and file/directory collisions %s", async (first, second) => {
    await expect(validateAssemblyArchive(source(zip([{ name: first }, { name: second }])))).rejects.toThrow("ASSEMBLY_ZIP_DUPLICATE_PATH");
  });
  it("normalizes Windows separators without losing hierarchy", () => expect(normalizeAssemblyEntryPath("a\\b.SLDASM")).toEqual({ relativePath: "a/b.SLDASM", windowsKey: "A/B.SLDASM", directory: false }));
  it("accepts empty directory entries", async () => expect((await validateAssemblyArchive(source(zip([{ name: "dir/", bytes: Buffer.alloc(0) }, { name: "dir/main.SLDASM" }])))).entries[0].directory).toBe(true));
  it.each([{ flags: 0x801 }, { method: 99 }, { attrs: (0xa000 << 16) >>> 0 }, { attrs: 0x400 }, { extra: Buffer.from([1, 0, 0, 0]) }])("rejects encryption, unsupported methods, links and ZIP64 %j", async extra => {
    await expect(validateAssemblyArchive(source(zip([{ name: "main.SLDASM", ...extra }])))).rejects.toThrow();
  });
  it("rejects CRC corruption and local/central disagreement", async () => {
    const bytes = zip([{ name: "main.SLDASM", method: 0 }]); bytes[30 + Buffer.byteLength("main.SLDASM")] ^= 1;
    await expect(validateAssemblyArchive(source(bytes))).rejects.toThrow("ASSEMBLY_ZIP_CRC_MISMATCH");
    const mismatched = zip([{ name: "main.SLDASM" }]); mismatched[30] ^= 1;
    await expect(validateAssemblyArchive(source(mismatched))).rejects.toThrow("ASSEMBLY_ZIP_INVALID");
  });
  it("rejects missing assemblies, truncation and appended bytes", async () => {
    await expect(validateAssemblyArchive(source(zip([{ name: "part.SLDPRT" }])))).rejects.toThrow("ASSEMBLY_ZIP_NO_ASSEMBLY");
    const bytes = zip([{ name: "main.SLDASM" }]);
    await expect(validateAssemblyArchive(source(bytes.subarray(0, -1)))).rejects.toThrow();
    await expect(validateAssemblyArchive(source(Buffer.concat([bytes, Buffer.from("junk")])))).rejects.toThrow();
  });
  it("checks compressed, expanded, entry and time budgets", async () => {
    const bytes = zip([{ name: "main.SLDASM", bytes: Buffer.alloc(10000) }]);
    for (const limits of [{ maxArchiveBytes: 10 }, { maxExpandedBytes: 10 }, { maxEntries: 0 }, { validationBudgetMs: -1 }]) await expect(validateAssemblyArchive(source(bytes), limits)).rejects.toThrow();
    // A dishonest declared size cannot bypass actual inflate bounds.
    const lying = Buffer.from(bytes), central = lying.readUInt32LE(lying.length - 6); lying.writeUInt32LE(1, 22); lying.writeUInt32LE(1, central + 24);
    await expect(validateAssemblyArchive(source(lying))).rejects.toThrow("ASSEMBLY_ZIP_LIMIT");
  });
  it("rejects overlapping or unreferenced local records", async () => {
    const bytes = zip([{ name: "main.SLDASM" }, { name: "part.SLDPRT" }]);
    const central = bytes.readUInt32LE(bytes.length - 6), second = central + 46 + Buffer.byteLength("main.SLDASM"); bytes.writeUInt32LE(0, second + 42);
    await expect(validateAssemblyArchive(source(bytes))).rejects.toThrow("ASSEMBLY_ZIP_INVALID");
  });
  it("bounds stalled provider range reads by the overall validation budget", async () => {
    const stalled: AssemblyArchiveSource = { byteSize: 100, readRange: () => new Promise(() => {}), stream: async function* () {} };
    await expect(validateAssemblyArchive(stalled, { validationBudgetMs: 5 })).rejects.toThrow("ASSEMBLY_ZIP_TIMEOUT");
  });
  it("maps broken deflate data to a rejected ZIP instead of accepting a declared size", async () => {
    const bytes = zip([{ name: "main.SLDASM" }]); bytes.fill(0xff, 30 + Buffer.byteLength("main.SLDASM"), bytes.readUInt32LE(bytes.length - 6));
    await expect(validateAssemblyArchive(source(bytes))).rejects.toThrow("ASSEMBLY_ZIP_INVALID");
  });
});
