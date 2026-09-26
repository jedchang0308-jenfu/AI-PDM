import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  requireCurrentPrincipalCutoverSource,
  type PreparedPrincipalCutoverSource
} from "@/lib/jenfu-principal-cutover-source-gate";

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
});
