import { describe, expect, it } from "vitest";
import { canonicalPreviewSlot } from "./pdm-canonical-workbench";
import type { CanonicalPreviewSourceRow } from "./pdm-canonical-preview";

const source: CanonicalPreviewSourceRow = {
  rowId: "row", revisionId: "revision", dataLayer: "drawing_rd", reviewRequestId: null,
  bindingId: "binding", assetId: "asset", role: "drawing_2d", displayName: "drawing.slddrw",
  fileName: "drawing.slddrw", fileExt: "slddrw", mimeType: "application/octet-stream",
  contentHash: "hash", isPrimary: true, sortOrder: 0
};
describe("canonical 2D preview projection", () => {
  it.each([
    ["cancelled", "預覽已取消"], ["skipped", "預覽已略過"], ["succeeded", "預覽結果無法讀取"]
  ])("preserves terminal %s without retry and keeps the exact original download", (status, title) => {
    const result = canonicalPreviewSlot("two-d", "2D 圖面", source, [], [
      { sourceFileAssetId: source.assetId, sourceContentHash: source.contentHash, status, lastHeartbeatAt: new Date().toISOString() }
    ], "candidate_revision", null);
    expect(result).toMatchObject({ state: "unavailable", stateTitle: title, mediaHref: null, retryCommandRef: null });
    expect(result.stateText).toContain("原檔");
    expect(result.downloadHref).toContain("asset");
    expect(result.downloadHref).toContain("binding");
  });
  it.each(["application/pdf; charset=binary", " Application/PDF "])("directly projects a valid source PDF %s", mimeType => {
    const result = canonicalPreviewSlot("two-d", "2D 圖面", { ...source, fileExt: "pdf", mimeType }, [], [], "candidate_revision", null);
    expect(result).toMatchObject({ state: "ready", mediaMimeType: "application/pdf", retryCommandRef: null });
    expect(result.mediaHref).toContain("preview=1");
  });
  it("does not treat a PDF-like prefix as PDF", () => {
    expect(canonicalPreviewSlot("two-d", "2D 圖面", { ...source, fileExt: "pdf", mimeType: "application/pdfx" }, [], [], "candidate_revision", null).state).not.toBe("ready");
  });
  it("projects only the historical worker-unavailable failure as an automatically recoverable queue", () => {
    const recoverable = canonicalPreviewSlot("three-d", "3D 模型", { ...source, role: "cad_3d", fileExt: "sldprt" }, [], [{
      sourceFileAssetId: source.assetId, sourceContentHash: source.contentHash, status: "failed",
      errorCode: "preview_worker_unavailable", lastHeartbeatAt: new Date().toISOString()
    }], "candidate_revision", null);
    expect(recoverable).toMatchObject({ state: "queued", stateTitle: "等待已連結的解析電腦" });
    expect(recoverable.mediaHref).toContain("preview=1");

    const deterministic = canonicalPreviewSlot("three-d", "3D 模型", { ...source, role: "cad_3d", fileExt: "sldprt" }, [], [{
      sourceFileAssetId: source.assetId, sourceContentHash: source.contentHash, status: "failed",
      errorCode: "document_manager_preview_failed", lastHeartbeatAt: new Date().toISOString()
    }], "candidate_revision", null);
    expect(deterministic).toMatchObject({ state: "failed", mediaHref: null });
  });
});
