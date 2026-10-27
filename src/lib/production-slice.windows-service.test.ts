import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { isProductionSliceAllowedApiMutation, isProductionSliceOpenPagePath, productionSliceClientStatus } from "@/lib/production-slice";

const active = { NODE_ENV: "production", PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft" };
const commands = [
  "/api/settings/windows-service/enrollments",
  "/api/settings/windows-service/devices/device-one/revoke",
  "/api/windows-service/enroll",
  "/api/windows-service/start",
  "/api/windows-service/heartbeat",
  "/api/preview-jobs/claim",
  "/api/preview-jobs/job-one/heartbeat",
  "/api/preview-jobs/job-one/complete"
] as const;

afterEach(() => vi.unstubAllEnvs());

describe("DEV125 Windows service reaches only its existing owner guards", () => {
  it("opens the exact manager page in the active production slice", () => {
    const path = "/settings/windows-service";
    expect(isProductionSliceOpenPagePath(path, active)).toBe(true);
    expect(productionSliceClientStatus(active).openPagePaths).toContain(path);
    expect(isProductionSliceOpenPagePath(path, { PDM_PRODUCTION_SLICE_MODE: "unknown" })).toBe(false);
    expect(isProductionSliceOpenPagePath(`${path}/extra`, active)).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", active.PDM_PRODUCTION_SLICE_MODE);
    for (const method of ["GET", "HEAD"]) {
      const response = middleware(new NextRequest(`https://pdm.example${path}`, { method }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it.each(commands)("dispatches exact POST %s in the active slice", path => {
    expect(isProductionSliceAllowedApiMutation("POST", path, active)).toBe(true);
    expect(isProductionSliceAllowedApiMutation("POST", path, { PDM_PRODUCTION_SLICE_MODE: "unknown" })).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", active.PDM_PRODUCTION_SLICE_MODE);
    expect(middleware(new NextRequest(`https://pdm.example${path}`, { method: "POST" })).headers.get("x-middleware-next")).toBe("1");
  });

  it.each(commands)("keeps non-POST writes closed for %s", path => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(isProductionSliceAllowedApiMutation(method, path, active)).toBe(false);
    }
  });

  it.each([
    "/api/settings/windows-service/devices",
    "/api/settings/windows-service/devices/device-one/revoke/extra",
    "/api/settings/windows-service/devices/device-one/delete",
    "/api/windows-service/enroll/extra",
    "/api/windows-service/jobs/preview/job-one",
    "/api/preview-jobs",
    "/api/preview-jobs/claim/extra",
    "/api/preview-jobs/job-one/content",
    "/api/preview-jobs/job-one/cancel",
    "/api/preview-jobs-extra/claim"
  ])("keeps unsupported mutation closed: %s", path => {
    expect(isProductionSliceAllowedApiMutation("POST", path, active)).toBe(false);
  });
});
