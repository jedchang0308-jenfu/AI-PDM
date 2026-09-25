import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  JenfuPrincipalInventoryRepository,
  type PrincipalInventoryCandidate,
  type PrincipalInventoryInput
} from "@/lib/jenfu-principal-inventory-repository";

export type PrincipalInventoryRegistrationInput = {
  sources: PrincipalInventoryInput[];
  expectedSourceHash: string;
  expectedRowVersion: number;
};

export type PrincipalInventoryRegistrationReceipt = {
  pdmUserId: string;
  principalId: string;
  status: "legacy_compatible";
  sourceHash: string;
  rowVersion: number;
  replayed: boolean;
};

export class PrincipalInventoryRegistrationError extends Error {
  constructor(readonly code:
    | "principal_inventory_registration_invalid"
    | "principal_inventory_registration_source_drift"
    | "principal_inventory_registration_conflict"
    | "principal_inventory_already_active") {
    super(code);
  }
}

type Marker = {
  pdm_user_id: string;
  principal_id: string | null;
  status: string;
  source_hash: string;
  row_version: number | string;
};

export function hashPrincipalInventory(candidates: PrincipalInventoryCandidate[]): string {
  const ordered = [...candidates].sort((left, right) =>
    left.sourceKind < right.sourceKind ? -1 : left.sourceKind > right.sourceKind ? 1 : 0);
  const canonical = ordered.map((candidate) => ({
    sourceKind: candidate.sourceKind,
    identityIssuer: candidate.identityIssuer,
    identitySubject: candidate.identitySubject,
    mappingVersion: candidate.mappingVersion,
    publishedAt: candidate.publishedAt,
    principalId: candidate.principalId,
    employeeId: candidate.employeeId,
    accountType: candidate.accountType,
    pdmUserId: candidate.pdmUserId,
    companyId: candidate.companyId,
    accountStatus: candidate.accountStatus,
    lifecycleVersion: candidate.lifecycleVersion,
    systemRoleEnabled: candidate.systemRoleEnabled,
    sessionInvalidBefore: candidate.sessionInvalidBefore
  }));
  return crypto.createHash("sha256").update(JSON.stringify({
    contractVersion: "ai-pdm.principal-inventory-source.v1", sources: canonical
  })).digest("hex");
}

function assertInput(input: PrincipalInventoryRegistrationInput) {
  if (!input || !Array.isArray(input.sources) || input.sources.length < 1 ||
    !/^[0-9a-f]{64}$/u.test(input.expectedSourceHash) ||
    !Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 0 ||
    input.expectedRowVersion >= Number.MAX_SAFE_INTEGER) {
    throw new PrincipalInventoryRegistrationError("principal_inventory_registration_invalid");
  }
}

async function readSources(client: AsyncDatabaseClient, firebaseProjectId: string,
  sources: PrincipalInventoryInput[]) {
  return new JenfuPrincipalInventoryRepository(client, firebaseProjectId)
    .requireExactCandidateSet(sources);
}

/** Owner-only preview; the registration transaction always repeats this readback. */
export async function previewPrincipalInventory(database: AsyncDatabaseClient,
  firebaseProjectId: string, sources: PrincipalInventoryInput[]) {
  if (database.kind !== "postgres") {
    throw new PrincipalInventoryRegistrationError("principal_inventory_registration_invalid");
  }
  return database.transaction(async (client) => {
    await client.execute("SET LOCAL ROLE jenfu_ai_pdm_migrator");
    const candidates = await readSources(client, firebaseProjectId, sources);
    const marker = await client.queryOne<Marker>(`
      SELECT pdm_user_id,principal_id,status,source_hash,row_version
      FROM ai_pdm_core.principal_identity_cutovers
      WHERE pdm_user_id=:pdmUserId
    `, { pdmUserId: candidates[0].pdmUserId });
    if (marker?.status === "principal_active") {
      throw new PrincipalInventoryRegistrationError("principal_inventory_already_active");
    }
    const expectedRowVersion = marker ? Number(marker.row_version) : 0;
    if (marker && (marker.pdm_user_id !== candidates[0].pdmUserId ||
      marker.status !== "legacy_compatible" ||
      (marker.principal_id !== null && marker.principal_id !== candidates[0].principalId) ||
      !Number.isSafeInteger(expectedRowVersion) || expectedRowVersion < 1)) {
      throw new PrincipalInventoryRegistrationError("principal_inventory_registration_conflict");
    }
    return { candidates, sourceHash: hashPrincipalInventory(candidates),
      markerStatus: marker ? "legacy_compatible" as const : "missing" as const,
      expectedRowVersion };
  }, { isolationLevel: "repeatable_read", readOnly: true });
}

