import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { DrawingCanonicalPreview } from "./canonical-pdm-workbench";
import { fileRoleLabel } from "./canonical-drawing-change-workspace";
import type { DrawingPreviewSlotModel } from "@/lib/pdm-entity-detail-contract";

afterEach(() => vi.unstubAllGlobals());
it.each(["application/pdf; charset=binary", " Application/PDF "])("labels a PDF MIME consistently without overriding a specific role: %s", mime_type => {
  expect(fileRoleLabel({ role: "other", mime_type })).toBe("PDF 圖面");
  expect(fileRoleLabel({ role: "cad_3d", mime_type })).toBe("3D 模型");
  expect(fileRoleLabel({ role: "other", mime_type: "application/pdfx" })).toBe("其他檔案");
});
it("renders the original download on a terminal preview card without adding a retry", () => {
  vi.stubGlobal("React", React);
  const slot: DrawingPreviewSlotModel = { kind: "two-d", title: "2D 圖面", fileName: "drawing.slddrw",
    state: "unavailable", stateTitle: "預覽已取消", stateText: "可下載原檔。", mediaHref: null,
    downloadHref: "/controlled-original", retryCommandRef: null };
  const html = renderToStaticMarkup(<DrawingCanonicalPreview previews={[{ ...slot, kind: "three-d", downloadHref: null }, slot]} />);
  expect(html).toContain('href="/controlled-original"');
  expect(html).toContain("下載原檔");
  expect(html).not.toContain("重新整理預覽");
});
it("starts the protected preview request for an automatically recovered queued slot", () => {
  vi.stubGlobal("React", React);
  const queued: DrawingPreviewSlotModel = { kind: "three-d", title: "3D 模型", fileName: "model.sldprt",
    state: "queued", stateTitle: "等待已連結的解析電腦", stateText: "自動重新排入佇列。",
    mediaHref: "/protected-preview", downloadHref: "/controlled-original", retryCommandRef: null };
  const missing: DrawingPreviewSlotModel = { ...queued, kind: "two-d", title: "2D 圖面", fileName: null,
    state: "missing", stateTitle: "無可用預覽", stateText: "目前沒有可預覽的 2D 檔案。",
    mediaHref: null, downloadHref: null };
  const html = renderToStaticMarkup(<DrawingCanonicalPreview previews={[queued, missing]} />);
  expect(html).toContain("預覽正在準備");
  expect(html).not.toContain("等待已連結的解析電腦");
});
