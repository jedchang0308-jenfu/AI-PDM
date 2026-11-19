import { Inflate, Zip, ZipDeflate } from "fflate";
import { drawingUploadPath, type DrawingUploadFile } from "@/lib/drawing-upload-files";

export const DRAWING_UPLOAD_LIMITS = { archiveBytes: 256 * 1024 * 1024, expandedBytes: 2 * 1024 * 1024 * 1024, entries: 10_000 };
type Source = { path: string; size: number; pipe: (consume: (bytes: Uint8Array) => void) => Promise<void> };
export type PreparedDrawingUpload = { archive: File | null; files: DrawingUploadFile[]; drawingChoices: DrawingUploadFile[]; partChoices: DrawingUploadFile[]; fileCount: number };
const crcTable = Array.from({ length: 256 }, (_, i) => { let crc = i; for (let j = 0; j < 8; j++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); return crc >>> 0; });
function crc32(bytes: Uint8Array, previous = 0) { let crc = previous ^ 0xffffffff; for (const byte of bytes) crc = crc >>> 8 ^ crcTable[(crc ^ byte) & 255]; return (crc ^ 0xffffffff) >>> 0; }
const badZip = () => new Error("ZIP 無法讀取，請確認檔案完整且未加密。");
async function bytes(file: Blob, offset: number, size: number) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > file.size) throw badZip();
  return new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
}
async function pipeBlob(blob: Blob, consume: (bytes: Uint8Array) => void) {
  for (let at = 0; at < blob.size; at += 256 * 1024) consume(await bytes(blob, at, Math.min(256 * 1024, blob.size - at)));
}
const cp437 = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
function zipName(raw: Uint8Array, flags: number, extra: Uint8Array) {
  let name = flags & 0x800 ? new TextDecoder("utf-8", { fatal: true }).decode(raw) : Array.from(raw, n => n < 128 ? String.fromCharCode(n) : cp437[n - 128]).join("");
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  for (let at = 0; at < extra.length;) {
    if (at + 4 > extra.length) throw badZip();
    const id = view.getUint16(at, true), size = view.getUint16(at + 2, true); at += 4;
    if (at + size > extra.length || [1, 13, 0x756e].includes(id)) throw badZip();
    if (id === 0x7075) {
      if (size < 5 || extra[at] !== 1 || view.getUint32(at + 1, true) !== crc32(raw)) throw badZip();
      const unicode = new TextDecoder("utf-8", { fatal: true }).decode(extra.subarray(at + 5, at + size));
      if (flags & 0x800 && unicode !== name) throw badZip();
      name = unicode;
    }
    at += size;
  }
  return name;
}
/** ZIP32 metadata is bounded before inflation. Original CRC/size are checked
 * before repacking, and the existing server validates the resulting archive. */
