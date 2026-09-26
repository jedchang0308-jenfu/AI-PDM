import { describe, expect, it } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  assertPrincipalOwnerContractManifestHashes,
  readPrincipalOwnerContractManifestHashes,
} from "@/lib/jenfu-principal-owner-contract-manifest";

const rows = [
  { owner: "orgmaster", contract_id: "orgmaster.principal-cutover-source",
    contract_version: "jenfu.orgmaster.principal-cutover-source.v1",
    signature_sha256: "ff36f90ac9b42d740d44cd049f45e27e5d08db0226dc9510041bd5bad9b51531",
    payload_sha256: null },
  { owner: "aiPdm", contract_id: "ai-pdm.principal-security-owner-command",
    contract_version: "jenfu.ai-pdm.principal-security-owner-command.v1",
    signature_sha256: "a5bf9b3744cd2a0805dbf23045946ce99c986317bba7d85738687828aed74b62",
    payload_sha256: null },
  { owner: "platform", contract_id: "platform.principal-auth-state",
    contract_version: "jenfu.platform-contract.principal-auth-state.v3",
    signature_sha256: "2e56c51ca3d2ad4889d818013cc503fc2727c6817d1d9d71663538901d3de385",
    payload_sha256: null },
  { owner: "orgmaster", contract_id: "orgmaster.ai-pdm-principal-effective-grants",
    contract_version: "jenfu.orgmaster.ai-pdm-principal-grants.v2",
    signature_sha256: "74a9890b416b547cd013673487a78322a49da44b415b903015d55768504bbe71",
    payload_sha256: null },
];

function snapshot(result = rows): AsyncDatabaseClient {
  return { kind: "postgres", query: async () => result } as unknown as AsyncDatabaseClient;
}

describe("principal owner contract manifest readback", () => {
  it("hashes only exact versioned owner rows, independent of database row order", async () => {
    const observed = await readPrincipalOwnerContractManifestHashes(snapshot());
    expect(Object.keys(observed).sort()).toEqual(["aiPdm", "orgmaster", "platform"]);
    expect(Object.values(observed).every((hash) => /^[a-f0-9]{64}$/u.test(hash))).toBe(true);
    expect(await readPrincipalOwnerContractManifestHashes(snapshot([...rows].reverse())))
      .toEqual(observed);
    await expect(assertPrincipalOwnerContractManifestHashes(snapshot(), observed))
      .resolves.toEqual(observed);
    await expect(assertPrincipalOwnerContractManifestHashes(snapshot(), {
      ...observed, orgmaster: "0".repeat(64)
    })).rejects.toThrow("PRINCIPAL_OWNER_MANIFEST_HASH_MISMATCH");
  });

  it("rejects missing, duplicate and drifted producer contracts before a cutover", async () => {
    for (const result of [rows.slice(1), [...rows, rows[0]],
      rows.map((row) => row.owner === "platform" ?
        { ...row, signature_sha256: "0".repeat(64) } : row),
      rows.map((row) => row.owner === "orgmaster" &&
        row.contract_id === "orgmaster.principal-cutover-source" ?
        { ...row, contract_version: "v0" } : row)]) {
      await expect(readPrincipalOwnerContractManifestHashes(snapshot(result)))
        .rejects.toThrow("PRINCIPAL_OWNER_MANIFEST_READBACK_INVALID");
    }
    await expect(readPrincipalOwnerContractManifestHashes({ kind: "sqlite" } as AsyncDatabaseClient))
      .rejects.toThrow("PRINCIPAL_OWNER_MANIFEST_READBACK_INVALID");
  });
});
