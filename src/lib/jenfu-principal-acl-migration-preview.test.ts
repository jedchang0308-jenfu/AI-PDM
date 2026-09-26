import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  previewPrincipalCutoverSourceEnvelope,
  previewPrincipalCutoverSourceEnvelopeInSnapshot
} from "@/lib/jenfu-principal-acl-migration-preview";

const manifest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/jenfu-principal-owner-contract-manifest", () => ({
  assertPrincipalOwnerContractManifestHashes: manifest
}));

const input = {
  firebaseProjectId: "jenfu-platform-prod",
  sourceSets: [[{ pdmUserId: "profile-one" }]],
  cutoverAt: "2026-09-26T00:00:00.000Z",
  operationId: "operation-cutover-1",
  sourceRevisions: { platform: "a".repeat(40), orgmaster: "b".repeat(40),
    aiPdm: "c".repeat(40) },
  contractManifestHashes: { platform: "d".repeat(64),
    orgmaster: "e".repeat(64), aiPdm: "f".repeat(64) }
} as unknown as Parameters<typeof previewPrincipalCutoverSourceEnvelopeInSnapshot>[1];

describe("principal cutover preview owner manifest boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a drifted producer manifest before reading profile or ACL facts", async () => {
    const query = vi.fn();
    const snapshot = { kind: "postgres", query } as unknown as AsyncDatabaseClient;
    manifest.mockRejectedValue(new Error("PRINCIPAL_OWNER_MANIFEST_HASH_MISMATCH"));

    await expect(previewPrincipalCutoverSourceEnvelopeInSnapshot(snapshot, input))
      .rejects.toThrow("PRINCIPAL_OWNER_MANIFEST_HASH_MISMATCH");
    expect(manifest).toHaveBeenCalledWith(snapshot, input.contractManifestHashes);
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps the standalone preview and manifest check in one read-only snapshot", async () => {
    const execute = vi.fn();
    const query = vi.fn();
    const snapshot = { kind: "postgres", execute, query } as unknown as AsyncDatabaseClient;
    const transaction = vi.fn(async (callback: (client: AsyncDatabaseClient) => Promise<unknown>) =>
      callback(snapshot));
    const database = { kind: "postgres", transaction } as unknown as AsyncDatabaseClient;
    manifest.mockRejectedValue(new Error("PRINCIPAL_OWNER_MANIFEST_HASH_MISMATCH"));

    await expect(previewPrincipalCutoverSourceEnvelope({ ...input, database }))
      .rejects.toThrow("PRINCIPAL_OWNER_MANIFEST_HASH_MISMATCH");
    expect(transaction).toHaveBeenCalledWith(expect.any(Function),
      { isolationLevel: "repeatable_read", readOnly: true });
    expect(execute).toHaveBeenCalledWith("SET LOCAL ROLE jenfu_ai_pdm_migrator");
    expect(manifest).toHaveBeenCalledWith(snapshot, input.contractManifestHashes);
    expect(query).not.toHaveBeenCalled();
  });
});
