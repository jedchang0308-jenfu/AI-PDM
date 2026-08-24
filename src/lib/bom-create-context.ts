import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { getUserCompanyAccessAsync } from "@/lib/company-context";
import { canReadSubmissionAsync, isBomReleasedOnlyRole } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";
import type { DbUser } from "@/lib/repositories/user-repository";
import type { BomReleaseSnapshotDetail, BomWorkbenchDraftSummary } from "@/lib/types";

export type BomOwnerAccessContext = {
  companyId: string;
  ownerPartNumberId: string;
  partNumber: string;
  partName: string;
  legacyItemId: string | null;
};

export async function resolveBomOwnerAccessContextAsync(input: {
  user: DbUser;
  companyId: string;
  ownerPartNumberId: string;
}): Promise<BomOwnerAccessContext | null> {
  if (isBomReleasedOnlyRole(input.user)) return null;
  if (!(await canAccessCompany(input.user, input.companyId))) return null;

  const row = await getAsyncDatabaseClient().queryOne<{
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

export async function canReadBomDraftRecordAsync(user: DbUser, draft: BomWorkbenchDraftSummary) {
  if (isBomReleasedOnlyRole(user)) {
    return draft.status === "Released" && Boolean(draft.company_id) && await canAccessCompany(user, draft.company_id!);
  }
  if (draft.owner_part_number_id && draft.company_id) {
    return Boolean(
      await resolveBomOwnerAccessContextAsync({
        user,
        companyId: draft.company_id,
        ownerPartNumberId: draft.owner_part_number_id
      })
    );
  }
  if (draft.company_id && await canAccessCompany(user, draft.company_id)) return true;
  if (!draft.parent_submission_id) return false;
  const submission = await getSubmissionAsync(draft.parent_submission_id);
  return submission ? canReadSubmissionAsync(user, submission) : false;
}

export async function canManageBomDraftRecordAsync(user: DbUser, draft: BomWorkbenchDraftSummary) {
  if (isBomReleasedOnlyRole(user)) return false;
  return canReadBomDraftRecordAsync(user, draft);
}

export async function canEditBomDraftRecordAsync(user: DbUser, draft: BomWorkbenchDraftSummary) {
  if (draft.status !== "Draft" && draft.status !== "Rejected") return false;
  return canReadBomDraftRecordAsync(user, draft);
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

async function canAccessCompany(user: DbUser, companyId: string) {
  if (user.company_id === companyId) return true;
  const companies = await getUserCompanyAccessAsync(user.id);
  return companies.some((company) => company.companyId === companyId);
}
