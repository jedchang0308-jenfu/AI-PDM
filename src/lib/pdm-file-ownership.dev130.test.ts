import { describe, expect, it } from "vitest";
import { evaluateDrawingRevisionFileReadiness } from "@/lib/pdm-file-ownership";

const file = (fileName: string, role: string, id = fileName) => ({ id, fileName, role, isPrimary: true, fileSize: 12, contentHash: "a".repeat(64) });

describe("DEV-130 drawing revision file readiness", () => {
  it("allows research with only current SolidWorks 2D and 3D", () => {
    const result = evaluateDrawingRevisionFileReadiness([file("A.SLDDRW", "drawing_2d"), file("A.SLDPRT", "cad_3d")], "research");
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("requires exact PDF and DWG for formal and does not accept DXF", () => {
    const result = evaluateDrawingRevisionFileReadiness([file("A.SLDDRW", "drawing_2d"), file("A.SLDPRT", "cad_3d"), file("A.DXF", "dwg_dxf")], "formal");
    expect(result.blockers.map((entry) => entry.code)).toEqual(["FORMAL_PDF_REQUIRED", "FORMAL_DWG_REQUIRED"]);
  });

  it("blocks duplicates and unreadable PDF but keeps filename mismatch non-blocking", () => {
    const duplicate = evaluateDrawingRevisionFileReadiness([
      file("A.SLDDRW", "drawing_2d"), file("A.SLDPRT", "cad_3d"), file("A.PDF", "pdf", "pdf-1"), file("A-copy.PDF", "pdf", "pdf-2"), file("A.DWG", "dwg_dxf")
    ], "formal");
    expect(duplicate.blockers[0]?.code).toBe("FORMAL_PDF_DUPLICATE");

    const unreadable = evaluateDrawingRevisionFileReadiness([
      file("A.SLDDRW", "drawing_2d"), file("A.SLDPRT", "cad_3d"), { ...file("A.PDF", "pdf"), readable: false }, file("A.DWG", "dwg_dxf")
    ], "formal");
    expect(unreadable.blockers.map((entry) => entry.code)).toContain("FORMAL_PDF_REQUIRED");

    const mismatch = evaluateDrawingRevisionFileReadiness([
      file("A.SLDDRW", "drawing_2d"), file("A.SLDPRT", "cad_3d"), file("B.PDF", "pdf"), file("C.DWG", "dwg_dxf")
    ], "formal");
    expect(mismatch.ready).toBe(true);
    expect(mismatch.warnings).toEqual([expect.objectContaining({ code: "FORMAL_2D_FILENAME_MISMATCH" })]);
  });
});
