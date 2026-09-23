import { describe, expect, it } from "vitest";
import {
  JENFU_ROUTE_PERMISSION_MAP,
  resolveJenfuRouteAuthorization,
  resolveJenfuRoutePolicy,
  validateJenfuRoutePermissionMap
} from "@/lib/jenfu-route-permission-map";
import type { JenfuRouteDiscriminator } from "@/lib/jenfu-route-permission-map";

describe("DEV-121 route authorization manifest", () => {
  it("checks the declared denominator against actual entries and routes", () => {
    expect(validateJenfuRoutePermissionMap()).toEqual(JENFU_ROUTE_PERMISSION_MAP.denominator);
  });

  it("fails closed on stale denominator or duplicate policy keys", () => {
    expect(() => validateJenfuRoutePermissionMap({
      ...JENFU_ROUTE_PERMISSION_MAP,
      denominator: { ...JENFU_ROUTE_PERMISSION_MAP.denominator, uniqueFiles: 57 }
    })).toThrowError("ROUTE_PERMISSION_MAP_DENOMINATOR_DRIFT");

    const duplicatedEntries = [...JENFU_ROUTE_PERMISSION_MAP.entries, JENFU_ROUTE_PERMISSION_MAP.entries[0]];
    expect(() => validateJenfuRoutePermissionMap({
      ...JENFU_ROUTE_PERMISSION_MAP,
      denominator: { ...JENFU_ROUTE_PERMISSION_MAP.denominator, policyEntries: duplicatedEntries.length },
      entries: duplicatedEntries
    })).toThrowError("ROUTE_PERMISSION_MAP_DUPLICATE_POLICY");
  });

  it("requires an exact discriminator for contextual route policies", () => {
    const path = "src/app/api/approvals/requests/request-1/decisions/route.ts";
    expect(resolveJenfuRouteAuthorization(path, "POST")).toBeNull();
    expect(resolveJenfuRouteAuthorization(path, "POST", "approval_decision:transfer_package")).toMatchObject({
      authorizationMode: "existing_command",
      permissionCode: null
    });
    expect(resolveJenfuRouteAuthorization(path, "POST", "unknown-context" as unknown as JenfuRouteDiscriminator)).toBeNull();
  });

  it("treats route-supplied permission codes as assertions against the manifest", () => {
    const path = "src/app/api/approvals/requests/request-1/apply/route.ts";
    expect(resolveJenfuRoutePolicy(path, "POST", {
      discriminator: "approval_apply:registered",
      expectedPermissionCode: "approval.request.apply"
    })).toMatchObject({ permissionCode: "approval.request.apply" });
    expect(resolveJenfuRoutePolicy(path, "POST", {
      discriminator: "approval_apply:registered",
      expectedPermissionCode: "settings.admin_matrix"
    })).toBeNull();
    expect(resolveJenfuRoutePolicy("src/app/api/unknown/route.ts", "POST", {
      expectedPermissionCode: "settings.admin_matrix"
    })).toBeNull();
  });
});