/** No ACL, session or principal account mutation is permitted at inventory registration. */
export async function registerPrincipalInventory(database: AsyncDatabaseClient,
  firebaseProjectId: string, input: PrincipalInventoryRegistrationInput
): Promise<PrincipalInventoryRegistrationReceipt> {
  assertInput(input);
  if (database.kind !== "postgres") {
    throw new PrincipalInventoryRegistrationError("principal_inventory_registration_invalid");
  }
  return database.transaction(async (client) => {
    await client.execute("SET LOCAL ROLE jenfu_ai_pdm_migrator");
    await client.execute("SET LOCAL lock_timeout = '2s'");
    await client.execute("SET LOCAL statement_timeout = '5s'");
    const pdmUserId = input.sources[0]?.pdmUserId;
    const principalId = input.sources[0]?.principalId;
    if (typeof pdmUserId !== "string" || typeof principalId !== "string") {
      throw new PrincipalInventoryRegistrationError("principal_inventory_registration_invalid");
    }
    const marker = await client.queryOne<Marker>(`
      SELECT pdm_user_id,principal_id,status,source_hash,row_version
      FROM ai_pdm_core.principal_identity_cutovers
      WHERE pdm_user_id=:pdmUserId FOR UPDATE
    `, { pdmUserId });
    if (marker?.status === "principal_active") {
      throw new PrincipalInventoryRegistrationError("principal_inventory_already_active");
    }
    const rowVersion = marker ? Number(marker.row_version) : 0;
    if (marker && (!Number.isSafeInteger(rowVersion) || rowVersion < 1 ||
      marker.pdm_user_id !== pdmUserId ||
      (marker.principal_id !== null && marker.principal_id !== principalId))) {
      throw new PrincipalInventoryRegistrationError("principal_inventory_registration_conflict");
    }
    const candidates = await readSources(client, firebaseProjectId, input.sources);
    const sourceHash = hashPrincipalInventory(candidates);
    if (sourceHash !== input.expectedSourceHash) {
      throw new PrincipalInventoryRegistrationError("principal_inventory_registration_source_drift");
    }
    if (marker?.principal_id === principalId &&
      marker.source_hash === sourceHash && marker.status === "legacy_compatible") {
      return { pdmUserId, principalId, status: "legacy_compatible",
        sourceHash, rowVersion, replayed: true };
    }
    if (rowVersion !== input.expectedRowVersion) {
      throw new PrincipalInventoryRegistrationError("principal_inventory_registration_conflict");
    }
    if (marker) {
      await client.execute(`
        UPDATE ai_pdm_core.principal_identity_cutovers
        SET principal_id=:principalId,source_hash=:sourceHash,row_version=row_version+1
        WHERE pdm_user_id=:pdmUserId AND status='legacy_compatible'
          AND row_version=:rowVersion
      `, { pdmUserId, principalId, sourceHash, rowVersion });
    } else {
      await client.execute(`
        INSERT INTO ai_pdm_core.principal_identity_cutovers
          (pdm_user_id,principal_id,status,source_hash)
        VALUES (:pdmUserId,:principalId,'legacy_compatible',:sourceHash)
      `, { pdmUserId, principalId, sourceHash });
    }
    const current = await client.queryOne<Marker>(`
      SELECT pdm_user_id,principal_id,status,source_hash,row_version
      FROM ai_pdm_core.principal_identity_cutovers
      WHERE pdm_user_id=:pdmUserId
    `, { pdmUserId });
    if (!current || current.pdm_user_id !== pdmUserId ||
      current.principal_id !== principalId || current.status !== "legacy_compatible" ||
      current.source_hash !== sourceHash || Number(current.row_version) !== rowVersion + 1) {
      throw new PrincipalInventoryRegistrationError("principal_inventory_registration_conflict");
    }
    return { pdmUserId, principalId, status: "legacy_compatible", sourceHash,
      rowVersion: rowVersion + 1, replayed: false };
  }, { isolationLevel: "repeatable_read", readOnly: false });
}
