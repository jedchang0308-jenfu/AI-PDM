export type NativeMetadataHealth = {
  state: "ready" | "empty" | "partial" | "unavailable" | "failed";
  issueCode: string | null;
  message: string | null;
  retryable: boolean;
  affectedSources: Array<{ sourceId: string; fileName: string; status: string }>;
};

type AdapterResultRow = {
  source_id: string;
  adapter_code: string;
  status: string;
  observation_count: number | string;
  diagnostics_json: string | null;
};

type HealthSource = { id: string; fileName: string };

const diagnosticMessages: Record<string, { message: string; retryable: boolean }> = {
  native_metadata_not_configured: { message: "此批辨識執行時未取得 SolidWorks 屬性資料；若設定已啟用，請重新辨識。", retryable: false },
  native_metadata_license_missing: { message: "SolidWorks 屬性讀取器尚未取得可用授權；目前只顯示其他可用辨識結果。", retryable: false },
  native_metadata_source_content_unavailable: { message: "SolidWorks 屬性讀取器暫時無法取得來源檔；可保留其他辨識結果並重新辨識。", retryable: true },
  native_metadata_hash_mismatch: { message: "來源檔內容已變更，SolidWorks 屬性結果未採用；請重新辨識。", retryable: true },
  native_metadata_timeout: { message: "SolidWorks 屬性讀取逾時；可保留其他辨識結果並重新辨識。", retryable: true },
  native_metadata_failed: { message: "SolidWorks 屬性讀取失敗；目前只顯示其他可用辨識結果，請聯絡管理員或重新辨識。", retryable: true },
  native_metadata_empty: { message: "已完成 SolidWorks 屬性讀取，這些檔案沒有可用的自訂屬性。", retryable: false }
};

function normalizeDiagnostic(value: string) {
  const text = value.toLowerCase();
  if (text.includes("not configured") || text.includes("cmd is not configured")) return "native_metadata_not_configured";
  if (text.includes("license") && (text.includes("missing") || text.includes("required"))) return "native_metadata_license_missing";
  if (text.includes("source") && (text.includes("content") || text.includes("http") || text.includes("unavailable"))) return "native_metadata_source_content_unavailable";
  if (text.includes("hash") && text.includes("mismatch")) return "native_metadata_hash_mismatch";
  if (text.includes("timeout") || text.includes("timed out")) return "native_metadata_timeout";
  return "native_metadata_failed";
}

function diagnosticsOf(row: AdapterResultRow) {
  if (!row.diagnostics_json) return [];
  try {
    const parsed = JSON.parse(row.diagnostics_json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

function issueOf(row: AdapterResultRow | undefined) {
  const first = diagnosticsOf(row ?? { diagnostics_json: null } as AdapterResultRow)[0];
  if (first) return normalizeDiagnostic(first);
  if (row?.status === "unsupported") return "native_metadata_not_configured";
  if (row?.status === "timeout") return "native_metadata_timeout";
  if (row?.status === "failed") return "native_metadata_failed";
  return null;
}

export function projectNativeMetadataHealth(input: {
  sessionStatus: string;
  sources: HealthSource[];
  adapterResults: AdapterResultRow[];
}): { nativeMetadata: NativeMetadataHealth | null } {
  if (["queued", "extracting"].includes(input.sessionStatus)) return { nativeMetadata: null };
  const nativeSources = input.sources.filter((source) => /\.(?:sldprt|sldasm|slddrw)$/iu.test(source.fileName));
  if (nativeSources.length === 0) return { nativeMetadata: null };
  const rows = input.adapterResults.filter((row) => row.adapter_code.startsWith("native-metadata"));
  const latestBySource = new Map<string, AdapterResultRow>();
  for (const row of rows) if (!latestBySource.has(row.source_id)) latestBySource.set(row.source_id, row);
  const effective = nativeSources.map((source) => latestBySource.get(source.id) ?? null);
  if (effective.length === 0 || effective.some((row) => row === null)) {
    return {
      nativeMetadata: {
        state: input.sessionStatus === "extraction_failed" ? "failed" : "unavailable",
        issueCode: input.sessionStatus === "extraction_failed" ? "native_metadata_failed" : "native_metadata_not_configured",
        message: diagnosticMessages[input.sessionStatus === "extraction_failed" ? "native_metadata_failed" : "native_metadata_not_configured"].message,
        retryable: input.sessionStatus === "extraction_failed",
        affectedSources: nativeSources.filter((source) => !latestBySource.has(source.id)).map((source) => ({ sourceId: source.id, fileName: source.fileName, status: "missing" }))
      }
    };
  }
  const bad = effective.filter((row) => row && !["succeeded"].includes(row.status)) as AdapterResultRow[];
  const good = effective.filter((row) => row?.status === "succeeded") as AdapterResultRow[];
  const affectedSources = nativeSources.filter((source) => {
    const row = latestBySource.get(source.id);
    return row ? row.status !== "succeeded" : true;
  }).map((source) => ({ sourceId: source.id, fileName: source.fileName, status: latestBySource.get(source.id)?.status ?? "missing" }));
  if (bad.length > 0 && good.length > 0) {
    const issueCode = issueOf(bad[0]);
    return { nativeMetadata: { state: "partial", issueCode, message: issueCode ? diagnosticMessages[issueCode].message : diagnosticMessages.native_metadata_failed.message, retryable: issueCode ? diagnosticMessages[issueCode].retryable : true, affectedSources } };
  }
  if (bad.length > 0) {
    const issueCode = issueOf(bad[0]);
    const unavailable = bad.every((row) => row.status === "unsupported");
    const finalCode = unavailable ? "native_metadata_not_configured" : issueCode ?? "native_metadata_failed";
    return { nativeMetadata: { state: unavailable ? "unavailable" : "failed", issueCode: finalCode, message: diagnosticMessages[finalCode].message, retryable: diagnosticMessages[finalCode].retryable, affectedSources } };
  }
  const hasObservations = good.some((row) => Number(row.observation_count) > 0);
  if (!hasObservations) return { nativeMetadata: { state: "empty", issueCode: "native_metadata_empty", message: diagnosticMessages.native_metadata_empty.message, retryable: false, affectedSources: [] } };
  return { nativeMetadata: { state: "ready", issueCode: null, message: null, retryable: false, affectedSources: [] } };
}
