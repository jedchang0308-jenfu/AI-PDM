export type DrawingUploadFile = { file: File; path: string };

export function drawingUploadPath(value: string) {
  const path = value.replaceAll("\\", "/").normalize("NFC");
  if (!path || path.length > 1024 || path.startsWith("/") || /[\u0000-\u001f\u007f<>:"|?*]/u.test(path)
    || path.split("/").some(part => !part || part === "." || part === ".." || /[. ]$/u.test(part)
      || part.length > 255 || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu.test(part))) {
    throw new Error("檔案路徑無法使用，請確認資料夾名稱。");
  }
  return path;
}
export function selectedDrawingFiles(files: Iterable<File>): DrawingUploadFile[] {
  return Array.from(files, file => ({ file, path: drawingUploadPath(file.webkitRelativePath || file.name) }));
}

// Directory readers return batches (including a final empty batch), not the
// complete directory in one call. Capture entries inside the drop event.
type Entry = { name: string; isFile: boolean; isDirectory: boolean;
  file?: (success: (file: File) => void, failure: (error: DOMException) => void) => void;
  createReader?: () => { readEntries: (success: (entries: Entry[]) => void, failure: (error: DOMException) => void) => void } };
export async function droppedDrawingFiles(transfer: Pick<DataTransfer, "items" | "files">): Promise<DrawingUploadFile[]> {
  const entries = Array.from(transfer.items ?? [], item => {
    const source = item as unknown as { webkitGetAsEntry?: () => Entry | null };
    return source.webkitGetAsEntry?.() ?? null;
  });
  const fallback = selectedDrawingFiles(Array.from(transfer.files ?? []));
  if (!entries.some(Boolean)) return fallback;
  const files: DrawingUploadFile[] = [];
  async function walk(entry: Entry, parent: string, depth = 0): Promise<void> {
    if (depth > 64 || files.length >= 10_000) throw new Error("資料夾檔案過多或層級過深。");
    const path = drawingUploadPath(parent + entry.name);
    if (entry.isFile && entry.file) {
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
      files.push({ file, path });
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child, path + "/", depth + 1);
      }
    } else throw new Error("無法讀取資料夾，請使用「選擇資料夾」重試。");
  }
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]) await walk(entries[i]!, "");
    else if (fallback[i]) files.push(fallback[i]);
  }
  return files;
}
