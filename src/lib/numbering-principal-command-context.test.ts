import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  database: { kind: "postgres" }
}));

vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: () => mocks.database }));
vi.mock("@/lib/platform-command-service", () => ({ executePdmCommandWithOutbox: mocks.execute }));

import { createPlatformActorContext } from "@/lib/platform-command";
import { obsoleteDraftNumberingRecordAsync } from "@/lib/numbering-async";

describe("principal numbering command handoff", () => {
  it("passes the exact request and route proof to command-time verification without persisting them", async () => {
    mocks.execute.mockResolvedValueOnce({ result: null, reusedFromCommandReceipt: false });
    const request = new Request("https://ai-pdm.test/api/numbering/records/R-1/obsolete", { method: "POST" });
    const principalRequest = { token: "session-proof" } as never;
    const principalAuthorization = {
      request,
      routePath: "src/app/api/numbering/records/[rootCode]/obsolete/route.ts",
      method: "POST",
      permissionCode: "numbering.draft.obsolete"
    };
    const authorizationActor = {
      identityIssuer: "issuer", identitySubject: "subject", principalId: "principal-one",
      employeeId: "employee-one", localPrincipalId: "profile-one", companyId: "company-one",
      sessionSchemaVersion: 2 as const
    };
    const actor = createPlatformActorContext({
      pdmUserId: "profile-one", organizationId: "company-one", authorizationActor
    });

    await obsoleteDraftNumberingRecordAsync({
      companyId: "company-one", rootCode: "R-1", reason: "duplicate", obsoletedBy: "profile-one"
    }, { actor, idempotencyKey: "operation-one", principalRequest, principalAuthorization });

    expect(mocks.execute).toHaveBeenCalledOnce();
    const input = mocks.execute.mock.calls[0][0];
    expect(input.principalRequest).toBe(principalRequest);
    expect(input.principalAuthorization).toBe(principalAuthorization);
    expect(input.command.actor.authorizationActor).toBe(authorizationActor);
    expect(JSON.stringify(input.command)).not.toContain("session-proof");
    expect(JSON.stringify(input.command)).not.toContain("identitySubject");
  });
});