export async function drawingZipSources(file: File): Promise<Source[]> {
  if (file.size < 22 || file.size > DRAWING_UPLOAD_LIMITS.archiveBytes) throw badZip();
  const tail = await bytes(file, Math.max(0, file.size - 65557), Math.min(file.size, 65557));
  const end = new DataView(tail.buffer); let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (end.getUint32(i, true) === 0x06054b50 && i + 22 + end.getUint16(i + 20, true) === tail.length) { eocd = i; break; }
  if (eocd < 0) throw badZip();
  const count = end.getUint16(eocd + 10, true), centralSize = end.getUint32(eocd + 12, true), centralStart = end.getUint32(eocd + 16, true);
  if (!count || count > DRAWING_UPLOAD_LIMITS.entries || end.getUint16(eocd + 4, true) || end.getUint16(eocd + 6, true)
    || end.getUint16(eocd + 8, true) !== count || centralStart + centralSize !== file.size - tail.length + eocd) throw badZip();
  const sources: Source[] = [], keys = new Set<string>(); let at = centralStart, total = 0;
  for (let n = 0; n < count; n++) {
    const header = new DataView((await bytes(file, at, 46)).buffer);
    if (header.getUint32(0, true) !== 0x02014b50) throw badZip();
    const flags = header.getUint16(8, true), method = header.getUint16(10, true), nameSize = header.getUint16(28, true), extraSize = header.getUint16(30, true);
    const compressed = header.getUint32(20, true), size = header.getUint32(24, true), expectedCrc = header.getUint32(16, true), attrs = header.getUint32(38, true), type = attrs >>> 16 & 0xf000;
    if (flags & ~0x080e || ![0, 8].includes(method) || header.getUint16(34, true) || (type && type !== 0x8000 && type !== 0x4000) || attrs & 0x400) throw badZip();
    const names = await bytes(file, at + 46, nameSize + extraSize);
    const original = zipName(names.subarray(0, nameSize), flags, names.subarray(nameSize));
    const directory = original.endsWith("/");
    const path = drawingUploadPath(directory ? original.slice(0, -1) : original), key = path.toUpperCase();
    if (keys.has(key) || (directory && size)) throw badZip(); keys.add(key);
    total += size; if (total > DRAWING_UPLOAD_LIMITS.expandedBytes) throw new Error("組立檔案總量超過 2 GiB。");
    const offset = header.getUint32(42, true), local = new DataView((await bytes(file, offset, 30)).buffer);
    if (local.getUint32(0, true) !== 0x04034b50 || local.getUint16(6, true) !== flags || local.getUint16(8, true) !== method) throw badZip();
    const localName = await bytes(file, offset + 30, local.getUint16(26, true));
    if (localName.length !== nameSize || localName.some((byte, i) => byte !== names[i])) throw badZip();
    const dataAt = offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    if (dataAt + compressed > centralStart) throw badZip();
    if (!directory) sources.push({ path, size, pipe: async consume => {
      let received = 0, crc = 0;
      const output = (chunk: Uint8Array) => {
        received += chunk.length; if (received > size) throw badZip();
        crc = crc32(chunk, crc); consume(chunk);
      };
      if (method === 0) await pipeBlob(file.slice(dataAt, dataAt + compressed), output);
      else {
        const inflate = new Inflate(output);
        await pipeBlob(file.slice(dataAt, dataAt + compressed), chunk => inflate.push(chunk, false));
        inflate.push(new Uint8Array(), true);
      }
      if (received !== size || crc !== expectedCrc) throw badZip();
    } });
    at += 46 + nameSize + extraSize + header.getUint16(32, true);
    if (at > centralStart + centralSize) throw badZip();
  }
  if (at !== centralStart + centralSize) throw badZip();
  return sources;
}
async function sourceFile(source: Source) {
  const chunks: BlobPart[] = []; await source.pipe(chunk => chunks.push(new Uint8Array(chunk)));
  return { path: source.path, file: new File(chunks, source.path.split("/").at(-1)!, { lastModified: 0 }) };
}

