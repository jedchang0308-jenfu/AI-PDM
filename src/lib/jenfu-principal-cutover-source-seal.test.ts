import { describe, expect, it } from "vitest";
import {
  sealPrincipalCutoverSource, type PrincipalCutoverSourceSealInput
} from "@/lib/jenfu-principal-cutover-source-seal";

function source(): PrincipalCutoverSourceSealInput {
  return {
    operationId: "operation-one",
    sourceRevisions: { platform: "a".repeat(40), orgmaster: "b".repeat(40), aiPdm: "c".repeat(40) },
    contractManifestHashes: {
      platform: "d".repeat(64), orgmaster: "e".repeat(64), aiPdm: "f".repeat(64)
    },
    cohort: [
      { pdmUserId: "pdm-two", principalId: "principal-two", sourceCount: 2 },
      { pdmUserId: "pdm-one", principalId: "principal-one", sourceCount: 1 }
    ],
    localSourceHash: "1".repeat(64),
    producerSourceHash: "2".repeat(64),
    graphHash: "4".repeat(64),
    workspaceShadowHash: "5".repeat(64),
    planHash: "3".repeat(64)
  };
}

describe("principal cutover source seal", () => {
  it("ignores cohort input order and binds all three owners", () => {
    const original = source();
    const baseline = sealPrincipalCutoverSource(original);
    expect(sealPrincipalCutoverSource({ ...original,
      cohort: [...original.cohort].reverse() })).toEqual(baseline);
    expect(sealPrincipalCutoverSource({ ...original,
      sourceRevisions: { ...original.sourceRevisions, orgmaster: "9".repeat(40) }
    }).sourceHash).not.toBe(baseline.sourceHash);
    expect(sealPrincipalCutoverSource({ ...original,
      contractManifestHashes: { ...original.contractManifestHashes, aiPdm: "9".repeat(64) }
    }).sourceHash).not.toBe(baseline.sourceHash);
  });

  it("binds local policy, producer grants, plan and operation independently", () => {
    const original = source();
    const baseline = sealPrincipalCutoverSource(original);
    for (const field of ["localSourceHash", "producerSourceHash", "graphHash", "workspaceShadowHash", "planHash"] as const) {
      expect(sealPrincipalCutoverSource({ ...original, [field]: "9".repeat(64) }).sourceHash)
        .not.toBe(baseline.sourceHash);
    }
    const changedOperation = sealPrincipalCutoverSource({ ...original, operationId: "operation-two" });
    expect(changedOperation.sourceHash).toBe(baseline.sourceHash);
    expect(changedOperation.inputHash).not.toBe(baseline.inputHash);
  });

  it("rejects ambiguous or legacy local principal identities", () => {
    const original = source();
    expect(() => sealPrincipalCutoverSource({ ...original, cohort: [
      original.cohort[0], { ...original.cohort[1], principalId: original.cohort[0].principalId }
    ] })).toThrow("PRINCIPAL_CUTOVER_SOURCE_SEAL_INVALID");
    expect(() => sealPrincipalCutoverSource({ ...original,
      cohort: [{ pdmUserId: "pdm-one", principalId: "pdm:pdm-one", sourceCount: 1 }]
    })).toThrow("PRINCIPAL_CUTOVER_SOURCE_SEAL_INVALID");
  });
});
