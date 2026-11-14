import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  digestPdmRevocation, parsePdmRevocationCommand, pdmRevocationReceiptVersion, pdmRevocationVersion,
  type PdmRevocationPayload
} from "@/lib/pdm-session-revocation-contract";
import { applyPdmSessionRevocation, handlePdmSessionRevocation } from "@/lib/pdm-session-revocation";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), database: vi.fn() }));
vi.mock("google-auth-library", () => ({ OAuth2Client: class { verifyIdToken = mocks.verify; } }));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.database }));

const payload = {
  contractVersion: pdmRevocationVersion, targetApp: "ai-pdm", sourceApp: "orgmaster",
  eventId: randomUUID(), operationId: randomUUID(), principalIds: ["principal-1"],
  phase: "published", baselineVersion: "3", publicationVersion: "4", revokedBefore: null, sourceEpoch: null
} satisfies PdmRevocationPayload;
const command = { ...payload, digest: digestPdmRevocation(payload) };
const receipt = {
  contractVersion: pdmRevocationReceiptVersion, eventId: command.eventId, operationId: command.operationId,
  phase: command.phase, digest: command.digest, receiptId: randomUUID(), appliedAt: "2026-11-14T00:00:00.000Z"
};

function fixture() {
  const queryOne = vi.fn<(sql: string) => Promise<unknown>>();
  const client = { kind: "postgres", queryOne, execute: vi.fn() };
  const transaction = vi.fn(async (run: (snapshot: unknown) => Promise<unknown>) => run(client));
  return { queryOne, transaction, database: { ...client, transaction } as unknown as AsyncDatabaseClient };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("PDM Platform revocation", () => {
  const global = {
    ...payload, sourceApp: "platform", baselineVersion: null, publicationVersion: null,
    phase: "global_prepare", sourceEpoch: 7, revokedBefore: null
  } as const;
  const wire = (input: PdmRevocationPayload) => parsePdmRevocationCommand({ ...input, digest: digestPdmRevocation(input) });

  it("prepares locally without waiting for the central epoch change", async () => {
    const { database, queryOne } = fixture();
    const prepare = wire(global);
    const preparedReceipt = { ...receipt, phase: prepare.phase, digest: prepare.digest };
    queryOne.mockResolvedValueOnce({ receipt: null }).mockResolvedValueOnce({ receipt: preparedReceipt });
    await expect(applyPdmSessionRevocation(database, prepare, false)).resolves.toEqual(preparedReceipt);
    expect(queryOne).toHaveBeenCalledTimes(2);
    expect(queryOne.mock.calls[1][0]).toContain("ai_pdm_core.apply_principal_session_revocation_v1");
  });

  it.each(["global_logout", "global_cancelled"] as const)(
    "keeps the barrier on unreadable %s and returns the durable receipt after source recovery",
    async phase => {
      const { database, queryOne } = fixture();
      const cutoff = "2026-11-14T00:00:00.000Z";
      const terminal = phase === "global_logout"
        ? wire({ ...global, phase, sourceEpoch: 8, revokedBefore: cutoff })
        : wire({ ...global, phase });
      const terminalReceipt = { ...receipt, phase, digest: terminal.digest };
      queryOne.mockResolvedValueOnce({ receipt: null })
        .mockResolvedValueOnce({ principal_id: "principal-1", auth_epoch: 7, revoked_before: null });
      await expect(applyPdmSessionRevocation(database, terminal, false))
        .rejects.toMatchObject({ status: 409, code: "pdm_revocation_source_not_readable" });
      expect(queryOne).toHaveBeenCalledTimes(2);
      expect(queryOne.mock.calls[1][0]).toContain("platform_contract.read_principal_auth_state_v3");
      queryOne.mockReset().mockResolvedValueOnce({ receipt: null })
        .mockResolvedValueOnce({ principal_id: "principal-1", auth_epoch: 8, revoked_before: cutoff })
        .mockResolvedValueOnce({ receipt: terminalReceipt });
      await expect(applyPdmSessionRevocation(database, terminal, false)).resolves.toEqual(terminalReceipt);
      queryOne.mockReset().mockResolvedValueOnce({ receipt: terminalReceipt });
      await expect(applyPdmSessionRevocation(database, terminal, true)).resolves.toEqual(terminalReceipt);
      expect(queryOne).toHaveBeenCalledOnce();
    }
  );

  it("requires publication readback before attempting to release the barrier", async () => {
    const { database, queryOne } = fixture();
    queryOne.mockResolvedValueOnce({ receipt: null }).mockResolvedValueOnce(null);
    await expect(applyPdmSessionRevocation(database, command, false))
      .rejects.toMatchObject({ status: 409, code: "pdm_revocation_source_not_readable" });
    expect(queryOne).toHaveBeenCalledTimes(2);
    expect(queryOne.mock.calls[1][0]).toContain("orgmaster_contract.read_ai_pdm_session_publication_v1");
    queryOne.mockReset().mockResolvedValueOnce({ receipt: null })
      .mockResolvedValueOnce({ publication_version: "4" }).mockResolvedValueOnce({ receipt });
    await expect(applyPdmSessionRevocation(database, command, false)).resolves.toEqual(receipt);
    expect(queryOne.mock.calls[2][0]).toContain("ai_pdm_core.apply_principal_session_revocation_v1");
  });

  it("reads matching durable receipts without contacting the producer", async () => {
    const { database, queryOne, transaction } = fixture();
    queryOne.mockResolvedValue({ receipt });
    await expect(applyPdmSessionRevocation(database, command, true)).resolves.toEqual(receipt);
    expect(queryOne).toHaveBeenCalledOnce();
    expect(transaction.mock.calls[0]?.[0]).toBeTypeOf("function");
  });

  it("rejects an OIDC workload with the wrong subject before database access", async () => {
    vi.stubEnv("PDM_SESSION_REVOCATION_ENABLED", "1");
    vi.stubEnv("PDM_SESSION_REVOCATION_AUDIENCE", "https://pdm.example.test");
    vi.stubEnv("PDM_SESSION_REVOCATION_PLATFORM_SUBJECT", "12345");
    vi.stubEnv("PDM_SESSION_REVOCATION_PLATFORM_EMAIL", "platform@example.iam.gserviceaccount.com");
    mocks.verify.mockResolvedValue({ getPayload: () => ({
      iss: "https://accounts.google.com", aud: "https://pdm.example.test", sub: "67890",
      email: "platform@example.iam.gserviceaccount.com", email_verified: true
    }) });
    const response = await handlePdmSessionRevocation(new Request("https://pdm.example.test", {
      method: "POST", headers: { authorization: "Bearer synthetic.token", "content-type": "application/json" },
      body: JSON.stringify(command)
    }), false);
    expect(response.status).toBe(403);
    expect(mocks.database).not.toHaveBeenCalled();
  });
});
