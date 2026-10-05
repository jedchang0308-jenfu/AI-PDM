import crypto from "node:crypto";

export const OPENSWX_READER = Object.freeze({ id: "openswx-metadata-reader", commit: "30bd63845d3532cdecfdf2654e9cc0871229c45a", schema: "aipdm.openswx-auxiliary.v1" } as const);
export const OPENSWX_LIMITS = Object.freeze({ sources: 8, sourceBytes: 256 * 1024 * 1024, resultBytes: 2 * 1024 * 1024, leaseMs: 60_000, attempts: 2 });
export class OpenSwxMetadataError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); }
}
export type OpenSwxSource = Readonly<{ id: string; fileAssetId: string; sha256: string; bytes: number; extension: string; storageGeneration: string | null }>;
export type OpenSwxInitiator = Readonly<{ principalId: string; employeeId: string; pdmUserId: string; companyId: string; identityIssuer: string; identitySubject: string; profileVersion: number; accountLifecycleVersion: number; authEpoch: number; authenticatedAt: string; sessionIssuedAt: string }>;
export type OpenSwxFence = Readonly<{ jobId: string; companyId: string; attempt: number; sourceSetFingerprint: string; readerCommit: string; executionName: string }>;
export type OpenSwxProperty = { name: string; storedValue: string; valueAvailability: "stored_string" | "stored_empty_string"; scope: "document_global" | "configuration_effective_merged"; configurationIndex?: number; configurationName?: string; propertyType: { availability: "unsupported_by_public_api" }; linkedExpression: { availability: "unsupported_by_public_api" }; evaluatedValue: { availability: "unsupported_by_public_api" } };
const unsupported = "unsupported_by_public_api" as const;
const failureCodes = ["input_argument_invalid", "input_not_regular_file", "input_size_out_of_bounds", "input_extension_unsupported", "library_open_rejected", "output_limit_exceeded", "reader_exception"];
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OpenSwxMetadataError("OPENSWX_RESULT_INVALID", 400);
  return value as Record<string, unknown>;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max; }
