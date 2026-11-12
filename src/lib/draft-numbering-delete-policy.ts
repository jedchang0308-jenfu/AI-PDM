import { createHash } from "node:crypto";

export type DraftNumberingDeleteMember = {
  id: string;
  code: string;
  status: string;
  responsibleUserIds: readonly (string | null)[];
};

export type DraftNumberingDeleteTransferReference = {
  id: string;
  packageId: string;
  packageCode: string;
  packageStatus: string;
  packageOwnerId: string | null;
  packageVersion: number;
  entityCode: string;
};

export type DraftNumberingDeleteBasis = {
  companyId: string;
  root: DraftNumberingDeleteMember;
  drawings: readonly DraftNumberingDeleteMember[];
  parts: readonly DraftNumberingDeleteMember[];
  transfers: readonly DraftNumberingDeleteTransferReference[];
  fileIds: readonly string[];
  fileNames?: readonly string[];
  auxiliaryJobs?: readonly { id: string; status: string; dispatchState: string }[];
  controlledReferences: number;
};

export type DraftNumberingDeleteActor = { userId: string; systemAdmin: boolean };

export function checkDraftNumberingDelete(basis: DraftNumberingDeleteBasis, actor: DraftNumberingDeleteActor) {
  const members = [basis.root, ...basis.drawings, ...basis.parts];
  if (members.some(({ status }) => status !== "Draft" && status !== "NeedInfo")) {
    return "NUMBERING_BUNDLE_NOT_DRAFT";
  }
  if (basis.controlledReferences !== 0) return "NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES";
  if (basis.auxiliaryJobs?.some(job => !["completed", "failed", "cancelled"].includes(job.status) || job.dispatchState !== "terminal")) {
    return "NUMBERING_DRAFT_DELETE_OPEN_SWX_ACTIVE";
  }
  if (!actor.systemAdmin && members.some(({ responsibleUserIds }) =>
    responsibleUserIds.length === 0 || responsibleUserIds.some(id => id !== actor.userId))) {
    return "NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE";
  }
  if (basis.transfers.some(ref => ref.packageStatus !== "Draft")) {
    return "NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES";
  }
  if (!actor.systemAdmin && basis.transfers.some(ref => ref.packageOwnerId !== actor.userId)) {
    return "NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE";
  }
  return null;
}

export function draftNumberingDeleteFingerprint(basis: DraftNumberingDeleteBasis, actor: DraftNumberingDeleteActor) {
  const member = ({ id, code, status, responsibleUserIds }: DraftNumberingDeleteMember) =>
    [id, code, status, [...responsibleUserIds].sort()];
  const members = (entries: readonly DraftNumberingDeleteMember[]) =>
    [...entries].sort((left, right) => left.id.localeCompare(right.id)).map(member);
  const transfers = [...basis.transfers].sort((left, right) => left.id.localeCompare(right.id)).map(ref =>
    [ref.id, ref.packageId, ref.packageCode, ref.packageStatus, ref.packageOwnerId, ref.packageVersion, ref.entityCode]);
  return createHash("sha256").update(JSON.stringify([
    "numbering-draft-delete-v1", basis.companyId, actor.userId, actor.systemAdmin, member(basis.root),
    members(basis.drawings), members(basis.parts), transfers, [...basis.fileIds].sort(),
    [...(basis.fileNames ?? [])].sort(), basis.controlledReferences,
    [...(basis.auxiliaryJobs ?? [])].sort((left, right) => left.id.localeCompare(right.id))
  ])).digest("hex");
}
