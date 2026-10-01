import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import {
  isProductionSliceAllowedApiMutation,
  isProductionSliceOpenPagePath,
  productionSliceClientStatus
} from "@/lib/production-slice";

const active = { PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft" };
const unknown = { PDM_PRODUCTION_SLICE_MODE: "unknown-mode" };
const requestId = "APR-TRF-00000000-0000-4000-8000-000000000001";

describe("Principal transfer workflow reachability in the existing production slice", () => {
  it("admits the exact owner commands and Principal-bound decision", () => {
    for (const [method, path] of [
      ["POST", "/api/transfer-packages"],
      ["PATCH", "/api/transfer-packages/package-one"],
      ["POST", "/api/transfer-packages/package-one/items"],
      ["DELETE", "/api/transfer-packages/package-one/items/item-one"],
      ["POST", "/api/transfer-packages/package-one/draft-items"],
      ["DELETE", "/api/transfer-packages/package-one/draft-items/item-one"],
      ["POST", "/api/transfer-packages/package-one/submit-review"],
      ["POST", "/api/transfer-packages/package-one/withdraw-review"],
      ["POST", "/api/transfer-packages/package-one/publish"],
      ["POST", "/api/transfer-packages/package-one/cancel"],
      ["POST", `/api/approvals/requests/${requestId}/decisions`]
    ]) expect(isProductionSliceAllowedApiMutation(method, path, active)).toBe(true);
  });

  it("retains deny for unknown mode, wrong method and unbound review IDs", () => {
    expect(isProductionSliceAllowedApiMutation("POST", "/api/transfer-packages", unknown)).toBe(false);
    expect(isProductionSliceAllowedApiMutation("PUT", "/api/transfer-packages/package-one", active)).toBe(false);
    expect(isProductionSliceAllowedApiMutation("POST", "/api/transfer-packages/package-one/unsupported", active)).toBe(false);
    expect(isProductionSliceAllowedApiMutation("POST",
      "/api/approvals/requests/APR-TRF-historical/decisions", active)).toBe(false);
  });

  it("opens only the mounted transfer and Principal review pages", () => {
    for (const path of ["/technical-transfer", "/transfer-packages/new",
      "/transfer-packages/package-one", "/approvals", `/approvals/${requestId}`]) {
      expect(isProductionSliceOpenPagePath(path, active)).toBe(true);
      expect(isProductionSliceOpenPagePath(path, unknown)).toBe(false);
    }
    expect(isProductionSliceOpenPagePath("/approvals/APR-TRF-historical", active)).toBe(false);
  });

  it("advertises the same workflow entries that server policy opens without broadening unrelated pages", () => {
    for (const env of [active, unknown, { ...active, PDM_PRODUCTION_NUMBERING_LIFECYCLE_GATE: "formal-obsolete" }]) {
      const advertised = productionSliceClientStatus(env).openPagePaths;
      for (const path of ["/technical-transfer", "/approvals", "/handoff", "/policy", "/settings"]) {
        expect(advertised.includes(path)).toBe(isProductionSliceOpenPagePath(path, env));
      }
      expect(advertised).not.toContain("/approvals/APR-TRF-historical");
    }
    expect(productionSliceClientStatus(active).openPagePaths).toContain("/technical-transfer");
    expect(productionSliceClientStatus(active).openPagePaths).toContain("/approvals");
  });

  it("passes the actual middleware for a bound transfer decision and blocks an unbound one", () => {
    const previousMode = process.env.PDM_PRODUCTION_SLICE_MODE;
    try {
      process.env.PDM_PRODUCTION_SLICE_MODE = "official-numbering-draft";
      const allowed = middleware(new NextRequest(
        `https://pdm.example/api/approvals/requests/${requestId}/decisions`,
        { method: "POST" }
      ));
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("x-middleware-next")).toBe("1");

      const blocked = middleware(new NextRequest(
        "https://pdm.example/api/approvals/requests/APR-TRF-historical/decisions",
        { method: "POST" }
      ));
      expect(blocked.status).toBe(403);
      expect(blocked.headers.get("x-ai-pdm-production-slice")).toBe("blocked");
    } finally {
      if (previousMode === undefined) delete process.env.PDM_PRODUCTION_SLICE_MODE;
      else process.env.PDM_PRODUCTION_SLICE_MODE = previousMode;
    }
  });
});
