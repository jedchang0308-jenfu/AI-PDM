import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  requireCurrentPrincipalCutoverSource,
  type PreparedPrincipalCutoverSource
} from "@/lib/jenfu-principal-cutover-source-gate";

const dependencies = vi.hoisted(() => ({
  lock: vi.fn(), manifest: vi.fn(), readSource: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-cutover-locks", () => ({
  lockPrincipalCutoverOwnerSources: dependencies.lock
}));
vi.mock("@/lib/jenfu-principal-owner-contract-manifest", () => ({
  assertPrincipalOwnerContractManifestHashes: dependencies.manifest
}));
vi.mock("@/lib/jenfu-principal-acl-migration-preview", () => ({
  readPrincipalAclMigrationSource: dependencies.readSource
}));

const prepared = {
  operationId: "operation-cutover-1",
  sourceSets: [[{ pdmUserId: "profile-one" }]],
  sourceRevisions: { platform: "a".repeat(40), orgmaster: "b".repeat(40),
    aiPdm: "c".repeat(40) },
  contractManifestHashes: { platform: "d".repeat(64),
    orgmaster: "e".repeat(64), aiPdm: "f".repeat(64) },
  cohortHash: "1".repeat(64), sourceHash: "2".repeat(64),
  inputHash: "3".repeat(64)
} as unknown as PreparedPrincipalCutoverSource;

describe("principal cutover apply source boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { sourceRevisions: { platform: "a".repeat(40), aiPdm: "c".repeat(40) } },
    { contractManifestHashes: { ...prepared.contractManifestHashes,
      sibling: "9".repeat(64) } },
    { sourceRevisions: { ...prepared.sourceRevisions, aiPdm: "z".repeat(40) } },
    { sourceSets: [] },
  ])("rejects malformed owner bindings or cohort before any database access", async (change) => {
    const execute = vi.fn();
    const connection = { kind: "postgres", execute } as unknown as AsyncDatabaseClient;
    await expect(requireCurrentPrincipalCutoverSource(connection,
      { ...prepared, ...change } as PreparedPrincipalCutoverSource))
      .rejects.toThrow("PRINCIPAL_CUTOVER_PREPARED_SOURCE_INVALID");
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a new apply when live owner manifests disagree, before reading the cutover source", async () => {
    dependencies.lock.mockResolvedValue({ status: "locked" });
    dependencies.manifest.mockRejectedValue(new Error("PRINCIPAL_OWNER_MANIFEST_HASH_MISMATCH"));
    const connection = { kind: "postgres", execute: vi.fn() } as unknown as AsyncDatabaseClient;

    await expect(requireCurrentPrincipalCutoverSource(connection, prepared))
      .rejects.toThrow("PRINCIPAL_OWNER_MANIFEST_HASH_MISMATCH");
    expect(dependencies.manifest).toHaveBeenCalledWith(
      connection, prepared.contractManifestHashes);
    expect(dependencies.readSource).not.toHaveBeenCalled();
  });

  it("replays a committed operation without depending on later manifest changes", async () => {
    const receipt = { status: "replayed", result: { operationId: prepared.operationId } };
    dependencies.lock.mockResolvedValue(receipt);
    const connection = { kind: "postgres", execute: vi.fn() } as unknown as AsyncDatabaseClient;

    await expect(requireCurrentPrincipalCutoverSource(connection, prepared))
      .resolves.toEqual(receipt);
    expect(dependencies.manifest).not.toHaveBeenCalled();
    expect(dependencies.readSource).not.toHaveBeenCalled();
  });
});
