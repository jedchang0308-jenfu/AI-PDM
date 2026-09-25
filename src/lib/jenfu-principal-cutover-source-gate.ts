import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  readPrincipalAclMigrationSource, type PrincipalAclMigrationSourceInput
} from "@/lib/jenfu-principal-acl-migration-preview";
import { lockPrincipalCutoverOwnerSources } from "@/lib/jenfu-principal-cutover-locks";
import {
  sealPrincipalCutoverSource, type PrincipalCutoverSourceSealInput
} from "@/lib/jenfu-principal-cutover-source-seal";

export type PreparedPrincipalCutoverSource = PrincipalAclMigrationSourceInput &
  Pick<PrincipalCutoverSourceSealInput,
    "operationId" | "sourceRevisions" | "contractManifestHashes"> & {
      cohortHash: string;
      sourceHash: string;
      inputHash: string;
    };

const verifiedGates = new WeakMap<object, AsyncDatabaseClient>();

function freezeFacts(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeFacts(child);
  Object.freeze(value);
}

export type CurrentPrincipalCutoverSource = {
  status: "current";
  operationId: string;
  source: Awaited<ReturnType<typeof readPrincipalAclMigrationSource>>;
  seal: ReturnType<typeof sealPrincipalCutoverSource>;
};

/** Prevent a caller from fabricating or mutating the locked owner readback. */
export function requireTrustedCurrentPrincipalCutoverSource(
  client: AsyncDatabaseClient,
  value: CurrentPrincipalCutoverSource
) {
  if (!value || verifiedGates.get(value) !== client) {
    throw new Error("PRINCIPAL_CUTOVER_VERIFIED_SOURCE_REQUIRED");
  }
}

/**
 * Runs only inside the owner migrator's READ COMMITTED write transaction.
 * A replay does not require the historical source to remain unchanged.
 * A new apply gets the fixed local locks, then rereads local and producer facts.
 * This gate checks the sealed workspace shadow before materialization; it does
 * not mutate security state itself. Resource decisions need separate proof.
 */
export async function requireCurrentPrincipalCutoverSource(
  client: AsyncDatabaseClient,
  prepared: PreparedPrincipalCutoverSource
) {
  if (client.kind !== "postgres" || !prepared ||
    !Array.isArray(prepared.sourceSets) ||
    prepared.sourceSets.some((set) => !Array.isArray(set) || set.length < 1 ||
      set.length > 2 || set.some((row) => !row?.pdmUserId ||
        row.pdmUserId !== set[0]?.pdmUserId)) ||
    !/^[0-9a-f]{64}$/u.test(prepared.cohortHash) ||
    !/^[0-9a-f]{64}$/u.test(prepared.sourceHash) ||
    !/^[0-9a-f]{64}$/u.test(prepared.inputHash)) {
    throw new Error("PRINCIPAL_CUTOVER_PREPARED_SOURCE_INVALID");
  }
  // Text casts in owner contract views include timestamps. Match the preview's
  // canonical UTC serialization regardless of the migrator connection default.
  await client.execute("SET LOCAL TIME ZONE 'UTC'");
  await client.execute("SET LOCAL lock_timeout = '2s'");
  await client.execute("SET LOCAL statement_timeout = '5s'");
  const ids = prepared.sourceSets.map((set) => set[0].pdmUserId);
  const locked = await lockPrincipalCutoverOwnerSources(
    client, prepared.operationId, ids, prepared.inputHash, prepared.cohortHash
  );
  if (locked.status === "replayed") return locked;
  const current = await readPrincipalAclMigrationSource(client, prepared, "locked_owner_apply");
  if (current.workspaceShadow.status !== "pass") {
    throw new Error("PRINCIPAL_CUTOVER_WORKSPACE_SHADOW_INCOMPLETE");
  }
  const seal = sealPrincipalCutoverSource({
    operationId: prepared.operationId,
    sourceRevisions: prepared.sourceRevisions,
    contractManifestHashes: prepared.contractManifestHashes,
    cohort: current.cohort,
    localSourceHash: current.localSourceHash,
    producerSourceHash: current.producerSourceHash,
    graphHash: current.graphCheck.graphHash,
    workspaceShadowHash: current.workspaceShadow.shadowHash,
    planHash: current.plan.planHash
  });
  if (seal.cohortHash !== prepared.cohortHash ||
      seal.sourceHash !== prepared.sourceHash ||
      seal.inputHash !== prepared.inputHash) {
    throw new Error("PRINCIPAL_CUTOVER_SOURCE_DRIFT");
  }
  const verified: CurrentPrincipalCutoverSource = {
    status: "current", operationId: prepared.operationId, source: current, seal
  };
  freezeFacts(verified);
  verifiedGates.set(verified, client);
  return verified;
}
