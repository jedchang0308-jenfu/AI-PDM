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
