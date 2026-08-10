import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getUserCompanyAccessAsync } from "@/lib/company-context";
import { canReadSubmissionAsync, isBomReleasedOnlyRole } from "@/lib/permissions";
import { suggestRevisionCode } from "@/lib/revision-policy";
import { getSubmissionAsync } from "@/lib/submissions-async";
import type { DbUser } from "@/lib/repositories/user-repository";
import type { BomReleaseSnapshotDetail, BomWorkbenchDraftSummary } from "@/lib/types";

export type BomCreatePartOption = {
  id: string;
  partNumber: string;
  partName: string;
  itemKind: string;
  recordStatus: string;
  bomUsagePolicy: string;
  suggestedBomRevision: string;
};

export type BomCreateCadSourceOption = {
  id: string;
  drawingNumber: string;
  drawingRevision: string;
  status: string;
  updatedAt: string;
};

export type BomOwnerAccessContext = {
  companyId: string;
  ownerPartNumberId: string;
  partNumber: string;
  partName: string;
  legacyItemId: string | null;
};

type BomCreatePartRow = {
  id: string;
  part_number: string;
  part_name: string;
  item_kind: string;
  record_status: string;
  bom_usage_policy: string;
};

export async function listBomCreatePartOptionsAsync(input: {
  user: DbUser;
  companyId: string;
  query?: string;
  limit?: number;
}): Promise<BomCreatePartOption[]> {
  if (isBomReleasedOnlyRole(input.user)) return [];
  if (!(await canAccessCompany(input.user, input.companyId))) return [];

  const client = getAsyncDatabaseClient();
  const query = input.query?.trim() ?? "";
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 100);
  const engineerClause = input.user.role === "Engineer" ? engineerOwnerClause("pn") : "1 = 1";
  const rows = await client.query<BomCreatePartRow>(
    `
      SELECT pn.id, pn.part_number, pn.part_name, pn.item_kind, pn.record_status, pn.bom_usage_policy
      FROM part_numbers pn
      WHERE pn.company_id = :companyId
        AND pn.record_status NOT IN ('Obsolete', 'Merged', 'MainDrawingInvalid')
        AND (
          :query = ''
          OR upper(pn.part_number) LIKE upper(:queryLike)
          OR upper(pn.part_name) LIKE upper(:queryLike)
        )
        AND ${engineerClause}
      ORDER BY pn.updated_at DESC, pn.part_number ASC
      LIMIT :limit
    `,
    { companyId: input.companyId, actorId: input.user.id, query, queryLike: `%${query}%`, limit }
  );

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      partNumber: row.part_number,
      partName: row.part_name,
      itemKind: row.item_kind,
      recordStatus: row.record_status,
      bomUsagePolicy: row.bom_usage_policy,
      suggestedBomRevision: await suggestNextBomRevision(client, row.id)
    }))
  );
}

export async function listBomCreateCadSourcesAsync(input: {
  user: DbUser;
  companyId: string;
  ownerPartNumberId: string;
}): Promise<BomCreateCadSourceOption[]> {
  const owner = await resolveBomOwnerAccessContextAsync(input);
  if (!owner) return [];

  const client = getAsyncDatabaseClient();
  const rows = await client.query<{
    id: string;
    drawing_number: string;
    revision: string;
    status: string;
    updated_at: string;
  }>(
    `
      SELECT DISTINCT s.id, s.drawing_number, s.revision, s.status, s.updated_at
      FROM submissions s
      LEFT JOIN submission_part_scopes sps
        ON sps.submission_id = s.id
       AND sps.part_number_id = :ownerPartNumberId
      LEFT JOIN items i ON i.id = s.item_id
      WHERE s.company_id = :companyId
        AND (
          sps.part_number_id IS NOT NULL
          OR (
            NOT EXISTS (SELECT 1 FROM submission_part_scopes any_scope WHERE any_scope.submission_id = s.id)
            AND upper(i.part_number) = upper(:partNumber)
          )
        )
      ORDER BY s.updated_at DESC, s.id DESC
    `,
    { companyId: input.companyId, ownerPartNumberId: input.ownerPartNumberId, partNumber: owner.partNumber }
  );

  const visible: BomCreateCadSourceOption[] = [];
  for (const row of rows) {
    const submission = await getSubmissionAsync(row.id);
    if (!submission || !(await canReadSubmissionAsync(input.user, submission))) continue;
    visible.push({
      id: row.id,
      drawingNumber: row.drawing_number,
      drawingRevision: row.revision,
      status: row.status,
      updatedAt: row.updated_at
    });
  }
  return visible;
}

