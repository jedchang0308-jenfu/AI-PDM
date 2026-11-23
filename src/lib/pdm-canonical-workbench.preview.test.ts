import { describe, expect, it } from "vitest";
import { canonicalPreviewSlot, PdmCanonicalWorkbenchService } from "./pdm-canonical-workbench";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "./db-async-provider";
import type { CanonicalPreviewSourceRow } from "./pdm-canonical-preview";

const source: CanonicalPreviewSourceRow = {
  rowId: "row", revisionId: "revision", dataLayer: "drawing_rd", reviewRequestId: null,
  bindingId: "binding", assetId: "asset", role: "drawing_2d", displayName: "drawing.slddrw",
  fileName: "drawing.slddrw", fileExt: "slddrw", mimeType: "application/octet-stream",
  contentHash: "hash", isPrimary: true, sortOrder: 0
};
describe("canonical 2D preview projection", () => {
  it("uses the renewed heartbeat rather than the old lease start to judge live processing", async () => {
    const database = new Database(":memory:");
    try {
      database.exec("CREATE TABLE preview_jobs(company_id TEXT,source_file_asset_id TEXT,source_content_hash TEXT,status TEXT,error_code TEXT,locked_at TEXT,updated_at TEXT,created_at TEXT)");
      const now = new Date().toISOString();
      database.prepare("INSERT INTO preview_jobs VALUES('company','asset','hash','running',NULL,'2026-01-01T00:00:00Z',?,?)").run(now, now);
      const service = new PdmCanonicalWorkbenchService(createAsyncDatabaseClient({kind:"sqlite",database}));
      const jobs = await (service as unknown as { previewJobs(company: string, assets: string[]): Promise<Array<{sourceFileAssetId:string;sourceContentHash:string;status:string;lastHeartbeatAt:string}>> }).previewJobs("company", ["asset"]);
      expect(canonicalPreviewSlot("two-d", "2D", source, [], jobs, "candidate_revision", null).state).toBe("running");
    } finally { database.close(); }
  });
  it.each(["three-d", "two-d"] as const)("shows unclaimed and interrupted work consistently for %s without claiming the service is offline", kind => {
    const current = { ...source, role: kind === "three-d" ? "cad_3d" : "drawing_2d", fileExt: kind === "three-d" ? "sldprt" : "slddrw" };
    for (const status of ["queued", "running"]) {
      const result = canonicalPreviewSlot(kind, kind, current, [], [{ sourceFileAssetId: source.assetId,
        sourceContentHash: source.contentHash, status, lastHeartbeatAt: "2026-01-01T00:00:00Z" }], "candidate_revision", null);
      expect(result.state).toBe("delayed");
      expect(result.stateTitle).toBe(status === "queued" ? "預覽工作尚未被接手" : "預覽處理已中斷");
      expect(result.stateText).not.toContain("稍後");
    }
  });
  it("selects a legacy PDF through the protected byte-validation endpoint", () => {
    const result = canonicalPreviewSlot("two-d", "2D", { ...source, fileExt: "pdf", mimeType: "application/octet-stream" }, [], [], "candidate_revision", null);
    expect(result.mediaMimeType).toBe("application/pdf");
    expect(result.mediaHref).toContain("preview=1");
  });
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
