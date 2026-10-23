import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { isBrowserPdfRecognitionSource } from "./drawing-recognition-adapters";

describe("PDF recognition source media type", () => {
  it("keeps the adapter importable by the native Node worker entrypoint", () => {
    const url = new URL("./drawing-recognition-adapters.ts", import.meta.url).href;
    const script = `import {isBrowserPdfRecognitionSource as accepts} from ${JSON.stringify(url)}; process.stdout.write(JSON.stringify([accepts({fileExt:'pdf',mimeType:'application/pdf; charset=binary'}), accepts({fileExt:'pdf',mimeType:'application/pdfx'})]));`;
    const output = execFileSync(process.execPath, ["--experimental-transform-types", "--input-type=module", "-e", script],
      { encoding: "utf8", windowsHide: true, timeout: 10_000 });
    expect(JSON.parse(output)).toEqual([true, false]);
  });
  it.each(["application/pdf; charset=binary", " Application/PDF ; charset=binary ", "APPLICATION/PDF"])("accepts a normalized PDF %s", mimeType => {
    expect(isBrowserPdfRecognitionSource({ fileExt: ".PDF", mimeType })).toBe(true);
  });
  it.each(["", "image/png", "application/octet-stream", "application/pdfx"])("rejects non-PDF media type %s", mimeType => {
    expect(isBrowserPdfRecognitionSource({ fileExt: "pdf", mimeType })).toBe(false);
  });
  it("preserves the PDF extension requirement", () => {
    expect(isBrowserPdfRecognitionSource({ fileExt: "png", mimeType: "application/pdf; charset=binary" })).toBe(false);
  });
});