export async function resolveBomOwnerAccessContextAsync(input: {
  user: DbUser;
  companyId: string;
  ownerPartNumberId: string;
}): Promise<BomOwnerAccessContext | null> {
  if (isBomReleasedOnlyRole(input.user)) return null;
  if (!(await canAccessCompany(input.user, input.companyId))) return null;

  const client = getAsyncDatabaseClient();
  const engineerClause = input.user.role === "Engineer" ? engineerOwnerClause("pn") : "1 = 1";
  const row = await client.queryOne<{
    id: string;
    company_id: string;
    part_number: string;
    part_name: string;
    legacy_item_id: string | null;
  }>(
    `
      SELECT
        pn.id,
        pn.company_id,
        pn.part_number,
        pn.part_name,
        (SELECT i.id FROM items i WHERE i.company_id = pn.company_id AND upper(i.part_number) = upper(pn.part_number) ORDER BY i.id LIMIT 1) AS legacy_item_id
      FROM part_numbers pn
      WHERE pn.id = :ownerPartNumberId
        AND pn.company_id = :companyId
        AND pn.record_status NOT IN ('Obsolete', 'Merged', 'MainDrawingInvalid')
        AND ${engineerClause}
      LIMIT 1
    `,
    { companyId: input.companyId, ownerPartNumberId: input.ownerPartNumberId, actorId: input.user.id }
  );
  if (!row) return null;
  return {
    companyId: row.company_id,
    ownerPartNumberId: row.id,
    partNumber: row.part_number,
    partName: row.part_name,
    legacyItemId: row.legacy_item_id
  };
}

export async function canCreateBomDraftAsync(input: {
  user: DbUser;
  companyId: string;
  ownerPartNumberId: string;
  sourceSubmissionId?: string | null;
}) {
  const owner = await resolveBomOwnerAccessContextAsync(input);
  if (!owner) return false;
  if (!input.sourceSubmissionId) return true;
  const allowedSources = await listBomCreateCadSourcesAsync(input);
  return allowedSources.some((source) => source.id === input.sourceSubmissionId);
}

export async function canReadBomDraftRecordAsync(user: DbUser, draft: BomWorkbenchDraftSummary) {
  if (isBomReleasedOnlyRole(user)) return false;
  if (draft.owner_part_number_id && draft.company_id) {
    return Boolean(
      await resolveBomOwnerAccessContextAsync({
        user,
        companyId: draft.company_id,
        ownerPartNumberId: draft.owner_part_number_id
      })
    );
  }
  if (!draft.parent_submission_id) return false;
  const submission = await getSubmissionAsync(draft.parent_submission_id);
  return submission ? canReadSubmissionAsync(user, submission) : false;
}

export async function canReadBomReleaseSnapshotRecordAsync(user: DbUser, snapshot: BomReleaseSnapshotDetail) {
  if (snapshot.owner_part_number_id && snapshot.company_id) {
    if (!(await canAccessCompany(user, snapshot.company_id))) return false;
    if (isBomReleasedOnlyRole(user)) return true;
    return Boolean(
      await resolveBomOwnerAccessContextAsync({
        user,
        companyId: snapshot.company_id,
        ownerPartNumberId: snapshot.owner_part_number_id
      })
    );
  }
  if (!snapshot.parent_submission_id) return false;
  const submission = await getSubmissionAsync(snapshot.parent_submission_id);
  return submission ? canReadSubmissionAsync(user, submission) : false;
}

async function suggestNextBomRevision(client: AsyncDatabaseClient, ownerPartNumberId: string) {
  const released = await client.query<{ revision: string; status: string }>(
    `
      SELECT bom_revision AS revision, 'Released' AS status
      FROM bom_release_snapshots
      WHERE owner_part_number_id = :ownerPartNumberId
        AND bom_revision IS NOT NULL
      ORDER BY released_at DESC, id DESC
    `,
    { ownerPartNumberId }
  );
  const occupied = await client.query<{ revision: string }>(
    `
      SELECT bom_revision AS revision
      FROM bom_drafts
      WHERE owner_part_number_id = :ownerPartNumberId
        AND bom_revision IS NOT NULL
        AND status <> 'Archived'
    `,
    { ownerPartNumberId }
  );
  const occupiedRevisions = new Set(occupied.map((row) => row.revision.trim()));
  let suggestion = Number(suggestRevisionCode(released, "release_area"));
  while (occupiedRevisions.has(String(suggestion))) suggestion += 1;
  return String(suggestion);
}

function engineerOwnerClause(alias: string) {
  return `(
    ${alias}.created_by = :actorId
    OR EXISTS (
      SELECT 1
      FROM submission_part_scopes sps
      JOIN submissions scoped_submission ON scoped_submission.id = sps.submission_id
      WHERE sps.part_number_id = ${alias}.id
        AND scoped_submission.submitted_by = :actorId
        AND scoped_submission.company_id = ${alias}.company_id
    )
    OR EXISTS (
      SELECT 1
      FROM submissions legacy_submission
      JOIN items legacy_item ON legacy_item.id = legacy_submission.item_id
      WHERE legacy_submission.submitted_by = :actorId
        AND legacy_submission.company_id = ${alias}.company_id
        AND upper(legacy_item.part_number) = upper(${alias}.part_number)
        AND NOT EXISTS (
          SELECT 1 FROM submission_part_scopes legacy_scope WHERE legacy_scope.submission_id = legacy_submission.id
        )
    )
  )`;
}

async function canAccessCompany(user: DbUser, companyId: string) {
  if (user.company_id === companyId) return true;
  const companies = await getUserCompanyAccessAsync(user.id);
  return companies.some((company) => company.companyId === companyId);
}
