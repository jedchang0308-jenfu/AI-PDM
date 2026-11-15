import { AsyncLocalStorage } from "node:async_hooks";

const TEST_EMPLOYEE_ID = "JFS9014";
const MAX_ACTIVE_WINDOW_MS = 36 * 60 * 60 * 1000;

type DiagnosticKind = "sso_callback" | "drawing_workbench" | "part_workbench";
type DiagnosticScope = {
  kind: DiagnosticKind;
  traceId: string | null;
  verifiedTestPrincipal: boolean;
  databaseQueryCount: number;
  upstreamQueryCount: number;
  permissionCalculationCount: number;
  localSessionReadCount: number;
};

const scopes = new AsyncLocalStorage<DiagnosticScope>();

export function pdmPermissionDiagnosticEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now = Date.now()
) {
  if (environment.PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS !== "1") return false;
  const until = Date.parse(environment.PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS_UNTIL ?? "");
  return Number.isFinite(until) && until > now && until - now <= MAX_ACTIVE_WINDOW_MS;
}

function requestTraceId(request: Request) {
  const trace = request.headers.get("x-cloud-trace-context")?.split("/", 1)[0];
  if (trace && /^[0-9a-f]{32}$/iu.test(trace)) return trace.toLowerCase();
  const traceparent = request.headers.get("traceparent");
  const match = traceparent && /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/iu.exec(traceparent);
  return match?.[1]?.toLowerCase() ?? null;
}

function emit(scope: DiagnosticScope, status: number | null) {
  if (!scope.verifiedTestPrincipal) return;
  const event: Record<string, unknown> = {
    event: "pdm_short_lived_permission_diagnostic",
    requestKind: scope.kind,
    outcome: status !== null && status >= 200 && status < 400 ? "success" : "non_success",
    httpStatus: status,
    databaseQueryCount: scope.databaseQueryCount,
    upstreamQueryCount: scope.upstreamQueryCount,
    permissionCalculationCount: scope.permissionCalculationCount,
    localSessionReadCount: scope.localSessionReadCount
  };
  if (scope.traceId) event["logging.googleapis.com/trace"] = `projects/jenfu-platform-prod/traces/${scope.traceId}`;
  console.info(JSON.stringify(event));
}

export async function withPdmShortLivedPermissionDiagnostic<T>(
  kind: DiagnosticKind,
  request: Request,
  verifiedEmployeeId: string | undefined,
  action: () => Promise<T>
): Promise<T> {
  if (!pdmPermissionDiagnosticEnabled()) return await action();
  const scope: DiagnosticScope = {
    kind,
    traceId: requestTraceId(request),
    verifiedTestPrincipal: verifiedEmployeeId === TEST_EMPLOYEE_ID,
    databaseQueryCount: 0,
    upstreamQueryCount: 0,
    permissionCalculationCount: 0,
    localSessionReadCount: 0
  };
  return await scopes.run(scope, async () => {
    let status: number | null = null;
    try {
      const result = await action();
      if (result instanceof Response) status = result.status;
      return result;
    } finally {
      emit(scope, status);
    }
  });
}

export function markPdmDiagnosticVerifiedEmployee(employeeId: string) {
  const scope = scopes.getStore();
  if (scope) scope.verifiedTestPrincipal = employeeId === TEST_EMPLOYEE_ID;
}

export function recordPdmDiagnosticDatabaseQuery(sql: string) {
  const scope = scopes.getStore();
  if (!scope) return;
  scope.databaseQueryCount += 1;
  if (/\b(?:orgmaster_contract|platform_contract)\s*\.|\bread_principal_session_authority_v2\s*\(/iu.test(sql)) {
    scope.upstreamQueryCount += 1;
  }
  if (/\bread_principal_session_authority_v2\s*\(/iu.test(sql)) {
    scope.permissionCalculationCount += 1;
  }
  if (/\bprincipal_session_records\b/iu.test(sql)) scope.localSessionReadCount += 1;
}
