import { describe, expect, it } from "vitest";
import { isPdfPreviewSlot } from "@/lib/pdm-entity-detail-contract";
import { isWorkspacePdf, selectCanonicalTwoDSource, selectWorkspacePreviewSource, type CanonicalPreviewSourceRow } from "@/lib/pdm-canonical-preview";

function source(id: string, ext: string, revisionId = "current"): CanonicalPreviewSourceRow {
  return { rowId: id, revisionId, dataLayer: "drawing_rd", reviewRequestId: null, bindingId: id, assetId: id, role: "drawing_2d", displayName: `${id}.${ext}`, fileName: `${id}.${ext}`, fileExt: ext, mimeType: ext === "pdf" ? "application/pdf" : "application/octet-stream", contentHash: id, isPrimary: true, sortOrder: 0 };
}
const cad = { id: "cad", role: "drawing_2d", file_ext: "slddrw", current_revision_upload: 1, is_primary: 1 };
const pdf = { id: "pdf", role: "pdf", file_ext: "pdf", mime_type: "application/pdf", current_revision_upload: 1 };

describe("DEV122 B42 same revision PDF selection; pure source layer", () => {
  it("uses known MIME before conflicting extension or display name", () => {
    expect(isWorkspacePdf({ ...pdf, mime_type: "image/png" })).toBe(false);
    expect(isWorkspacePdf({ ...pdf, mime_type: "application/octet-stream" })).toBe(false);
    expect(isWorkspacePdf({ id: "legacy", file_name: "drawing.PDF" })).toBe(true);
    expect(isWorkspacePdf({ ...pdf, file_ext: "png", mime_type: " Application/PDF; charset=binary " })).toBe(true);
  });
  it.each(["PDF source without extension", "CAD source with a PDF derivative", "misleading.png"])("uses authoritative slot MIME for full PDF regardless of label %s", label => {
    expect(isPdfPreviewSlot({ kind: "two-d", fileName: label, mediaMimeType: "application/pdf" })).toBe(true);
    expect(isPdfPreviewSlot({ kind: "two-d", fileName: "fake.pdf", mediaMimeType: "image/png" })).toBe(false);
    expect(isPdfPreviewSlot({ kind: "three-d", fileName: "fake.pdf", mediaMimeType: "application/pdf" })).toBe(false);
  });
  it("prefers source PDF over a ready current CAD thumbnail", () => {
    const rows = [source("cad", "slddrw"), source("pdf", "pdf")];
    expect(selectCanonicalTwoDSource(rows, "current", [{ sourceFileAssetId: "cad", sourceContentHash: "cad", derivativeKind: "thumbnail_png", mimeType: "image/png", generatorProfile: "openswx", generatorVersion: "1", status: "ready" }])?.assetId).toBe("pdf");
  });
  it("does not guess between ambiguous canonical PDFs and preserves CAD fallback", () => {
    const first = { ...source("one", "pdf"), isPrimary: false };
    const second = { ...source("two", "pdf"), isPrimary: false };
    const cadSource = source("cad", "slddrw");
    expect(selectCanonicalTwoDSource([first, second, cadSource], "current")?.assetId).toBe("cad");
    expect(selectCanonicalTwoDSource([first, second], "current")).toBeNull();
    expect(selectCanonicalTwoDSource([{ ...first, isPrimary: true }, second, cadSource], "current")?.assetId).toBe("one");
    expect(selectCanonicalTwoDSource([{ ...first, isPrimary: true }, { ...second, isPrimary: true }, cadSource], "current")?.assetId).toBe("cad");
  });
  it("never borrows a PDF from another revision", () => {
    expect(selectCanonicalTwoDSource([source("old-pdf", "pdf", "old"), source("cad", "slddrw")], "current")?.assetId).toBe("cad");
  });
  it("automatically selects current PDF before current CAD without mutating roles", () => {
    expect(selectWorkspacePreviewSource([cad, pdf], "two-d").file?.id).toBe("pdf");
    expect(cad.role).toBe("drawing_2d"); expect(cad.is_primary).toBe(1);
  });
  it("does not substitute a previous PDF for a current CAD", () => {
    expect(selectWorkspacePreviewSource([cad, { ...pdf, current_revision_upload: 0 }], "two-d").file?.id).toBe("cad");
  });
  it("does not auto-display a previous PDF even if no current 2D file exists", () => {
    expect(selectWorkspacePreviewSource([{ ...pdf, current_revision_upload: 0 }], "two-d").file).toBeNull();
  });
  it("requires a choice for ambiguous current PDFs and validates binding in current candidates", () => {
    const other = { ...pdf, id: "second-pdf" };
    const rows = [cad, pdf, other, { ...pdf, id: "previous", current_revision_upload: 0 }];
    expect(selectWorkspacePreviewSource(rows, "two-d")).toMatchObject({ file: null, requiresChoice: true });
    expect(selectWorkspacePreviewSource(rows, "two-d", "second-pdf").file?.id).toBe("second-pdf");
    expect(selectWorkspacePreviewSource(rows, "two-d", "previous").file).toBeNull();
  });
  it("automatically uses the unique primary PDF but not two primaries", () => {
    expect(selectWorkspacePreviewSource([pdf, { ...pdf, id: "primary", is_primary: 1 }], "two-d").file?.id).toBe("primary");
    expect(selectWorkspacePreviewSource([{ ...pdf, is_primary: 1 }, { ...pdf, id: "other", is_primary: 1 }], "two-d").file).toBeNull();
  });
  it("keeps 3D selection and current/fallback scope separate from PDF", () => {
    const model = { id: "model", role: "cad_3d", current_revision_upload: 1 };
    expect(selectWorkspacePreviewSource([pdf, model], "three-d").file?.id).toBe("model");
    expect(selectWorkspacePreviewSource([{ ...cad, current_revision_upload: 0 }], "two-d").file?.id).toBe("cad");
  });
});
