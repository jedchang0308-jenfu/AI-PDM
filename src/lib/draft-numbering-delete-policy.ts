import { createHash } from "node:crypto";

export type DraftNumberingDeleteMember = {
  id: string;
  code: string;
  status: string;
  responsibleUserIds: readonly (string | null)[];
};

export type DraftNumberingMemberTarget = { kind: "drawing" | "part"; code: string };
export type DraftNumberingReuse = {
  code: string;
  kind: "root" | "drawing" | "part";
  status: "reusable" | "not_reusable" | "unknown";
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
  recognitionSessions?: readonly { id: string; rowVersion: number; status: string }[];
  controlledReferences: number;
  target?: DraftNumberingMemberTarget;
  blockers?: readonly string[];
  controlledReasons?: readonly string[];
  numberReuse?: readonly DraftNumberingReuse[];
  workVersions?: readonly { id: string; version: number }[];
};

export type DraftNumberingDeleteActor = { userId: string; systemAdmin: boolean };

export function draftNumberingDeleteMembers(basis: DraftNumberingDeleteBasis) {
  return [...(basis.target ? [] : [basis.root]), ...basis.drawings, ...basis.parts];
}

export function isResponsibleForDraftNumberingDelete(basis: DraftNumberingDeleteBasis, userId: string) {
  return draftNumberingDeleteMembers(basis).every(member => member.responsibleUserIds.length > 0 &&
    member.responsibleUserIds.every(id => id === userId)) &&
    basis.transfers.every(ref => ref.packageOwnerId === userId);
}

export function checkDraftNumberingDelete(basis: DraftNumberingDeleteBasis, actor: DraftNumberingDeleteActor) {
  const members = draftNumberingDeleteMembers(basis);
  if (!actor.systemAdmin && !isResponsibleForDraftNumberingDelete(basis, actor.userId)) {
    return "NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE";
  }
  if (members.some(({ status }) => status !== "Draft" && status !== "NeedInfo")) {
    return "NUMBERING_BUNDLE_NOT_DRAFT";
  }
  if (basis.controlledReferences !== 0) return "NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES";
  if (basis.blockers?.length) return "NUMBERING_DRAFT_DELETE_BLOCKED";
  if (basis.auxiliaryJobs?.some(job => !["completed", "failed", "cancelled"].includes(job.status) || job.dispatchState !== "terminal")) {
    return "NUMBERING_DRAFT_DELETE_OPEN_SWX_ACTIVE";
  }
  if (basis.transfers.some(ref => ref.packageStatus !== "Draft")) {
    return "NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES";
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
  const recognition = [...(basis.recognitionSessions ?? [])]
    .sort((left, right) => left.id.localeCompare(right.id));
  return createHash("sha256").update(JSON.stringify([
    "numbering-draft-delete-v1", basis.companyId, actor.userId, actor.systemAdmin, member(basis.root),
    members(basis.drawings), members(basis.parts), transfers, [...basis.fileIds].sort(),
    [...(basis.fileNames ?? [])].sort(), basis.controlledReferences,
    [...(basis.auxiliaryJobs ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    ...(recognition.length ? [recognition] : []),
    ...(basis.target ? [basis.target] : []),
    ...(basis.blockers ? [basis.blockers] : []),
    ...(basis.numberReuse ? [basis.numberReuse] : []),
    ...(basis.workVersions ? [[...basis.workVersions].sort((left, right) => left.id.localeCompare(right.id))] : [])
  ])).digest("hex");
}