export function requireOpenSwxSources(sources: readonly OpenSwxSource[]) {
  if (!Array.isArray(sources) || !sources.length || sources.length > OPENSWX_LIMITS.sources || new Set(sources.map(s => s.id)).size !== sources.length || new Set(sources.map(s => s.fileAssetId)).size !== sources.length) throw new OpenSwxMetadataError("OPENSWX_SOURCE_COUNT_INVALID", 413);
  for (const s of sources) if (!s.id || !s.fileAssetId || !/^[a-f0-9]{64}$/u.test(s.sha256) || !integer(s.bytes, OPENSWX_LIMITS.sourceBytes) || s.bytes < 1 || !["sldprt", "sldasm", "slddrw"].includes(s.extension)) throw new OpenSwxMetadataError("OPENSWX_SOURCE_BINDING_INVALID", 413);
}
/** Normalize only the pinned public API: no native DM adapter, inferred raw values, or truncation. */
export function normalizeOpenSwxResult(payload: unknown, source: OpenSwxSource) {
  requireOpenSwxSources([source]);
  const p = record(payload);
  if (p.schemaVersion !== "aipdm.openswx-public-api.v1") throw new OpenSwxMetadataError("OPENSWX_READER_SCHEMA_INVALID", 400);
  const properties: OpenSwxProperty[] = [];
  const coverage = { storedValues: "empty_unknown", rawValue: unsupported, evaluatedValue: unsupported, propertyType: unsupported, linkedExpression: unsupported, pureConfigurationScope: "unsupported_effective_merged_map", streamParseIntegrity: "unknown_silent_skip_possible" };
  const base = { source, reader: OPENSWX_READER, semanticEquivalence: "unknown_pending_human_ground_truth", coverage, properties };
  if (p.status === "failed") {
    if (!Array.isArray(p.diagnostics) || !p.diagnostics.length || p.diagnostics.some(c => typeof c !== "string" || !failureCodes.includes(c))) throw new OpenSwxMetadataError("OPENSWX_DIAGNOSTIC_INVALID", 400);
    return { ...base, outcome: "failed", diagnostics: [...new Set(p.diagnostics as string[])].sort() };
  }
  const type = { sldprt: "part", sldasm: "assembly", slddrw: "drawing" }[source.extension];
  if (p.status !== "opened" || p.documentType !== type || !integer(p.version) || !integer(p.sheetCount) || !Array.isArray(p.configurations) || p.configurations.length > 1000 || (type === "drawing" && p.configurations.length)) throw new OpenSwxMetadataError("OPENSWX_DOCUMENT_INVALID", 400);
  function map(values: unknown, scope: OpenSwxProperty["scope"], cfg?: { configurationIndex: number; configurationName: string }) {
    const entries = Object.entries(record(values)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    if (entries.length > 2000) throw new OpenSwxMetadataError("OPENSWX_PROPERTY_COUNT_LIMIT", 413);
    for (const [name, storedValue] of entries) {
      if (!name || name.length > 4096 || typeof storedValue !== "string" || storedValue.length > 65536) throw new OpenSwxMetadataError("OPENSWX_PROPERTY_INVALID", 400);
      properties.push({ name, storedValue, valueAvailability: storedValue ? "stored_string" : "stored_empty_string", scope, ...cfg, propertyType: { availability: unsupported }, linkedExpression: { availability: unsupported }, evaluatedValue: { availability: unsupported } });
    }
  }
  map(p.globalProperties, "document_global");
  const seen = new Set<number>();
  const configurations = [...p.configurations].sort((a, b) => Number(record(a).index) - Number(record(b).index)).map(value => {
    const c = record(value);
    if (!integer(c.index) || typeof c.name !== "string" || c.name.length > 4096 || seen.has(Number(c.index))) throw new OpenSwxMetadataError("OPENSWX_CONFIGURATION_INVALID", 400);
    seen.add(Number(c.index));
    const before = properties.length;
    map(c.effectiveProperties, "configuration_effective_merged", { configurationIndex: Number(c.index), configurationName: c.name });
    return { index: Number(c.index), name: c.name, nameAvailability: c.name ? "library_resolved_source_unknown" : "unknown", propertyCount: properties.length - before };
  });
  coverage.storedValues = properties.length ? "observed_not_completeness_proof" : "empty_unknown";
  return { ...base, outcome: "partial", documentType: type, documentTypeProvenance: "extension_inferred", version: { value: p.version || null, availability: p.version ? "internal_numeric" : "absent_or_unparsed" }, configurations, sheetCount: p.sheetCount, diagnostics: ["public_api_value_kinds_incomplete", "configuration_scope_merged", "stream_integrity_not_exposed", ...(properties.length ? [] : ["empty_properties_not_proof_of_absence"])] };
}
export function encodeOpenSwxCompletion(sources: readonly OpenSwxSource[], results: readonly { sourceId: string; payload: unknown }[]) {
  requireOpenSwxSources(sources);
  if (!Array.isArray(results) || results.length !== sources.length || new Set(results.map(r => r.sourceId)).size !== results.length) throw new OpenSwxMetadataError("OPENSWX_RESULT_SOURCES_INVALID", 400);
  const normalized = sources.map(source => {
    const input = results.find(r => r.sourceId === source.id);
    if (!input) throw new OpenSwxMetadataError("OPENSWX_RESULT_SOURCES_INVALID", 400);
    return normalizeOpenSwxResult(input.payload, source);
  });
  const json = JSON.stringify({ schemaVersion: OPENSWX_READER.schema, results: normalized });
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes > OPENSWX_LIMITS.resultBytes) throw new OpenSwxMetadataError("OPENSWX_RESULT_SIZE_LIMIT", 413);
  return { json, bytes, digest: crypto.createHash("sha256").update(json).digest("hex") };
}
