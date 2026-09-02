import { describe, expect, it } from "vitest";
import { jenfuEntitlementFailureResponse, jenfuEntitlementHttpStatus } from "@/lib/jenfu-entitlement-http";

describe("DEV-005 entitlement HTTP decisions", () => {
  it.each([
    ["entitlement_authority_unavailable", 503],
    ["entitlement_contract_mismatch", 409],
    ["entitlement_dual_authority_detected", 500],
    ["legacy_assignment_mutation_retired", 410],
    ["entitlement_authority_unknown", 403],
    ["entitlement_scope_mismatch", 403],
    ["permission_not_granted", 403]
  ])("maps %s to %i", (decisionCode, expectedStatus) => {
    expect(jenfuEntitlementHttpStatus(decisionCode)).toBe(expectedStatus);
  });

  it("does not expose an unknown internal decision", async () => {
    const response = jenfuEntitlementFailureResponse("internal_sql_detail");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "permission_not_granted" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
