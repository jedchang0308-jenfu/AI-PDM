import React from "react";
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DrawingRecognitionWorkspacePanel, OpenSwxAuxiliaryView, openSwxUiActivity, reduceOpenSwxErrors } from "./drawing-recognition-workspace-panel";
const now = Date.parse("2026-10-05T00:01:00Z");
const job = { id: "job", status: "running", dispatchState: "dispatched", heartbeatAt: new Date(now - 1000).toISOString(), leaseExpiresAt: new Date(now + 60_000).toISOString(), result: null };
const view = (overrides: Partial<React.ComponentProps<typeof OpenSwxAuxiliaryView>> = {}) => renderToStaticMarkup(<OpenSwxAuxiliaryView state={{ configured: true, job }} error="" now={now} disabled={false} busy={false} selectedCount={1} onRead={() => {}} onCancel={() => {}} {...overrides} />);
describe("OpenSWX readonly panel rendering and caller source binding (browser interactions owned by root)", () => {
  it("successful GET refresh clears only refresh error after a failed POST", () => {
    let errors = { actionError: "", refreshError: "" };
    errors = reduceOpenSwxErrors(errors, { kind: "action_started" });
    errors = reduceOpenSwxErrors(errors, { kind: "action_failed", message: "取消失敗" });
    errors = reduceOpenSwxErrors(errors, { kind: "refresh_failed" });
    errors = reduceOpenSwxErrors(errors, { kind: "refresh_succeeded" });
    expect(errors).toEqual({ actionError: "取消失敗", refreshError: "" });
    expect(view({ error: errors.actionError })).toContain("取消失敗");
    expect(view({ error: errors.actionError })).not.toContain("dev122-openswx-spin");
    expect(reduceOpenSwxErrors(errors, { kind: "action_started" }).actionError).toBe("");
  });
  it("same completed/failed/cancelled binding has no retry CTA and unconfigured queued work stays visibly retained", () => {
    for (const status of ["completed", "failed", "cancelled"]) {
      const html = view({ state: { configured: true, job: { ...job, status, dispatchState: "terminal" } } });
      expect(html).toContain('disabled=""'); expect(html).not.toMatch(/>取消<|dev122-openswx-spin|等待自動排程/u);
    }
    const html = view({ state: { configured: false, job: { ...job, status: "queued", dispatchState: "due" } } });
    expect(html).toContain("排程已保留，待服務配置"); expect(html).toContain('disabled=""'); expect(html).not.toMatch(/等待自動排程|dev122-openswx-spin/u);
    expect(view({ state: { configured: false, job: null } })).toContain('disabled=""');
  });
  it("fresh active lease alone animates; unknown/API error/stale/disabled activity stops", () => {
    expect(openSwxUiActivity({ configured: true, job }, "", now)).toBe(true);
    expect(view()).toContain("dev122-openswx-spin");
    for (const state of [{ configured: false, job }, { configured: true, job: { ...job, dispatchState: "dispatch_unknown" } }, { configured: true, job: { ...job, heartbeatAt: new Date(now - 15_001).toISOString() } }, { configured: true, job: { ...job, leaseExpiresAt: new Date(now).toISOString() } }]) {
      expect(openSwxUiActivity(state, "", now)).toBe(false); expect(view({ state })).not.toContain("dev122-openswx-spin");
    }
    expect(view({ error: "API 讀取失敗" })).not.toContain("dev122-openswx-spin");
    expect(view({ state: { configured: true, job: { ...job, status: "queued", dispatchState: "due" } } })).toContain("等待自動排程（每 5 分鐘）");
    expect(fs.readFileSync(new URL("./drawing-recognition-workspace-panel.module.css", import.meta.url), "utf8")).toMatch(/prefers-reduced-motion[\s\S]*animation:\s*none/u);
  });
  it("normal caller preserves mixed DM sources and supplies a separate CAD-only selection for one auxiliary CTA", () => {
    const source = fs.readFileSync(new URL("./canonical-drawing-change-workspace.tsx", import.meta.url), "utf8");
    expect(source).toContain("file_ext?:");
    expect(source).toMatch(/auxiliarySourceAssetIds = useMemo\([\s\S]*?sldprt[\s\S]*?sldasm[\s\S]*?slddrw/u);
    expect(source).toContain("sourceAssetIds={sourceAssetIds}");
    expect(source).toContain("auxiliarySourceAssetIds={auxiliarySourceAssetIds}");
    // Render actual normal panel with its DM CAD+PDF selection and distinct supported CAD selection.
    const html = renderToStaticMarkup(<DrawingRecognitionWorkspacePanel drawingNumber="fixture" sourceContextType="drawing_revision" sourceContextId="revision" sourceAssetIds={["cad", "pdf"]} auxiliarySourceAssetIds={["cad"]} />);
    expect(html.match(/讀取輔助屬性<\/button>/gu)).toHaveLength(1);
    expect(html).not.toContain("沒有支援的 CAD 來源");
  });
  it("a terminal dispatch fence is stopped, with no pending claim, spinner or executable CTA", () => {
    for (const status of ["queued", "running"]) {
      const state = { configured: true, job: { ...job, status, dispatchState: "terminal" } };
      const html = view({ state });
      expect(html).toContain("讀取已停止，來源或權限需重新確認");
      expect(html).not.toMatch(/等待自動排程|dev122-openswx-spin|>取消<|派送結果待確認/u);
      expect(html).toContain('disabled=""');
      expect(openSwxUiActivity(state, "", now)).toBe(false);
    }
  });
  it("snapshot has no auxiliary component; auxiliary hook calls only context GET/enqueue/cancel", () => {
    const html = renderToStaticMarkup(<DrawingRecognitionWorkspacePanel drawingNumber="fixture" sourceContextType="drawing_revision" sourceContextId="revision" sourceAssetIds={["cad", "pdf"]} auxiliarySourceAssetIds={["cad"]} snapshotProjection={null} disabled />);
    expect(html).not.toContain("dev122-openswx");
    const source = fs.readFileSync(new URL("./drawing-recognition-workspace-panel.tsx", import.meta.url), "utf8");
    const auxiliary = source.slice(source.indexOf("function OpenSwxAuxiliaryPanel"), source.indexOf("function NativeMetadataHealthBanner"));
    expect(auxiliary).toContain("/api/numbering/openswx-metadata/");
    expect(auxiliary).not.toMatch(/createSession|recognition-sessions|recoverOpenSwx|native-metadata/u);
    expect(source.indexOf("!snapshotMode ? <OpenSwxAuxiliaryPanel")).toBeLessThan(source.indexOf("{restricted ? <div"));
  });
  it("stored properties remain readonly with truthful coverage/scope and unsupported availability", () => {
    const result = { results: [{ source: { id: "cad", sha256: "a".repeat(64) }, reader: { commit: "fixed" }, outcome: "partial", documentType: "part", documentTypeProvenance: "extension_inferred", semanticEquivalence: "unknown_pending_human_ground_truth", version: { value: 42, availability: "internal_numeric" }, configurations: [{ index: 0, name: "展開", nameAvailability: "library_resolved_source_unknown", propertyCount: 1 }, { index: 1, name: "", nameAvailability: "unknown", propertyCount: 0 }], diagnostics: ["configuration_scope_merged", "stream_integrity_not_exposed"], coverage: { storedValues: "partial", configurations: "partial", propertyType: "unsupported_by_public_api", linkedExpression: "unsupported", evaluatedValue: "unsupported", version: "unverified", drawingScopes: "unsupported" }, properties: [{ name: "材料", storedValue: "本體", valueAvailability: "stored_string" as const, scope: "configuration_effective_merged" as const, configurationIndex: 0, configurationName: "展開", propertyType: { availability: "unsupported_by_public_api" as const }, linkedExpression: { availability: "unsupported_by_public_api" as const }, evaluatedValue: { availability: "unsupported_by_public_api" as const } }] }] };
    const html = view({ state: { configured: true, job: { ...job, status: "completed", result } } });
    expect(html).toContain("本體"); expect(html).toContain("有效合併值"); expect(html).toContain("部分");
    expect(html).not.toMatch(/<input|<select|contenteditable|確認寫入/u);
    expect(html).toContain("unsupported_by_public_api");
    for (const value of ["extension_inferred", "internal_numeric", "library_resolved_source_unknown", "unknown_pending_human_ground_truth", "未知組態名稱", "configuration_scope_merged", "stream_integrity_not_exposed"]) expect(html).toContain(value);
  });
});
