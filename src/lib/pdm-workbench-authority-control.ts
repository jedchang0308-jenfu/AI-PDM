import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  CanonicalWorkbenchError,
  createCanonicalContractToken,
  DEV087_SCHEMA_HASH,
  verifyCanonicalContractToken
} from "@/lib/pdm-canonical-workbench-contract";

export type WorkbenchAuthorityMode = "legacy_only" | "shadow_compare" | "cutover_window" | "canonical_only";
export type WorkbenchAuthorityControl = {
  id: 1;
  mode: WorkbenchAuthorityMode;
  expectedCommit: string;
  schemaHash: string;
  rowVersion: number;
  switchedAt: string;
};

type AuthorityRow = {
  id: number;
  mode: WorkbenchAuthorityMode;
  expected_commit: string;
  schema_hash: string;
  row_version: number;
  switched_at: string | Date;
};

export async function readWorkbenchAuthorityControl(client: AsyncDatabaseClient): Promise<WorkbenchAuthorityControl> {
  const row = await client.queryOne<AuthorityRow>(
    `SELECT id, mode, expected_commit, schema_hash, row_version, switched_at
       FROM pdm_workbench_state_authority_control WHERE id = 1`
  );
  if (!row || row.id !== 1) throw new CanonicalWorkbenchError("WORKBENCH_AUTHORITY_MISMATCH", "系統切換中，請稍後再試", 503);
  return {
    id: 1,
    mode: row.mode,
    expectedCommit: row.expected_commit,
    schemaHash: row.schema_hash,
    rowVersion: Number(row.row_version),
    switchedAt: row.switched_at instanceof Date ? row.switched_at.toISOString() : row.switched_at
  };
}

export function runtimeCommit() {
  return process.env.PDM_BUILD_COMMIT?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local-dev";
}

export async function assertCanonicalWorkbenchAuthority(client: AsyncDatabaseClient) {
  const control = await readWorkbenchAuthorityControl(client);
  if (
    control.mode !== "canonical_only" || control.schemaHash !== DEV087_SCHEMA_HASH ||
    !control.expectedCommit || control.expectedCommit !== runtimeCommit()
  ) {
    throw new CanonicalWorkbenchError("WORKBENCH_AUTHORITY_MISMATCH", "系統切換中，請稍後再試", 503);
  }
  return control;
}

export async function issueCanonicalWorkbenchContract(client: AsyncDatabaseClient, input: { companyId: string; actorId: string }) {
  const control = await assertCanonicalWorkbenchAuthority(client);
  return createCanonicalContractToken({
    companyId: input.companyId,
    actorId: input.actorId,
    schemaHash: control.schemaHash,
    expectedCommit: control.expectedCommit
  });
}

export async function verifyCanonicalWorkbenchCommandContract(client: AsyncDatabaseClient, input: {
  companyId: string;
  actorId: string;
  token: string | null | undefined;
}) {
  const control = await assertCanonicalWorkbenchAuthority(client);
  return verifyCanonicalContractToken(input.token, {
    companyId: input.companyId,
    actorId: input.actorId,
    schemaHash: control.schemaHash,
    expectedCommit: control.expectedCommit
  });
}

const transitions: Record<WorkbenchAuthorityMode, readonly WorkbenchAuthorityMode[]> = {
  legacy_only: ["shadow_compare", "cutover_window"],
  shadow_compare: ["legacy_only", "cutover_window"],
  cutover_window: ["legacy_only", "canonical_only"],
  canonical_only: ["legacy_only"]
};

export async function switchWorkbenchAuthority(client: AsyncDatabaseClient, input: {
  fromMode: WorkbenchAuthorityMode;
  toMode: WorkbenchAuthorityMode;
  expectedRowVersion: number;
  expectedCommit: string;
  schemaHash?: string;
}) {
  if (!transitions[input.fromMode].includes(input.toMode)) throw new Error("DEV087_AUTHORITY_TRANSITION_NOT_ALLOWED");
  if ((input.toMode === "cutover_window" || input.toMode === "canonical_only") && !input.expectedCommit.trim()) {
    throw new Error("DEV087_EXPECTED_COMMIT_REQUIRED");
  }
  return client.transaction(async (tx) => {
    const lock = tx.kind === "postgres" ? " FOR UPDATE" : "";
    const current = await tx.queryOne<AuthorityRow>(
      `SELECT id, mode, expected_commit, schema_hash, row_version, switched_at
         FROM pdm_workbench_state_authority_control WHERE id = 1${lock}`
    );
    if (!current || current.mode !== input.fromMode || Number(current.row_version) !== input.expectedRowVersion) {
      throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    }
    await tx.execute(
      `UPDATE pdm_workbench_state_authority_control
          SET mode = :toMode, expected_commit = :expectedCommit, schema_hash = :schemaHash,
              row_version = row_version + 1, switched_at = CURRENT_TIMESTAMP
        WHERE id = 1 AND row_version = :expectedRowVersion`,
      {
        toMode: input.toMode,
        expectedCommit: input.expectedCommit.trim(),
        schemaHash: input.schemaHash ?? DEV087_SCHEMA_HASH,
        expectedRowVersion: input.expectedRowVersion
      }
    );
    return readWorkbenchAuthorityControl(tx);
  }, { serializable: true });
}
