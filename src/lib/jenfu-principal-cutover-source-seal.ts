import { hashPrincipalSource, orderedPrincipalSourceRows } from "@/lib/jenfu-principal-source-canonical";

type Owner = "platform" | "orgmaster" | "aiPdm";
type OwnerBindings = Record<Owner, string>;
type CohortRow = {
  pdmUserId: string;
  principalId: string;
  sourceCount: number;
};

export type PrincipalCutoverSourceSealInput = {
  operationId: string;
  sourceRevisions: OwnerBindings;
  contractManifestHashes: OwnerBindings;
  cohort: readonly CohortRow[];
  localSourceHash: string;
  producerSourceHash: string;
  graphHash: string;
  workspaceShadowHash: string;
  planHash: string;
};

const OWNERS: readonly Owner[] = ["platform", "orgmaster", "aiPdm"];
const SHA256 = /^[0-9a-f]{64}$/u;
const SHA1 = /^[0-9a-f]{40}$/u;

function invalid(): never { throw new Error("PRINCIPAL_CUTOVER_SOURCE_SEAL_INVALID"); }

/** Seals actual readbacks; provider attestation of revision/manifest is the owner's separate input gate. */
export function sealPrincipalCutoverSource(input: PrincipalCutoverSourceSealInput) {
  if (!input || typeof input.operationId !== "string" ||
    input.operationId.length < 1 || input.operationId.length > 255 ||
    input.operationId.trim() !== input.operationId ||
    /[\u0000-\u001f\u007f]/u.test(input.operationId) ||
    !SHA256.test(input.localSourceHash) || !SHA256.test(input.producerSourceHash) ||
    !SHA256.test(input.planHash) || !SHA256.test(input.graphHash) ||
    !SHA256.test(input.workspaceShadowHash) ||
    !Array.isArray(input.cohort) ||
    input.cohort.length < 1 || input.cohort.length > 32 ||
    OWNERS.some((owner) => !SHA1.test(input.sourceRevisions?.[owner] ?? "") ||
      !SHA256.test(input.contractManifestHashes?.[owner] ?? ""))) invalid();
  const principals = new Set<string>();
  const profiles = new Set<string>();
  for (const row of input.cohort) {
    if (!row || typeof row.pdmUserId !== "string" || !row.pdmUserId ||
      typeof row.principalId !== "string" || !row.principalId ||
      row.principalId.startsWith("pdm:") ||
      !Number.isSafeInteger(row.sourceCount) || row.sourceCount < 1 || row.sourceCount > 2 ||
      profiles.has(row.pdmUserId) || principals.has(row.principalId)) invalid();
    profiles.add(row.pdmUserId);
    principals.add(row.principalId);
  }
  const cohort = orderedPrincipalSourceRows(input.cohort.map((row) => ({ ...row })));
  const cohortHash = hashPrincipalSource({
    contractVersion: "ai-pdm.principal-cutover-cohort.v1", cohort
  });
  const sourceHash = hashPrincipalSource({
    contractVersion: "ai-pdm.principal-cutover-source.v1",
    sourceRevisions: input.sourceRevisions,
    contractManifestHashes: input.contractManifestHashes,
    localSourceHash: input.localSourceHash,
    producerSourceHash: input.producerSourceHash,
    graphHash: input.graphHash,
    workspaceShadowHash: input.workspaceShadowHash,
    planHash: input.planHash,
    cohortHash
  });
  const inputHash = hashPrincipalSource({
    contractVersion: "ai-pdm.principal-cutover-operation.v1",
    operationId: input.operationId, sourceHash, cohortHash
  });
  return { cohortHash, sourceHash, inputHash };
}
