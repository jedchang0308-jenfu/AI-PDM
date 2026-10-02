import { describe, expect, it } from "vitest";
import { masterAttachmentCommandFailureResponse } from "@/lib/master-attachment-response";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
describe("attachment command failure taxonomy", () => {
  it("preserves session revocation as authentication failure", () => {
    expect(masterAttachmentCommandFailureResponse(new JenfuPrincipalRequestError("auth_epoch_stale")).status).toBe(401);
  });
  it("preserves published grant refusal rather than reporting a server outage", () => {
    expect(masterAttachmentCommandFailureResponse(new JenfuEntitlementRepositoryError("entitlement_assignment_not_found")).status).toBe(403);
    expect(masterAttachmentCommandFailureResponse(new Error("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED")).status).toBe(403);
  });
  it("does not call a dependency outage a permission denial", () => {
    expect(masterAttachmentCommandFailureResponse(new JenfuPrincipalRequestError("principal_dependency_unavailable")).status).toBe(503);
  });
  it("reports receipt actor/payload conflicts without returning a previous result", async () => {
    for (const code of ["PLATFORM_COMMAND_ACTOR_MISMATCH", "PLATFORM_COMMAND_IDEMPOTENCY_PAYLOAD_MISMATCH"]) {
      const response = masterAttachmentCommandFailureResponse(new Error(code));
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: code });
    }
  });
});
