export const READER_COMMIT = "30bd63845d3532cdecfdf2654e9cc0871229c45a";
export const MAX_INPUT_BYTES = 256 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const unavailable = () => ({ availability: "unsupported_by_public_api" });
function properties(values, scope, config = {}) {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("properties_invalid");
  const entries = Object.entries(values);
  if (entries.length > 2000) throw new Error("property_count_exceeded");
  return entries.map(([name, storedValue]) => {
    if (!name || name.length > 4096 || typeof storedValue !== "string" || storedValue.length > 65536)
      throw new Error("property_value_invalid");
    return { name, storedValue, scope, ...config, propertyType: unavailable(),
      linkedExpression: unavailable(), evaluatedValue: unavailable() };
  });
}
export function normalize(payload, source) {
  if (!source || !/^[a-f0-9]{64}$/.test(source.sha256) ||
      !Number.isSafeInteger(source.bytes) || source.bytes < 1 || source.bytes > MAX_INPUT_BYTES)
    throw new Error("source_binding_invalid");
  if (payload?.schemaVersion !== "aipdm.openswx-public-api.v1") throw new Error("reader_schema_invalid");
  const base = { schemaVersion: "aipdm.openswx-feasibility.v1", source,
    reader: { name: "OpenSWX", commit: READER_COMMIT }, semanticEquivalence: "unknown_pending_human_ground_truth" };
  if (payload.status === "failed") {
    const acceptedCodes = new Set(["input_argument_invalid", "input_not_regular_file", "input_size_out_of_bounds",
      "input_extension_unsupported", "library_open_rejected", "output_limit_exceeded", "reader_exception"]);
    if (!Array.isArray(payload.diagnostics) || payload.diagnostics.some(code => !acceptedCodes.has(code)))
      throw new Error("reader_diagnostic_invalid");
    return { ...base, outcome: "failed", properties: [], diagnostics: payload.diagnostics };
  }
  if (payload.status !== "opened" || !["part", "assembly", "drawing"].includes(payload.documentType) ||
      !Number.isSafeInteger(payload.version) || payload.version < 0 || !Array.isArray(payload.configurations) ||
      payload.configurations.length > 1000 || !Number.isSafeInteger(payload.sheetCount) || payload.sheetCount < 0)
    throw new Error("reader_document_invalid");
  const inferred = { ".sldprt": "part", ".sldasm": "assembly", ".slddrw": "drawing" }[source.extension?.toLowerCase()];
  if (!inferred || inferred !== payload.documentType) throw new Error("extension_type_mismatch");
  if (payload.documentType === "drawing" && payload.configurations.length) throw new Error("drawing_configs_invalid");
  const mapped = properties(payload.globalProperties, "document_global");
  const configurations = payload.configurations.map(cfg => {
    if (!cfg || typeof cfg.name !== "string" || cfg.name.length > 4096 ||
        !Number.isSafeInteger(cfg.index) || cfg.index < 0) throw new Error("configuration_invalid");
    const rows = properties(cfg.effectiveProperties, "configuration_effective_merged",
      { configurationName: cfg.name, configurationIndex: cfg.index });
    mapped.push(...rows);
    return { index: cfg.index, name: cfg.name, nameAvailability: cfg.name ? "library_resolved_source_unknown" : "unknown",
      propertyCount: rows.length };
  });
  return { ...base, outcome: "partial", documentType: payload.documentType,
    documentTypeProvenance: "extension_inferred",
    version: { value: payload.version || null, availability: payload.version ? "internal_numeric" : "absent_or_unparsed" },
    configurations, sheetCount: payload.sheetCount, properties: mapped,
    coverage: { storedValues: mapped.length ? "observed_not_completeness_proof" : "empty_unknown",
      rawValue: "unsupported_by_public_api", evaluatedValue: "unsupported_by_public_api",
      propertyType: "unsupported_by_public_api", linkedExpression: "unsupported_by_public_api",
      pureConfigurationScope: "unsupported_effective_merged_map", streamParseIntegrity: "unknown_silent_skip_possible" },
    diagnostics: ["public_api_value_kinds_incomplete", "configuration_scope_merged", "stream_integrity_not_exposed",
      ...(mapped.length ? [] : ["empty_properties_not_proof_of_absence"])] };
}
