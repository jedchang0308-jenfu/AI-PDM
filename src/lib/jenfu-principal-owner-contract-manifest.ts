import { createHash } from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

type Owner = "platform" | "orgmaster" | "aiPdm";
type ManifestRow = {
  owner: Owner;
  contract_id: string;
  contract_version: string;
  signature_sha256: string;
  payload_sha256: string | null;
};

const REQUIRED: ReadonlyArray<ManifestRow> = [
  { owner: "platform", contract_id: "platform.principal-auth-state",
    contract_version: "jenfu.platform-contract.principal-auth-state.v3",
    signature_sha256: "2e56c51ca3d2ad4889d818013cc503fc2727c6817d1d9d71663538901d3de385",
    payload_sha256: null },
  { owner: "orgmaster", contract_id: "orgmaster.principal-cutover-source",
    contract_version: "jenfu.orgmaster.principal-cutover-source.v1",
    signature_sha256: "ff36f90ac9b42d740d44cd049f45e27e5d08db0226dc9510041bd5bad9b51531",
    payload_sha256: null },
  { owner: "orgmaster", contract_id: "orgmaster.ai-pdm-principal-effective-grants",
    contract_version: "jenfu.orgmaster.ai-pdm-principal-grants.v2",
    signature_sha256: "74a9890b416b547cd013673487a78322a49da44b415b903015d55768504bbe71",
    payload_sha256: null },
  { owner: "aiPdm", contract_id: "ai-pdm.principal-security-owner-command",
    contract_version: "jenfu.ai-pdm.principal-security-owner-command.v1",
    signature_sha256: "a5bf9b3744cd2a0805dbf23045946ce99c986317bba7d85738687828aed74b62",
    payload_sha256: null },
];
const HASH = /^[a-f0-9]{64}$/u;
const OWNERS: readonly Owner[] = ["platform", "orgmaster", "aiPdm"];

function invalid(): never { throw new Error("PRINCIPAL_OWNER_MANIFEST_READBACK_INVALID"); }

/**
 * Caller owns a single read-only owner transaction as jenfu_ai_pdm_migrator.
 * No operation-file values are used to discover or hash the producer rows.
 */
export async function readPrincipalOwnerContractManifestHashes(snapshot: AsyncDatabaseClient) {
  if (snapshot.kind !== "postgres") invalid();
  const observed = await snapshot.query<ManifestRow>(`
    SELECT 'platform'::text AS owner, contract_id, contract_version,
      signature_sha256, payload_sha256
      FROM platform_contract.v_contract_manifest_v1
     WHERE contract_id = 'platform.principal-auth-state'
    UNION ALL
    SELECT 'orgmaster'::text AS owner, contract_id, contract_version,
      signature_sha256, payload_sha256
      FROM orgmaster_contract.v_contract_manifest_v1
     WHERE contract_id IN ('orgmaster.principal-cutover-source',
                           'orgmaster.ai-pdm-principal-effective-grants')
    UNION ALL
    SELECT 'aiPdm'::text AS owner, contract_id, contract_version,
      signature_sha256, payload_sha256
      FROM ai_pdm_contract.v_contract_manifest_v1
     WHERE contract_id = 'ai-pdm.principal-security-owner-command'
  `);
  if (observed.length !== REQUIRED.length) invalid();
  const expected = new Map(REQUIRED.map((row) => [`${row.owner}\0${row.contract_id}`, row]));
  const rowsByOwner = new Map<Owner, ManifestRow[]>();
  for (const row of observed) {
    const key = `${row.owner}\0${row.contract_id}`;
    const required = expected.get(key);
    if (!required || row.contract_version !== required.contract_version ||
      row.signature_sha256 !== required.signature_sha256 ||
      row.payload_sha256 !== required.payload_sha256 ||
      !HASH.test(row.signature_sha256) ||
      (row.payload_sha256 !== null && !HASH.test(row.payload_sha256))) invalid();
    expected.delete(key);
    const ownerRows = rowsByOwner.get(row.owner) ?? [];
    ownerRows.push(row);
    rowsByOwner.set(row.owner, ownerRows);
  }
  if (expected.size !== 0) invalid();
  const hashes = {} as Record<Owner, string>;
  for (const owner of OWNERS) {
    const rows = rowsByOwner.get(owner);
    if (!rows?.length) invalid();
    rows.sort((a, b) => Buffer.compare(
      Buffer.from(a.contract_id, "utf8"), Buffer.from(b.contract_id, "utf8")));
    const tuples = rows.map((row) => [row.contract_id, row.contract_version,
      row.signature_sha256, row.payload_sha256]);
    hashes[owner] = createHash("sha256")
      .update(JSON.stringify(["jenfu.dev121.owner-contract-manifest.v1", tuples]), "utf8")
      .digest("hex");
  }
  return hashes;
}

export async function assertPrincipalOwnerContractManifestHashes(
  snapshot: AsyncDatabaseClient, expected: Record<Owner, string>
) {
  if (!expected || Object.keys(expected).sort().join("\0") !==
    [...OWNERS].sort().join("\0") ||
    OWNERS.some((owner) => !HASH.test(expected[owner] ?? ""))) invalid();
  const observed = await readPrincipalOwnerContractManifestHashes(snapshot);
  if (OWNERS.some((owner) => observed[owner] !== expected[owner])) {
    throw new Error("PRINCIPAL_OWNER_MANIFEST_HASH_MISMATCH");
  }
  return observed;
}
