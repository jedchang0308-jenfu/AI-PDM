const SAFE_DIAGNOSTIC_CODE = /^(?:[A-Z][A-Z0-9_]{0,95}|local_[a-z0-9_]{1,96}|principal_[a-z0-9_]{1,96}|entitlement_[a-z0-9_]{1,96}|[0-9A-Z]{5})$/u;
const SAFE_DIAGNOSTIC_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;

export type LocalPrincipalDiagnosticStage =
  | "principal_request_input"
  | "principal_guard_state"
  | "principal_guard_evaluator"
  | "local_sandbox_callback"
  | "principal_http_boundary";

/** Log only fixed stage, sanitized error name and stable error/SQLSTATE code in the local dev lane. */
export function reportLocalPrincipalDiagnostic(stage: LocalPrincipalDiagnosticStage, error: unknown,
  environment: Record<string, string | undefined> = process.env) {
  if (environment.NODE_ENV !== "development" || environment.PDM_LOCAL_PRINCIPAL_SANDBOX !== "1") return;

  const name = error instanceof Error && SAFE_DIAGNOSTIC_NAME.test(error.name) ? error.name : "Error";
  const candidateCode = error instanceof Error
    ? (error as Error & { code?: unknown }).code ?? error.message
    : undefined;
  const code = typeof candidateCode === "string" && SAFE_DIAGNOSTIC_CODE.test(candidateCode)
    ? candidateCode : "unclassified";
  console.error("[ai-pdm-local-principal]", { stage, name, code });
}
