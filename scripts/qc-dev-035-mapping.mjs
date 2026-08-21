import assert from "node:assert/strict";
import { mapNativePropertiesToAdapterResult } from "../src/lib/solidworks-metadata-mapping.ts";
import { projectNativeMetadataHealth } from "../src/lib/drawing-recognition-diagnostics.ts";

const targetContext = { drawingId: "drawing-a0002", drawingRevisionId: "revision-a0002", parts: [{ id: "part-a0002-p01", partNumber: "A0002-P01", partName: "本體_BS_右_Xx5", recordStatus: "Draft" }] };
const result = mapNativePropertiesToAdapterResult({
  sourceId: "source-a0002", fileName: "A0002.SLDPRT", fileExt: ".SLDPRT", targetContext,
  properties: [
    { scope: "document", name: "品名", evaluatedValue: "本體_BS_右_Xx5" },
    { scope: "document", name: "3D圖號(主)", evaluatedValue: "A0002" },
    { scope: "document", name: "版次", evaluatedValue: "0.1" },
    { scope: "document", name: "製圖", evaluatedValue: "朱宇鴻" },
    { scope: "configuration:展開", name: "料號", linkedExpression: "A0002-P01", evaluatedValue: "" },
    { scope: "configuration:展開", name: "材質", linkedExpression: "不鏽鋼SUS304", evaluatedValue: "" },
    { scope: "configuration:展開", name: "表面處理", linkedExpression: "無", evaluatedValue: "" },
    { scope: "configuration:展開", name: "熱處理", linkedExpression: "無", evaluatedValue: "" },
    { scope: "document", name: "自訂備註", evaluatedValue: "保留" }
  ]
});
const byKey = new Map((result.observations ?? []).map((observation) => [observation.fieldKey, observation]));
for (const [key, value] of [["part_name", "本體_BS_右_Xx5"], ["model_root_number", "A0002"], ["revision", "0.1"], ["drawn_by_name", "朱宇鴻"], ["part_number", "A0002-P01"], ["material", "不鏽鋼SUS304"], ["surface_finish", "無"], ["heat_treatment", "無"]]) {
  assert.equal(byKey.get(key)?.rawValue, value, `expected ${key}`);
}
assert.equal(byKey.get("part_name")?.proposedOwnerId, "part-a0002-p01");
assert.equal(byKey.get("material")?.confidenceBand, "high");
assert.equal(result.status, "succeeded");
assert.ok([...byKey.keys()].some((key) => key?.startsWith("sw_custom_")));
const unresolvedLink = mapNativePropertiesToAdapterResult({
  sourceId: "source-linked", fileName: "A0002.SLDPRT", fileExt: ".SLDPRT", targetContext,
  properties: [{ scope: "document", name: "3D圖號(主)", linkedExpression: '$PRP:"SW-File Name"', evaluatedValue: "" }]
});
assert.equal(unresolvedLink.observations?.[0]?.rawValue, null);
const ambiguous = mapNativePropertiesToAdapterResult({
  sourceId: "source-ambiguous", fileName: "A0002.SLDASM", fileExt: ".SLDASM",
  targetContext: { drawingId: "drawing-a0002", drawingRevisionId: "revision-a0002", parts: [...targetContext.parts, { id: "part-a0002-p02", partNumber: "A0002-P02", partName: "另一件", recordStatus: "Draft" }] },
  properties: [{ scope: "document", name: "材質", evaluatedValue: "不鏽鋼SUS304" }]
});
assert.equal(ambiguous.observations?.[0]?.proposedOwnerResolution, "ambiguous");
const healthSources = [{ id: "source-a", fileName: "A.SLDPRT" }, { id: "source-b", fileName: "B.SLDDRW" }];
const health = (rows) => projectNativeMetadataHealth({ sessionStatus: "review_ready", sources: healthSources, adapterResults: rows });
assert.equal(health([
  { source_id: "source-a", adapter_code: "native-metadata-bridge.v1", status: "succeeded", observation_count: 2, diagnostics_json: "[]" },
  { source_id: "source-b", adapter_code: "native-metadata-bridge.v1", status: "succeeded", observation_count: 1, diagnostics_json: "[]" }
]).nativeMetadata?.state, "ready");
assert.equal(health([
  { source_id: "source-a", adapter_code: "native-metadata-bridge.v1", status: "succeeded", observation_count: 0, diagnostics_json: "[]" },
  { source_id: "source-b", adapter_code: "native-metadata-bridge.v1", status: "succeeded", observation_count: 0, diagnostics_json: "[]" }
]).nativeMetadata?.state, "empty");
assert.equal(health([
  { source_id: "source-a", adapter_code: "native-metadata-bridge.v1", status: "succeeded", observation_count: 2, diagnostics_json: "[]" },
  { source_id: "source-b", adapter_code: "native-metadata-bridge.v1", status: "failed", observation_count: 0, diagnostics_json: '["native_metadata_timeout"]' }
]).nativeMetadata?.state, "partial");
assert.equal(health([
  { source_id: "source-a", adapter_code: "native-metadata-bridge.v1", status: "unsupported", observation_count: 0, diagnostics_json: '["PDM_DRAWING_RECOGNITION_METADATA_CMD is not configured."]' },
  { source_id: "source-b", adapter_code: "native-metadata-bridge.v1", status: "unsupported", observation_count: 0, diagnostics_json: '["PDM_DRAWING_RECOGNITION_METADATA_CMD is not configured."]' }
]).nativeMetadata?.state, "unavailable");
assert.equal(health([
  { source_id: "source-a", adapter_code: "native-metadata-bridge.v1", status: "failed", observation_count: 0, diagnostics_json: '["native_metadata_license_missing"]' },
  { source_id: "source-b", adapter_code: "native-metadata-bridge.v1", status: "failed", observation_count: 0, diagnostics_json: '["native_metadata_license_missing"]' }
]).nativeMetadata?.state, "failed");
assert.equal(projectNativeMetadataHealth({
  sessionStatus: "extraction_partial",
  sources: [...healthSources, { id: "source-pdf", fileName: "A.pdf" }],
  adapterResults: [
    { source_id: "source-a", adapter_code: "native-metadata-bridge.v1", status: "succeeded", observation_count: 2, diagnostics_json: "[]" },
    { source_id: "source-b", adapter_code: "native-metadata-bridge.v1", status: "succeeded", observation_count: 1, diagnostics_json: "[]" },
    { source_id: "source-pdf", adapter_code: "native-metadata-bridge.v1", status: "failed", observation_count: 0, diagnostics_json: '["native_metadata_failed"]' }
  ]
}).nativeMetadata?.state, "ready");
console.log(JSON.stringify({ script: "qc-dev-035-mapping", passed: true, observations: result.observations?.length, ambiguousResolution: ambiguous.observations?.[0]?.proposedOwnerResolution, healthStates: ["ready", "empty", "partial", "unavailable", "failed"] }, null, 2));
