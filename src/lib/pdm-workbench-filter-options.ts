import type { NumberingRecordStatus } from "@/lib/repositories/numbering-repository";

export const PDM_WORKBENCH_RECORD_STATUS_VALUES = [
  "Draft",
  "NeedInfo",
  "Active",
  "PendingReview",
  "Released",
  "Rejected",
  "Obsolete",
  "Merged",
  "PendingAdminConfirm",
  "MainDrawingInvalid"
] as const satisfies readonly NumberingRecordStatus[];

export const PART_WORKBENCH_ITEM_KIND_VALUES = ["purchased", "manufactured"] as const;
export const RELATION_WORKBENCH_ENTITY_TYPE_VALUES = ["part_root", "part_number", "drawing_number"] as const;
