import { createHash } from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { validateProfileClaimConfirmationBytes } from "./jenfu-principal-profile-claim-confirmation.mjs";
import {
  readPrincipalAclMigrationSource, type PrincipalAclMigrationSourceInput
} from "@/lib/jenfu-principal-acl-migration-preview";
import { lockPrincipalCutoverOwnerSources } from "@/lib/jenfu-principal-cutover-locks";
import { assertPrincipalOwnerContractManifestHashes } from
  "@/lib/jenfu-principal-owner-contract-manifest";
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
const OWNER_KEYS = ["platform", "orgmaster", "aiPdm"] as const;
const REVISION = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
function exactOwnerBindings(value: unknown, pattern: RegExp): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const bindings = value as Record<string, unknown>;
  return Object.keys(bindings).sort().join("\0") ===
    [...OWNER_KEYS].sort().join("\0") &&
    OWNER_KEYS.every((owner) => typeof bindings[owner] === "string" &&
      pattern.test(bindings[owner]));
}
// This is an in-process prerequisite for the owner apply, not proof that the
// named human actually approved a claim. The owner runner must fetch the
// restricted receipt object and verify its provenance before calling it.
const transferConfirmations = new WeakMap<object, string>();

function transferFingerprint(prepared: PreparedPrincipalCutoverSource): string {
  return createHash("sha256").update(JSON.stringify({
    inputHash: prepared.inputHash, sourceSets: prepared.sourceSets
  })).digest("hex");
}

/** Bind exact confirmation bytes to this prepared source before owner apply. */
export function bindPrincipalTransferConfirmations(
  prepared: PreparedPrincipalCutoverSource,
  receipts: ReadonlyMap<string, Buffer>
): void {
  if (!prepared || !Array.isArray(prepared.sourceSets) || !(receipts instanceof Map)) {
    throw new Error("PRINCIPAL_TRANSFER_CONFIRMATION_INVALID");
  }
  const transfers = prepared.sourceSets.flat().filter((source) =>
    source?.claimKind === "profile_transfer");
  if (transfers.length !== receipts.size || transfers.length === 0) {
    throw new Error("PRINCIPAL_TRANSFER_CONFIRMATION_INVALID");
  }
  const used = new Set<string>();
  for (const source of transfers) {
    const hash = source.confirmationReceiptHash;
    const bytes = hash && receipts.get(hash);
    if (!hash || !/^[a-f0-9]{64}$/u.test(hash) || used.has(hash) ||
        !Buffer.isBuffer(bytes)) {
      throw new Error("PRINCIPAL_TRANSFER_CONFIRMATION_INVALID");
    }
    validateProfileClaimConfirmationBytes(bytes, source, hash);
    used.add(hash);
  }
  transferConfirmations.set(prepared, transferFingerprint(prepared));
}

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
    !Array.isArray(prepared.sourceSets) || prepared.sourceSets.length < 1 ||
    prepared.sourceSets.length > 32 ||
    prepared.sourceSets.some((set) => !Array.isArray(set) || set.length !== 1 ||
      set.some((row) => !row?.pdmUserId ||
        row.pdmUserId !== set[0]?.pdmUserId)) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/u.test(prepared.operationId) ||
    !exactOwnerBindings(prepared.sourceRevisions, REVISION) ||
    !exactOwnerBindings(prepared.contractManifestHashes, SHA256) ||
    !SHA256.test(prepared.cohortHash) ||
    !SHA256.test(prepared.sourceHash) ||
    !SHA256.test(prepared.inputHash)) {
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
  // The operation file supplies expected hashes, never evidence that the
  // three owner contracts are currently published. Re-read their manifests
  // on the same owner connection before any materialization can begin.
  await assertPrincipalOwnerContractManifestHashes(
    client, prepared.contractManifestHashes);
  if (prepared.sourceSets.some((set) =>
      set[0].claimKind === "profile_transfer") &&
      transferConfirmations.get(prepared) !== transferFingerprint(prepared)) {
    throw new Error("PRINCIPAL_TRANSFER_CONFIRMATION_REQUIRED");
  }
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
