import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { isProductionSliceAllowedApiMutation, isProductionSliceOpenPagePath, productionSliceClientStatus } from "@/lib/production-slice";

const active = { NODE_ENV: "production", PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft" };
const commands = [
  "/api/settings/secrets/solidworks_document_manager/draft",
  "/api/settings/secrets/reference-one/test", "/api/settings/secrets/reference-one/activate",
  "/api/settings/secrets/reference-one/revoke", "/api/settings-secret-probe-jobs/claim",
  "/api/settings-secret-probe-jobs/job-one/heartbeat", "/api/settings-secret-probe-jobs/job-one/complete",
  "/api/recognition-workers/heartbeat"
];
afterEach(() => vi.unstubAllEnvs());
describe("DEV122 settings dispatch retains the existing owner guards", () => {
  it.each(commands)("dispatches only POST %s in the actual slice", path => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", active.PDM_PRODUCTION_SLICE_MODE);
    expect(middleware(new NextRequest("https://pdm.example" + path, { method: "POST" })).headers.get("x-middleware-next")).toBe("1");
    for (const method of ["PUT", "PATCH", "DELETE", "GET"]) {
      expect(isProductionSliceAllowedApiMutation(method, path, active)).toBe(false);
    }
    expect(isProductionSliceAllowedApiMutation("POST", path, { PDM_PRODUCTION_SLICE_MODE: "unknown" })).toBe(false);
  });
  it.each([
    "/api/settings", "/api/settings/secrets/other-kind/draft", "/api/settings/secrets/reference-one/draft",
    "/api/settings/secrets/reference-one/test/extra", "/api/settings/secrets/reference-one/rotate",
    "/api/settings-secret-probe-jobs", "/api/settings-secret-probe-jobs/job-one/credential",
    "/api/settings-secret-probe-jobs/job-one/cancel", "/api/recognition-workers/heartbeat/extra",
    "/api/recognition-jobs/claim", "/api/preview-workers/heartbeat"
  ])("keeps other mutations blocked: %s", path => {
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", active.PDM_PRODUCTION_SLICE_MODE);
    expect(middleware(new NextRequest("https://pdm.example" + path, { method: "POST" })).status).toBe(403);
  });
  it.each(["/settings", "/settings/security"])("opens exact page and client navigation: %s", path => {
    expect(isProductionSliceOpenPagePath(path, active)).toBe(true);
    expect(productionSliceClientStatus(active).openPagePaths).toContain(path);
    const unknown = { PDM_PRODUCTION_SLICE_MODE: "unknown" };
    expect(isProductionSliceOpenPagePath(path, unknown)).toBe(false);
    expect(productionSliceClientStatus(unknown).openPagePaths).not.toContain(path);
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", active.PDM_PRODUCTION_SLICE_MODE);
    for (const method of ["GET", "HEAD"]) {
      const response = middleware(new NextRequest("https://pdm.example" + path, { method }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });
  it.each(["/settings/security/extra", "/settings/integrations", "/settings/workflow", "/settings/system"])("keeps unopened settings page closed: %s", path => {
    expect(isProductionSliceOpenPagePath(path, active)).toBe(false);
    expect(productionSliceClientStatus(active).openPagePaths).not.toContain(path);
  });
});
