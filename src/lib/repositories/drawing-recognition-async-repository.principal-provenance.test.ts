import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRecognitionAsyncRepository } from "@/lib/repositories/drawing-recognition-async-repository";

function workerDatabase(initiatorPrincipalId: string | null) {
  const session = {
    id: "session-one", company_id: "company-one", drawing_id: null,
    drawing_revision_id: null, source_set_fingerprint: "fingerprint-one",
    attempt_count: 0, initiator_principal_id: initiatorPrincipalId
  };
  const client = {
    kind: "postgres",
    transaction: vi.fn(async (run) => run(client)),
    queryOne: vi.fn(async () => session),
    query: vi.fn(async () => []),
    execute: vi.fn(async () => undefined)
  } as unknown as AsyncDatabaseClient;
  return client;
}

describe("recognition worker Principal provenance", () => {
  it.each([
    ["new Principal session", "principal-one"],
    ["historical unknown initiator", null]
  ])("returns %s without deriving identity from the PDM profile", async (_name, principalId) => {
    const client = workerDatabase(principalId);
    const claimed = await new DrawingRecognitionAsyncRepository(client).claimJob({
      workerId: "worker-one", maxAttempts: 2, allowNativeSources: true
    });
    expect(claimed).toMatchObject({
      sessionId: "session-one", companyId: "company-one",
      initiatorPrincipalId: principalId, attemptCount: 1
    });
  });

  it("rejects a new PostgreSQL session without a verified Principal before any write", async () => {
    const client = workerDatabase(null);
    await expect(new DrawingRecognitionAsyncRepository(client).createSession({
      companyId: "company-one", actorId: "profile-one",
      sourceContextType: "drawing_number", sourceContextId: "drawing-one"
    })).rejects.toMatchObject({ code: "RECOGNITION_PRINCIPAL_REQUIRED", status: 403 });
    expect(client.transaction).not.toHaveBeenCalled();
  });

  it("rejects Principal-less review and formalization audit writes", async () => {
    const client = workerDatabase(null);
    const repository = new DrawingRecognitionAsyncRepository(client);
    await expect(repository.saveDecisions({ sessionId: "session-one",
      companyId: "company-one", actorId: "profile-one", expectedRowVersion: 1,
      decisions: [] })).rejects.toMatchObject({ code: "RECOGNITION_PRINCIPAL_REQUIRED" });
    await expect(repository.applyFormalization({ sessionId: "session-one",
      companyId: "company-one", actorId: "profile-one", expectedRowVersion: 1,
      idempotencyKey: "event-one" })).rejects.toMatchObject({
        code: "RECOGNITION_PRINCIPAL_REQUIRED"
      });
    expect(client.transaction).not.toHaveBeenCalled();
  });

  it("authorizes a session owner by Principal and refuses the matching historical profile alone", async () => {
    const client = workerDatabase("principal-one");
    const repository = new DrawingRecognitionAsyncRepository(client);
    await expect(repository.assertSessionScope({ sessionId: "session-one",
      companyId: "company-one", actorId: "profile-one", principalId: "principal-two",
      privileged: false })).rejects.toMatchObject({ code: "RECOGNITION_SESSION_FORBIDDEN" });
    await expect(repository.assertSessionScope({ sessionId: "session-one",
      companyId: "company-one", actorId: "profile-two", principalId: "principal-one",
      privileged: false })).resolves.toMatchObject({ id: "session-one" });
    await expect(repository.assertSessionScope({ sessionId: "session-one",
      companyId: "company-one", actorId: "profile-one", privileged: true }))
      .rejects.toMatchObject({ code: "RECOGNITION_PRINCIPAL_REQUIRED" });
  });

  it("lets the verified drawing owner read historical unknown-initiator sessions", async () => {
    const client = workerDatabase(null);
    vi.mocked(client.queryOne).mockResolvedValueOnce({
      id: "historical", company_id: "company-one", created_by: "other-profile",
      initiator_principal_id: null, drawing_owner_id: "profile-one",
      drawing_owner_principal_id: "principal-one"
    } as never);
    await expect(new DrawingRecognitionAsyncRepository(client).assertSessionScope({
      sessionId: "historical", companyId: "company-one", actorId: "other-profile",
      principalId: "principal-one", privileged: false
    })).resolves.toMatchObject({ id: "historical" });
    expect(vi.mocked(client.queryOne).mock.calls[0]?.[0]).toContain("owner_account.principal_id");
  });
});
