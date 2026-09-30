import { describe, expect, it } from "vitest";
import { principalRequestFailure } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";

describe("Principal HTTP preserves authenticated authorization decisions", () => {
  it.each(["entitlement_assignment_not_found", "entitlement_scope_mismatch",
    "entitlement_role_inactive", "permission_explicit_deny", "permission_not_granted"] as const)(
    "returns a denied %s without misreporting dependency failure", async code => {
      const response = principalRequestFailure(new JenfuEntitlementRepositoryError(code));
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({ error: code });
    });
  it("keeps provider/contract failures in their existing error taxonomy", async () => {
    expect(principalRequestFailure(new JenfuEntitlementRepositoryError("entitlement_authority_unavailable")).status).toBe(503);
    expect(principalRequestFailure(new JenfuEntitlementRepositoryError("entitlement_contract_mismatch")).status).toBe(409);
    expect(principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid")).status).toBe(401);
    expect(principalRequestFailure(new JenfuPrincipalRequestError("auth_epoch_stale")).status).toBe(401);
    expect(principalRequestFailure(new JenfuPrincipalRequestError("principal_dependency_unavailable")).status).toBe(503);
  });
  it("does not trust a plain object or expose an internal database failure", async () => {
    for (const error of [{ code: "permission_not_granted" },
      Object.assign(new Error("private database detail"), { code: "entitlement_assignment_not_found" })]) {
      const response = principalRequestFailure(error);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ code: "principal_dependency_unavailable" });
    }
  });
});
