import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { prepareDrawingUpload, drawingZipSources } from "./drawing-upload-archive";
import { validateAssemblyArchive, extractAssemblyArchiveEntry, type AssemblyArchiveSource } from "./assembly-archive";
import { drawingUploadPath, droppedDrawingFiles } from "./drawing-upload-files";

const raw = (path: string, content = path) => ({ path, file: new File([content], path.split("/").at(-1)!) });
const archive = (entries: Record<string, string>, name = "assembly.zip") => new File([zipSync(Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, new TextEncoder().encode(value)])))], name);
async function inspect(file: File) {
  const data = Buffer.from(await file.arrayBuffer());
  const source: AssemblyArchiveSource = { byteSize: data.length, readRange: async (a, b) => data.subarray(a, b), stream: async function* (a = 0, b = data.length) { yield data.subarray(a, b); } };
  const manifest = await validateAssemblyArchive(source);
  return { manifest, contents: Object.fromEntries(await Promise.all(manifest.entries.filter(entry => !entry.directory).map(async entry => [entry.relativePath, (await extractAssemblyArchiveEntry(source, manifest, entry.entryKey, 1024 * 1024)).toString()])))};
}
describe("one drawing upload batch", () => {
  it("packages a whole folder, preserves distinct same-name parts, and exposes 2D for automatic binding", async () => {
    const plan = await prepareDrawingUpload([raw("包/主件.SLDASM"), raw("包/左/件.SLDPRT", "left"), raw("包/右/件.SLDPRT", "right"), raw("包/主件.SLDDRW"), raw("包/主件.pdf")], { code: "A0054-M01" });
    expect(plan.archive).not.toBeNull(); expect(plan.fileCount).toBe(5);
    expect(plan.partChoices).toHaveLength(0); expect(plan.drawingChoices[0].path).toBe("包/主件.SLDDRW");
    const checked = await inspect(plan.archive!);
    expect(checked.contents).toMatchObject({ "包/左/件.SLDPRT": "left", "包/右/件.SLDPRT": "right" });
    expect(checked.manifest.assemblyEntryKeys).toHaveLength(1);
    expect(plan.files.map(item => item.file.name)).toEqual(["主件.pdf"]);
  });
  it("keeps a single ZIP byte-for-byte and automatically finds its drawing", async () => {
    const zip = archive({ "A0054.SLDASM": "cad", "A0054.SLDPRT": "part", "A0054.SLDDRW": "drawing" });
    const plan = await prepareDrawingUpload([{ path: zip.name, file: zip }], { code: "A0054-M01" });
    expect(plan.archive).toBe(zip); expect(await plan.drawingChoices[0].file.text()).toBe("drawing");
  });
  it("combines ZIP and individual drawings into the downloadable package", async () => {
    const zip = archive({ "folder/main.SLDASM": "cad", "folder/part.SLDPRT": "part" });
    const plan = await prepareDrawingUpload([{ path: zip.name, file: zip }, raw("main.SLDDRW", "new drawing")], { code: "A0054-M01" });
    expect((await inspect(plan.archive!)).contents).toMatchObject({ "folder/part.SLDPRT": "part", "main.SLDDRW": "new drawing" });
  });
  it("supplements the existing package without dropping its previous files, and targets unique filenames in their original directory", async () => {
    const previous = archive({ "包/main.SLDASM": "cad", "包/part.SLDPRT": "old", "包/keep.SLDPRT": "keep" });
    const plan = await prepareDrawingUpload([raw("part.SLDPRT", "new"), raw("missing.SLDPRT", "added")], { code: "A0054-M01", existingArchive: previous });
    expect((await inspect(plan.archive!)).contents).toEqual({ "包/main.SLDASM": "cad", "包/part.SLDPRT": "new", "包/keep.SLDPRT": "keep", "missing.SLDPRT": "added" });
    expect((await inspect(previous)).contents["包/part.SLDPRT"]).toBe("old");
  });
  it("treats an explicitly supplied ZIP as a new complete source", async () => {
    const zip = archive({ "new.SLDASM": "new" });
    const plan = await prepareDrawingUpload([{ file: zip, path: zip.name }], { code: "A0054-M01", existingArchive: archive({ "old.SLDASM": "old" }) });
    expect(Object.keys((await inspect(plan.archive!)).contents)).toEqual(["new.SLDASM"]);
  });
  it("keeps a child drawing in the package without assigning it as the assembly master", async () => {
    const zip = archive({ "A0054.SLDASM": "cad", "A0033.SLDDRW": "child drawing" });
    const plan = await prepareDrawingUpload([{ file: zip, path: zip.name }], { code: "A0054-M01" });
    expect(plan.drawingChoices).toHaveLength(0);
    expect((await inspect(plan.archive!)).contents["A0033.SLDDRW"]).toBe("child drawing");
    const folder = await prepareDrawingUpload([raw("folder/A0054.SLDASM"), raw("folder/A0033.SLDDRW")], { code: "A0054-M01" });
    expect(folder.drawingChoices).toHaveLength(0);
  });
  it("retains ordinary part/drawing upload without inventing a BOM or selecting the last of multiple main files", async () => {
    const plan = await prepareDrawingUpload([raw("a.SLDPRT"), raw("b.SLDPRT"), raw("drawing.SLDDRW")], { code: "A0054-M01" });
    expect(plan.archive).toBeNull(); expect(plan.partChoices.map(item => item.path)).toEqual(["a.SLDPRT", "b.SLDPRT"]);
  });
  it("rejects flattened collisions instead of losing a selected file", async () => {
    await expect(prepareDrawingUpload([raw("part.SLDPRT", "one"), raw("PART.sldprt", "two")], { code: "A0054" })).rejects.toThrow("路徑重複");
    await expect(prepareDrawingUpload([raw("part.SLDPRT", "new")], { code: "A0054", existingArchive: archive({ "a/main.SLDASM": "asm", "a/part.SLDPRT": "a", "b/part.SLDPRT": "b" }) })).rejects.toThrow("有多個目錄");
  });
  it.each(["../main.SLDASM", "C:/main.SLDASM", "a//main.SLDASM", "aux.SLDPRT"])("rejects unsafe selected paths %s", async path => {
    expect(() => drawingUploadPath(path)).toThrow();
    const zip = archive({ [path]: "cad" });
    await expect(drawingZipSources(zip)).rejects.toThrow();
  });
  it("rejects a damaged original CRC before repacking a ZIP mixed with other files", async () => {
    const data = new Uint8Array(zipSync({ "main.SLDASM": new TextEncoder().encode("original") }, { level: 0 }));
    data[30 + "main.SLDASM".length] ^= 1;
    const file = new File([data], "damaged.zip");
    await expect(prepareDrawingUpload([{ path: file.name, file }, raw("drawing.pdf")], { code: "A0054" })).rejects.toThrow("ZIP 無法讀取");
  });
  it("walks every directory-reader batch and preserves nested relative paths", async () => {
    const leaf = (name: string) => ({ name, isFile: true, isDirectory: false, file: (done: (file: File) => void) => done(new File([name], name)) });
    const batches = [[leaf("one.SLDPRT")], [leaf("two.SLDPRT")], []]; let reads = 0;
    const directory = { name: "root", isFile: false, isDirectory: true, createReader: () => ({ readEntries: (done: (value: unknown[]) => void) => { reads++; done(batches.shift()!); } }) };
    const result = await droppedDrawingFiles({ items: [{ webkitGetAsEntry: () => directory }], files: [] } as unknown as DataTransfer);
    expect(result.map(item => item.path)).toEqual(["root/one.SLDPRT", "root/two.SLDPRT"]); expect(reads).toBe(3);
  });
});