export async function prepareDrawingUpload(selected: DrawingUploadFile[], options: { code: string; existingArchive?: File; onProgress?: (label: string) => void }): Promise<PreparedDrawingUpload> {
  if (!selected.length || selected.length > DRAWING_UPLOAD_LIMITS.entries) throw new Error("請選擇檔案或資料夾。");
  const explicitZips = selected.filter(item => /\.zip$/iu.test(item.path));
  const entries = new Map<string, Source>();
  const add = (source: Source) => { entries.set(source.path.toUpperCase(), source); };
  if (!explicitZips.length && options.existingArchive) for (const entry of await drawingZipSources(options.existingArchive)) add(entry);
  const fresh = new Set<string>();
  for (const zip of explicitZips) for (const entry of await drawingZipSources(zip.file)) {
    const key = entry.path.toUpperCase();
    if (fresh.has(key)) throw new Error(`路徑重複：${entry.path}。請保留一份檔案。`);
    fresh.add(key); add(entry);
  }
  const rawPaths = new Set<string>(), explicitMasters = new Set<string>();
  const hasSelectedAssembly = selected.some(item => /\.sldasm$/iu.test(item.path));
  for (const item of selected.filter(item => !/\.zip$/iu.test(item.path))) {
    let path = drawingUploadPath(item.path);
    if (!path.includes("/")) {
      const matches = [...entries.values()].filter(entry => entry.path.split("/").at(-1)!.toUpperCase() === path.toUpperCase());
      if (matches.length > 1) throw new Error(`${path} 有多個目錄，請用資料夾上傳保留路徑。`);
      if (matches.length === 1) path = matches[0].path;
    }
    const key = path.toUpperCase();
    if (rawPaths.has(key)) throw new Error(`路徑重複：${path}。請改用資料夾上傳。`);
    rawPaths.add(key);
    if (!hasSelectedAssembly && !item.path.includes("/")) explicitMasters.add(key);
    add({ path, size: item.file.size, pipe: consume => pipeBlob(item.file, consume) });
  }
  const sources = [...entries.values()].sort((a, b) => a.path.toUpperCase() < b.path.toUpperCase() ? -1 : a.path.toUpperCase() > b.path.toUpperCase() ? 1 : 0);
  if (sources.length > DRAWING_UPLOAD_LIMITS.entries || sources.reduce((n, source) => n + source.size, 0) > DRAWING_UPLOAD_LIMITS.expandedBytes) throw new Error("檔案數量或總量超出上限。");
  const hasAssembly = sources.some(item => /\.sldasm$/iu.test(item.path));
  const assemblies = sources.filter(item => /\.sldasm$/iu.test(item.path));
  const identityNames = [options.code, options.code.split("-")[0], ...(assemblies.length === 1 ? [assemblies[0].path.split("/").at(-1)!.replace(/\.sldasm$/iu, "")] : [])].map(name => name.toUpperCase());
  // A lone child drawing inside a folder/ZIP is not evidence that it is the
  // assembly's 2D master. Explicit single-file additions express that intent.
  const isMasterCandidate = (item: DrawingUploadFile) => !hasAssembly || explicitMasters.has(item.path.toUpperCase())
    || identityNames.includes(item.path.split("/").at(-1)!.replace(/\.[^.]+$/u, "").toUpperCase());
  const ordinary = sources.filter(item => hasAssembly ? /\.(slddrw|pdf|dwg|dxf)$/iu.test(item.path) : /\.(sldprt|slddrw|pdf|dwg|dxf|step|stp|iges|igs|igf|x_t|x_b|sat|stl|jt)$/iu.test(item.path));
  const files: DrawingUploadFile[] = [];
  for (const source of ordinary) files.push(await sourceFile(source));
  let archive: File | null = null;
  if (hasAssembly) {
    if (selected.length === 1 && explicitZips.length === 1) archive = explicitZips[0].file;
    else {
      const chunks: BlobPart[] = []; let size = 0, failure: Error | null = null;
      const zip = new Zip((error, chunk) => {
        if (error) { failure = error; return; }
        size += chunk.length;
        if (size > DRAWING_UPLOAD_LIMITS.archiveBytes) throw new Error("組立包超過 256 MiB 上限。");
        chunks.push(new Uint8Array(chunk));
      });
      for (const source of sources) {
        options.onProgress?.(source.path);
        const entry = new ZipDeflate(source.path, { level: 1 }); entry.mtime = new Date(1980, 0, 1);
        zip.add(entry); await source.pipe(chunk => entry.push(chunk, false)); entry.push(new Uint8Array(), true);
        if (failure) throw failure;
      }
      zip.end(); if (failure) throw failure;
      const name = explicitZips[0]?.file.name ?? `${options.code || "assembly"}.zip`;
      archive = new File(chunks, name, { type: "application/zip", lastModified: 0 });
    }
  }
  if (!archive && !files.length) throw new Error("沒有可用的組立、圖面或 3D 檔案。");
  return { archive, files: files.filter(item => !/\.(slddrw|sldprt)$/iu.test(item.path) && isMasterCandidate(item)), drawingChoices: files.filter(item => /\.slddrw$/iu.test(item.path) && isMasterCandidate(item)),
    partChoices: files.filter(item => /\.sldprt$/iu.test(item.path)), fileCount: sources.length };
}
