import crypto from "node:crypto";
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";

export type AssemblyPackageLimits = { chunkBytes: number; maxArchiveBytes: number; maxExpandedBytes: number; maxEntries: number; validationBudgetMs: number };
export const ASSEMBLY_PACKAGE_LIMITS = Object.freeze<AssemblyPackageLimits>({ chunkBytes: 8 * 1024 * 1024, maxArchiveBytes: 256 * 1024 * 1024, maxExpandedBytes: 2 * 1024 * 1024 * 1024, maxEntries: 10_000, validationBudgetMs: 180_000 });
export type AssemblyArchiveSource = {
  byteSize: number;
  readRange(start: number, endExclusive: number): Promise<Buffer>;
  stream(start?: number, endExclusive?: number): AsyncIterable<Uint8Array>;
};
export type AssemblyArchiveEntry = { entryKey: string; relativePath: string; windowsKey: string; byteSize: number; sha256: string; crc32: number; method: number; compressedSize: number; dataOffset: number; directory: boolean };
export type AssemblyArchiveManifest = { version: 1; sha256: string; byteSize: number; entries: AssemblyArchiveEntry[]; assemblyEntryKeys: string[] };
export class AssemblyArchiveError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "AssemblyArchiveError"; }
}
function fail(code = "ASSEMBLY_ZIP_INVALID"): never { throw new AssemblyArchiveError(code); }
const crcTable = Array.from({ length: 256 }, (_, n) => { let v = n; for (let i = 0; i < 8; i++) v = (v >>> 1) ^ ((v & 1) ? 0xedb88320 : 0); return v >>> 0; });
export function assemblyCrc32(bytes: Uint8Array, previous = 0): number {
  let crc = (previous ^ 0xffffffff) >>> 0;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
const cp437 = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
function filename(raw: Buffer, flags: number, extra: Buffer) {
  let name: string;
  try { name = flags & 0x800 ? new TextDecoder("utf-8", { fatal: true }).decode(raw) : Array.from(raw, n => n < 128 ? String.fromCharCode(n) : cp437[n - 128]).join(""); }
  catch { return fail(); }
  for (let pos = 0; pos < extra.length;) {
    if (pos + 4 > extra.length) fail();
    const id = extra.readUInt16LE(pos), size = extra.readUInt16LE(pos + 2); pos += 4;
    if (pos + size > extra.length) fail();
    // ZIP64 and Unix link/alternate metadata are deliberately unsupported.
    if ([0x0001, 0x000d, 0x756e].includes(id)) fail("ASSEMBLY_ZIP_UNSUPPORTED");
    if (id === 0x7075) {
      if (size < 5 || extra[pos] !== 1 || extra.readUInt32LE(pos + 1) !== assemblyCrc32(raw)) fail();
      try { const unicode = new TextDecoder("utf-8", { fatal: true }).decode(extra.subarray(pos + 5, pos + size)); if ((flags & 0x800) && unicode !== name) fail(); name = unicode; }
      catch { fail(); }
    }
    pos += size;
  }
  return name;
}
export function normalizeAssemblyEntryPath(input: string) {
  const relativePath = input.replaceAll("\\", "/").normalize("NFC");
  const directory = relativePath.endsWith("/");
  const plain = directory ? relativePath.slice(0, -1) : relativePath;
  if (!plain || plain.length > 1024 || plain.startsWith("/") || /[\u0000-\u001f\u007f<>:"|?*]/u.test(plain)) fail("ASSEMBLY_ZIP_UNSAFE_PATH");
  for (const part of plain.split("/")) {
    if (!part || part === "." || part === ".." || /[. ]$/u.test(part) || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu.test(part) || part.length > 255) fail("ASSEMBLY_ZIP_UNSAFE_PATH");
  }
  return { relativePath, windowsKey: plain.toUpperCase(), directory };
}
async function read(source: AssemblyArchiveSource, start: number, size: number) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0 || start + size > source.byteSize) fail();
  const bytes = await source.readRange(start, start + size);
  if (bytes.length !== size) fail();
  return bytes;
}
async function* bounded(stream: AsyncIterable<Uint8Array>, deadline: number) {
  for await (const value of stream) { if (Date.now() > deadline) fail("ASSEMBLY_ZIP_TIMEOUT"); yield value; }
}
async function digestEntry(source: AssemblyArchiveSource, entry: AssemblyArchiveEntry, deadline: number, maxBytes: number, collect = false) {
  let byteSize = 0, crc = 0, compressed = 0;
  const hash = crypto.createHash("sha256"), chunks: Buffer[] = [];
  async function* input() {
    for await (const value of bounded(source.stream(entry.dataOffset, entry.dataOffset + entry.compressedSize), deadline)) { compressed += value.length; if (compressed > entry.compressedSize) fail(); yield value; }
    if (compressed !== entry.compressedSize) fail();
  }
  const raw = Readable.from(input());
  const output = entry.method === 8 ? raw.pipe(createInflateRaw()) : raw;
  const timer = setTimeout(() => { raw.destroy(new AssemblyArchiveError("ASSEMBLY_ZIP_TIMEOUT")); output.destroy(new AssemblyArchiveError("ASSEMBLY_ZIP_TIMEOUT")); }, Math.max(1, deadline - Date.now()));
  raw.on("error", error => output.destroy(error));
  try {
    for await (const chunk of output) {
      const value = Buffer.from(chunk); byteSize += value.length;
      if (Date.now() > deadline) fail("ASSEMBLY_ZIP_TIMEOUT");
      if (byteSize > maxBytes || byteSize > entry.byteSize) fail("ASSEMBLY_ZIP_LIMIT");
      hash.update(value); crc = assemblyCrc32(value, crc); if (collect) chunks.push(value);
    }
    if (entry.method === 8 && (output as ReturnType<typeof createInflateRaw>).bytesWritten !== entry.compressedSize) fail();
    if (byteSize !== entry.byteSize || crc !== entry.crc32) fail("ASSEMBLY_ZIP_CRC_MISMATCH");
    return { sha256: hash.digest("hex"), bytes: collect ? Buffer.concat(chunks, byteSize) : undefined };
  } finally { clearTimeout(timer); output.destroy(); raw.destroy(); }
}

/** Strict ZIP32 reader. Every byte is hashed; every entry is bounded, inflated and CRC checked.
 * ZIP64, split archives and compression methods other than store/deflate fail closed. */
async function validateArchive(source: AssemblyArchiveSource, overrides: Partial<typeof ASSEMBLY_PACKAGE_LIMITS> = {}): Promise<AssemblyArchiveManifest> {
  const limits = { ...ASSEMBLY_PACKAGE_LIMITS, ...overrides }, deadline = Date.now() + limits.validationBudgetMs;
  if (!Number.isSafeInteger(source.byteSize) || source.byteSize < 22) fail();
  if (source.byteSize > limits.maxArchiveBytes) fail("ASSEMBLY_ZIP_LIMIT");
  const tail = await read(source, Math.max(0, source.byteSize - 65557), Math.min(source.byteSize, 65557));
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) { eocd = i; break; }
  if (eocd < 0) fail();
  const end = tail.subarray(eocd), count = end.readUInt16LE(10), centralSize = end.readUInt32LE(12), centralStart = end.readUInt32LE(16);
  if (end.readUInt16LE(4) || end.readUInt16LE(6) || end.readUInt16LE(8) !== count || count === 65535 || centralSize === 0xffffffff || centralStart === 0xffffffff) fail("ASSEMBLY_ZIP_UNSUPPORTED");
  if (!count || count > limits.maxEntries) fail("ASSEMBLY_ZIP_LIMIT");
  if (centralStart + centralSize !== source.byteSize - tail.length + eocd) fail();
  const entries: AssemblyArchiveEntry[] = [], records: { entry: AssemblyArchiveEntry; offset: number; flags: number; rawName: Buffer }[] = [], keys = new Map<string, boolean>();
  let pos = centralStart, total = 0;
  for (let n = 0; n < count; n++) {
    if (Date.now() > deadline) fail("ASSEMBLY_ZIP_TIMEOUT");
    const h = await read(source, pos, 46); if (h.readUInt32LE(0) !== 0x02014b50) fail();
    const flags = h.readUInt16LE(8), method = h.readUInt16LE(10), nameSize = h.readUInt16LE(28), extraSize = h.readUInt16LE(30), commentSize = h.readUInt16LE(32);
    if (flags & ~0x080e || ![0, 8].includes(method) || h.readUInt16LE(34)) fail("ASSEMBLY_ZIP_UNSUPPORTED");
    const attrs = h.readUInt32LE(38), unixType = (attrs >>> 16) & 0xf000;
    if ((unixType && unixType !== 0x8000 && unixType !== 0x4000) || (attrs & 0x400)) fail("ASSEMBLY_ZIP_UNSAFE_PATH");
    const names = await read(source, pos + 46, nameSize + extraSize), rawName = names.subarray(0, nameSize);
    const normalized = normalizeAssemblyEntryPath(filename(rawName, flags, names.subarray(nameSize)));
    if ((unixType === 0x4000 || !!(attrs & 16)) && !normalized.directory) fail();
    if (keys.has(normalized.windowsKey)) fail("ASSEMBLY_ZIP_DUPLICATE_PATH"); keys.set(normalized.windowsKey, normalized.directory);
    const entry: AssemblyArchiveEntry = { ...normalized, entryKey: crypto.createHash("sha256").update(normalized.windowsKey).digest("hex"), byteSize: h.readUInt32LE(24), compressedSize: h.readUInt32LE(20), crc32: h.readUInt32LE(16), method, dataOffset: 0, sha256: "" };
    if (entry.byteSize === 0xffffffff || entry.compressedSize === 0xffffffff) fail("ASSEMBLY_ZIP_UNSUPPORTED");
    total += entry.byteSize; if (total > limits.maxExpandedBytes || (entry.directory && entry.byteSize !== 0)) fail("ASSEMBLY_ZIP_LIMIT");
    entries.push(entry); records.push({ entry, flags, rawName, offset: h.readUInt32LE(42) });
    pos += 46 + nameSize + extraSize + commentSize; if (pos > centralStart + centralSize) fail();
  }
  if (pos !== centralStart + centralSize) fail();
  for (const entry of entries) {
    const segments = entry.windowsKey.split("/"); segments.pop();
    while (segments.length) { if (keys.get(segments.join("/")) === false) fail("ASSEMBLY_ZIP_DUPLICATE_PATH"); segments.pop(); }
  }
  let expectedOffset = 0;
  for (const record of records.sort((a, b) => a.offset - b.offset)) {
    if (record.offset !== expectedOffset) fail();
    const h = await read(source, record.offset, 30), entry = record.entry;
    if (h.readUInt32LE(0) !== 0x04034b50 || h.readUInt16LE(6) !== record.flags || h.readUInt16LE(8) !== entry.method) fail();
    const nameSize = h.readUInt16LE(26), extraSize = h.readUInt16LE(28), names = await read(source, record.offset + 30, nameSize + extraSize);
    if (!names.subarray(0, nameSize).equals(record.rawName) || normalizeAssemblyEntryPath(filename(record.rawName, record.flags, names.subarray(nameSize))).relativePath !== entry.relativePath) fail();
    entry.dataOffset = record.offset + 30 + nameSize + extraSize;
    expectedOffset = entry.dataOffset + entry.compressedSize;
    if (expectedOffset > centralStart) fail();
    if (record.flags & 8) {
      const descriptor = await read(source, expectedOffset, Math.min(16, centralStart - expectedOffset));
      const shift = descriptor.length >= 4 && descriptor.readUInt32LE(0) === 0x08074b50 ? 4 : 0;
      if (descriptor.length < shift + 12 || descriptor.readUInt32LE(shift) !== entry.crc32 || descriptor.readUInt32LE(shift + 4) !== entry.compressedSize || descriptor.readUInt32LE(shift + 8) !== entry.byteSize) fail();
      expectedOffset += shift + 12;
      for (const [at, value] of [[14, entry.crc32], [18, entry.compressedSize], [22, entry.byteSize]]) if (h.readUInt32LE(at) !== 0 && h.readUInt32LE(at) !== value) fail();
    } else if (h.readUInt32LE(14) !== entry.crc32 || h.readUInt32LE(18) !== entry.compressedSize || h.readUInt32LE(22) !== entry.byteSize) fail();
    entry.sha256 = (await digestEntry(source, entry, deadline, limits.maxExpandedBytes)).sha256;
  }
  if (expectedOffset !== centralStart) fail();
  const assemblyEntryKeys = entries.filter(e => !e.directory && /\.sldasm$/iu.test(e.relativePath)).map(e => e.entryKey);
  if (!assemblyEntryKeys.length) fail("ASSEMBLY_ZIP_NO_ASSEMBLY");
  const hash = crypto.createHash("sha256"); let received = 0;
  for await (const chunk of bounded(source.stream(), deadline)) { received += chunk.length; if (received > source.byteSize) fail(); hash.update(chunk); }
  if (received !== source.byteSize) fail();
  return { version: 1, sha256: hash.digest("hex"), byteSize: source.byteSize, entries, assemblyEntryKeys };
}
export async function validateAssemblyArchive(source: AssemblyArchiveSource, overrides: Partial<typeof ASSEMBLY_PACKAGE_LIMITS> = {}): Promise<AssemblyArchiveManifest> {
  const budget = overrides.validationBudgetMs ?? ASSEMBLY_PACKAGE_LIMITS.validationBudgetMs;
  const deadline = Date.now() + budget;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Covers stalled range reads as well as inflate and full-archive hashing.
  // Adapters also bound/cancel their own network streams; late work cannot publish acceptance.
  const timedSource: AssemblyArchiveSource = { byteSize: source.byteSize,
    readRange: async (start, end) => { if (Date.now() > deadline) fail("ASSEMBLY_ZIP_TIMEOUT"); return source.readRange(start, end); },
    stream: (start, end) => bounded(source.stream(start, end), deadline)
  };
  try {
    return await Promise.race([validateArchive(timedSource, overrides), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AssemblyArchiveError("ASSEMBLY_ZIP_TIMEOUT")), Math.max(0, budget)); })]);
  } catch (error) {
    if (["Z_DATA_ERROR", "Z_BUF_ERROR", "ERR_STREAM_PREMATURE_CLOSE"].includes((error as NodeJS.ErrnoException)?.code ?? "")) fail();
    throw error;
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
export async function extractAssemblyArchiveEntry(source: AssemblyArchiveSource, manifest: AssemblyArchiveManifest, entryKey: string, maxBytes: number): Promise<Buffer> {
  const entry = manifest.entries.find(e => e.entryKey === entryKey && !e.directory);
  if (manifest.version !== 1 || manifest.byteSize !== source.byteSize || !entry) fail("ASSEMBLY_ENTRY_NOT_FOUND");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || entry.byteSize > maxBytes) fail("ASSEMBLY_ZIP_LIMIT");
  const result = await digestEntry(source, entry, Date.now() + ASSEMBLY_PACKAGE_LIMITS.validationBudgetMs, maxBytes, true);
  if (result.sha256 !== entry.sha256) fail("ASSEMBLY_ENTRY_HASH_MISMATCH");
  return result.bytes!;
}
