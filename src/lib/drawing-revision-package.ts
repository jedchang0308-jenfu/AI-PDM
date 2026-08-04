import type { RevisionPackageFileRole } from "@/lib/revision-package";

export type DrawingRevisionPackageStatus = "Draft" | "Pending" | "Released" | "Rejected" | "Cancelled";
export type DrawingRevisionPackageEffectiveStatus = DrawingRevisionPackageStatus | "ReviewApproved";

export function projectDrawingRevisionPackageEffectiveStatus(input: {
  physicalStatus: DrawingRevisionPackageStatus;
  packageId: string;
  companionPackageId?: string | null;
  companionSnapshotHash?: string | null;
  candidateReviewSnapshotHash?: string | null;
}): DrawingRevisionPackageEffectiveStatus {
  if (
    input.physicalStatus === "Pending" &&
    input.companionPackageId === input.packageId &&
    Boolean(input.companionSnapshotHash) &&
    input.companionSnapshotHash === input.candidateReviewSnapshotHash
  ) return "ReviewApproved";
  return input.physicalStatus;
}
export type DrawingRevisionPackageSupplementStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";
export type DrawingRevisionPackageSupplementReasonCode =
  | "format_file"
  | "auxiliary_material"
  | "metadata_correction"
  | "content_changed_new_revision"
  | "other";

export type DrawingRevisionPackageFileKind = "core" | "supplement";

export type DrawingRevisionSupplementFileInput = {
  fileId: string;
  role?: RevisionPackageFileRole | null;
  displayName?: string | null;
  description?: string | null;
};

export const drawingRevisionSupplementReasons: Array<{
  code: DrawingRevisionPackageSupplementReasonCode;
  label: string;
  systemWording: string;
  noteRequired: boolean;
  revisionWarning: boolean;
}> = [
  {
    code: "format_file",
    label: "補交格式檔",
    systemWording: "設計內容未變，只補交其他格式檔。",
    noteRequired: false,
    revisionWarning: false
  },
  {
    code: "auxiliary_material",
    label: "補交輔助資料",
    systemWording: "不作為設計變更依據，只作為作業輔助資料。",
    noteRequired: false,
    revisionWarning: false
  },
  {
    code: "metadata_correction",
    label: "修正附件資訊",
    systemWording: "只修正附件資訊，不更換正式設計內容。",
    noteRequired: false,
    revisionWarning: false
  },
  {
    code: "content_changed_new_revision",
    label: "內容有變更，建立新版次",
    systemWording: "這不是補附件，應建立新版次。",
    noteRequired: false,
    revisionWarning: true
  },
  {
    code: "other",
    label: "其他",
    systemWording: "請補充說明補件原因。",
    noteRequired: true,
    revisionWarning: false
  }
];

const supplementReasonCodes = new Set(drawingRevisionSupplementReasons.map((reason) => reason.code));

export function normalizeSupplementReasonCode(value: unknown): DrawingRevisionPackageSupplementReasonCode | null {
  const text = String(value ?? "").trim();
  return supplementReasonCodes.has(text as DrawingRevisionPackageSupplementReasonCode)
    ? (text as DrawingRevisionPackageSupplementReasonCode)
    : null;
}

export function getSupplementReasonDefinition(code: DrawingRevisionPackageSupplementReasonCode) {
  return drawingRevisionSupplementReasons.find((reason) => reason.code === code) ?? drawingRevisionSupplementReasons[0];
}
