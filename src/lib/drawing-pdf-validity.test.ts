import { describe, expect, it } from "vitest";
import { isReadableDrawingPdf } from "./drawing-pdf-validity";
import { evaluateRevisionPackageCompleteness } from "./revision-package";

function onePagePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>"
  ];
  let text = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(text);
  text += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}

describe("DEV-130 supplied PDF validity", () => {
  it("accepts a readable page without rendering or OCR", async () => {
    expect(await isReadableDrawingPdf(onePagePdf())).toBe(true);
  });
  it("rejects non-PDF bytes and a corrupt file with a PDF signature", async () => {
    expect(await isReadableDrawingPdf(Buffer.from("not PDF"))).toBe(false);
    expect(await isReadableDrawingPdf(Buffer.from("%PDF-1.7 corrupt"))).toBe(false);
  });
  it("does not generate optional PDF/DWG warnings for research minor revisions", () => {
    const warnings = evaluateRevisionPackageCompleteness({ drawingNumber: "A0001-M01", revision: "1.2", files: [
      { filename: "A.SLDDRW", role: "drawing_2d" }, { filename: "A.SLDPRT", role: "cad_3d" }
    ] });
    expect(warnings.some(warning => ["missing_pdf", "missing_dwg_dxf"].includes(warning.code))).toBe(false);
  });
});
