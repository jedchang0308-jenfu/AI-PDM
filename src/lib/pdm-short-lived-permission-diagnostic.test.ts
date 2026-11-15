import { afterEach, describe, expect, it, vi } from "vitest";
import {
  markPdmDiagnosticVerifiedEmployee,
  pdmPermissionDiagnosticEnabled,
  recordPdmDiagnosticDatabaseQuery,
  withPdmShortLivedPermissionDiagnostic
} from "@/lib/pdm-short-lived-permission-diagnostic";

const request = new Request("https://pdm.example/api/parts/workbench", {
  headers: { "x-cloud-trace-context": `${"a".repeat(32)}/123;o=1` }
});
const expiresAt = "2026-11-16T04:50:00Z";

afterEach(() => vi.restoreAllMocks());

describe("short-lived permission diagnostic", () => {
  it("fails closed unless enabled and within its bounded expiry", () => {
    expect(pdmPermissionDiagnosticEnabled({}, Date.parse("2026-11-15T04:50:00Z"))).toBe(false);
    expect(pdmPermissionDiagnosticEnabled({
      PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS: "1",
      PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS_UNTIL: expiresAt
    }, Date.parse("2026-11-15T04:50:00Z"))).toBe(true);
    expect(pdmPermissionDiagnosticEnabled({
      PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS: "1",
      PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS_UNTIL: expiresAt
    }, Date.parse(expiresAt))).toBe(false);
    expect(pdmPermissionDiagnosticEnabled({
      PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS: "1",
      PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS_UNTIL: "2026-11-20T00:00:00Z"
    }, Date.parse("2026-11-15T04:50:00Z"))).toBe(false);
  });

  it("counts only verified JFS9014 request SQL and emits sanitized correlated counters", async () => {
    vi.stubEnv("PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS", "1");
    vi.stubEnv("PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS_UNTIL", expiresAt);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await withPdmShortLivedPermissionDiagnostic(
      "part_workbench", request, undefined, async () => {
        recordPdmDiagnosticDatabaseQuery("SELECT * FROM ai_pdm_core.principal_session_records WHERE principal_id=$1");
        markPdmDiagnosticVerifiedEmployee("JFS9014");
        recordPdmDiagnosticDatabaseQuery("SELECT ai_pdm_core.read_principal_session_authority_v2($1,$2,$3,$4,$5)");
        recordPdmDiagnosticDatabaseQuery("SELECT * FROM ai_pdm_core.users WHERE id=$1");
        return Response.json({ ok: true });
      });
    expect(result.status).toBe(200);
    expect(log).toHaveBeenCalledOnce();
    const event = JSON.parse(String(log.mock.calls[0][0]));
    expect(event).toMatchObject({
      event: "pdm_short_lived_permission_diagnostic",
      requestKind: "part_workbench",
      outcome: "success",
      httpStatus: 200,
      databaseQueryCount: 3,
      upstreamQueryCount: 1,
      permissionCalculationCount: 1,
      localSessionReadCount: 1,
      "logging.googleapis.com/trace": `projects/jenfu-platform-prod/traces/${"a".repeat(32)}`
    });
    expect(JSON.stringify(event)).not.toContain("JFS9014");
    expect(JSON.stringify(event)).not.toContain("principal_session_records");
  });

  it("does not emit for another employee or after the diagnostic window closes", async () => {
    vi.stubEnv("PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS", "1");
    vi.stubEnv("PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS_UNTIL", expiresAt);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await withPdmShortLivedPermissionDiagnostic("drawing_workbench", request,
      "JFS0001", async () => Response.json({ ok: true }));
    vi.stubEnv("PDM_SHORT_LIVED_PERMISSION_DIAGNOSTICS", "0");
    await withPdmShortLivedPermissionDiagnostic("drawing_workbench", request,
      "JFS9014", async () => Response.json({ ok: true }));
    expect(log).not.toHaveBeenCalled();
  });
});
