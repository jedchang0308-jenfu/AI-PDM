import type { MasterAttachmentEntityType } from "@/lib/repositories/master-attachment-repository";
import type { PartNumberDraftStatus } from "@/lib/pdm-change-control-domain";
import type { NumberingRecordStatus } from "@/lib/repositories/numbering-repository";
import type { RootObsoletePolicy } from "@/lib/repositories/numbering-repository";
import type { SubmissionStatus } from "@/lib/types";

export type LifecycleEntityType =
  | "master_attachment"
  | "part_number_draft"
  | "numbering_import_batch"
  | "submission"
  | "numbering_part_root"
  | "numbering_part_number"
  | "numbering_drawing_number";
export type LifecycleVisibleStage = "draft" | "in_review" | "formal" | "history";
export type LifecycleStageLabel = "草稿" | "審核中" | "正式" | "歷史";
export type LifecycleUiSurface = "work_list" | "deleted_data" | "controlled_history";
export type LifecycleTraceabilityClass = "working" | "uncontrolled_deleted" | "controlled_history";
export type LifecycleDetailTag = "待補" | "已發行" | "可還原" | "不可還原" | "被引用" | "需審核";

export type LifecycleActionState = {
  allowed: boolean;
  requiresApproval?: boolean;
  reasonCode?: string;
  message?: string;
};

export type LifecycleActionPolicy = {
  entityType: LifecycleEntityType;
  entityId: string;
  parentType?: MasterAttachmentEntityType;
  parentCode?: string;
  visibleStage: LifecycleVisibleStage;
  stageLabel: LifecycleStageLabel;
  uiSurface: LifecycleUiSurface;
  traceabilityClass: LifecycleTraceabilityClass;
  detailTags: LifecycleDetailTag[];
  actions: {
    delete?: LifecycleActionState;
    restore?: LifecycleActionState;
    obsolete?: LifecycleActionState & { requiresApproval: boolean };
  };
};

export function buildNumberingPartRootLifecyclePolicy(input: {
  rootStatus: NumberingRecordStatus;
  childStatuses: NumberingRecordStatus[];
  controlledReferenceCount: number;
  activeCanonicalActivityCount?: number;
  pendingObsoleteRequest?: boolean;
  canDirectObsolete?: boolean;
  canRequestObsolete?: boolean;
  directGateOpen?: boolean;
  formalGateOpen?: boolean;
}): RootObsoletePolicy {
  const terminal = input.rootStatus === "Obsolete" || input.rootStatus === "Merged" || input.childStatuses.some((status) => status === "Merged");
  if (terminal || input.pendingObsoleteRequest) {
    return {
      action: "none",
      availability: "inert",
      requiresApproval: false,
      requiresReason: false,
      requiresAcknowledgement: false,
      reasonCode: input.pendingObsoleteRequest ? "LIFE_OBSOLETE_ALREADY_REQUESTED" : "LIFE_ROOT_MIXED_OR_TERMINAL",
      message: input.pendingObsoleteRequest ? "此圖料根號已有作廢申請處理中。" : "此圖料根號已進入受控歷史，不能重複作廢。"
    };
  }

  if ((input.activeCanonicalActivityCount ?? 0) > 0) {
    return rootPolicy(
      "none",
      "inert",
      false,
      "LIFE_ACTIVE_CANONICAL_WORK",
      "目前有進行中的資料處理或開放研發分支，請先完成後再處理。",
      false
    );
  }

  const draftStatuses = new Set<NumberingRecordStatus>(["Draft", "NeedInfo"]);
  const allDraftMutable = draftStatuses.has(input.rootStatus) && input.childStatuses.every((status) => draftStatuses.has(status));
  const directCandidate = allDraftMutable && input.controlledReferenceCount === 0;
  const formalCandidate =
    input.rootStatus === "Active" ||
    input.rootStatus === "Released" ||
    input.rootStatus === "MainDrawingInvalid" ||
    input.childStatuses.some((status) => status === "Active" || status === "Released" || status === "MainDrawingInvalid") ||
    input.controlledReferenceCount > 0;

  if (directCandidate) {
    if (input.canDirectObsolete === false) {
      return rootPolicy("obsolete_draft_official_number", "inert", false, "LIFE_PERMISSION_DENIED", "沒有作廢草稿編號的權限。", false);
    }
    if (input.directGateOpen === false) {
      return rootPolicy(
        "obsolete_draft_official_number",
        "inert",
        false,
        "feature_not_open_in_production_slice",
        "目前環境尚未開放草稿編號作廢。",
        false
      );
    }
    return rootPolicy("obsolete_draft_official_number", "enabled", false, "READY", "可將整組尚未送審的編號標記為作廢；編號不會刪除或回收。", false);
  }

  if (formalCandidate) {
    if (input.canRequestObsolete === false) {
      return rootPolicy("request_formal_obsolete", "inert", true, "LIFE_PERMISSION_DENIED", "沒有申請圖料根號作廢的權限。", true);
    }
    if (input.formalGateOpen === false) {
      return rootPolicy(
        "request_formal_obsolete",
        "inert",
        true,
        "feature_not_open_in_production_slice",
        "目前環境尚未開放正式編號作廢申請。",
        true
      );
    }
    return rootPolicy("request_formal_obsolete", "enabled", true, "READY", "需建立作廢申請，核准後才會將正式範圍標記為作廢。", true);
  }

  return rootPolicy("none", "inert", false, "LIFE_ROOT_MIXED_OR_TERMINAL", "目前狀態不符合可作廢的生命週期條件。", false);
}

function rootPolicy(
  action: RootObsoletePolicy["action"],
  availability: RootObsoletePolicy["availability"],
  requiresApproval: boolean,
  reasonCode: string,
  message: string,
  requiresAcknowledgement: boolean
): RootObsoletePolicy {
  return {
    action,
    availability,
    requiresApproval,
    requiresReason: availability === "enabled" || reasonCode !== "LIFE_ROOT_MIXED_OR_TERMINAL",
    requiresAcknowledgement,
    reasonCode,
    message
  };
}

export function buildMasterAttachmentLifecyclePolicy(input: {
  attachmentId: string;
  parentType: MasterAttachmentEntityType;
  parentCode: string;
  deleted: boolean;
  parentValid: boolean;
  activeDuplicate: boolean;
  canDelete?: boolean;
  canRestore?: boolean;
}): LifecycleActionPolicy {
  if (!input.deleted) {
    return {
      entityType: "master_attachment",
      entityId: input.attachmentId,
      parentType: input.parentType,
      parentCode: input.parentCode,
      visibleStage: "formal",
      stageLabel: "正式",
      uiSurface: "work_list",
      traceabilityClass: "working",
      detailTags: [],
      actions: {
        delete: input.canDelete === false ? blocked("LIFE_PERMISSION_DENIED", "沒有刪除此附件的權限。") : { allowed: true },
        restore: blocked("LIFE_ATTACHMENT_NOT_DELETED", "此附件尚未刪除，不需要還原。"),
        obsolete: { ...blocked("LIFE_UNSUPPORTED_ENTITY", "附件不使用申請作廢流程。"), requiresApproval: false }
      }
    };
  }

  const restoreBlock = getDeletedAttachmentRestoreBlock(input);
  const restorable = !restoreBlock;

  return {
    entityType: "master_attachment",
    entityId: input.attachmentId,
    parentType: input.parentType,
    parentCode: input.parentCode,
    visibleStage: "history",
    stageLabel: "歷史",
    uiSurface: "deleted_data",
    traceabilityClass: "uncontrolled_deleted",
    detailTags: [restorable ? "可還原" : "不可還原"],
    actions: {
      delete: blocked("LIFE_ATTACHMENT_NOT_FOUND", "此附件已在已刪除資料中。"),
      restore: restoreBlock ?? { allowed: true },
      obsolete: { ...blocked("LIFE_UNSUPPORTED_ENTITY", "已刪除附件不使用申請作廢流程。"), requiresApproval: false }
    }
  };
}

export function buildPartNumberDraftLifecyclePolicy(input: {
  draftId: string;
  status: PartNumberDraftStatus;
  controlled: boolean;
  recycled: boolean;
  numberReused: boolean;
  canDelete?: boolean;
  canRestore?: boolean;
}): LifecycleActionPolicy {
  if (input.status === "voided") {
    const restoreBlock = getDeletedPartNumberDraftRestoreBlock(input);
    const restorable = !restoreBlock;
    return {
      entityType: "part_number_draft",
      entityId: input.draftId,
      visibleStage: "history",
      stageLabel: "歷史",
      uiSurface: "deleted_data",
      traceabilityClass: input.controlled ? "controlled_history" : "uncontrolled_deleted",
      detailTags: [restorable ? "可還原" : "不可還原"],
      actions: {
        delete: blocked("LIFE_DRAFT_ALREADY_DELETED", "此草稿已在已刪除資料中。"),
        restore: restoreBlock ?? { allowed: true },
        obsolete: { ...blocked("LIFE_UNSUPPORTED_ENTITY", "草稿不使用申請作廢流程。"), requiresApproval: false }
      }
    };
  }

  const inReview = input.status === "pending_review";
  const formal = input.status === "released";
  const editableDraft = input.status === "draft" || input.status === "needs_reconfirmation";
  const detailTags: LifecycleDetailTag[] = [];
  if (input.status === "needs_reconfirmation") detailTags.push("待補");
  if (inReview) detailTags.push("需審核");
  if (formal) detailTags.push("已發行");

  return {
    entityType: "part_number_draft",
    entityId: input.draftId,
    visibleStage: formal ? "formal" : inReview ? "in_review" : "draft",
    stageLabel: formal ? "正式" : inReview ? "審核中" : "草稿",
    uiSurface: "work_list",
    traceabilityClass: "working",
    detailTags,
    actions: {
      delete:
        editableDraft && input.canDelete !== false && !input.controlled
          ? { allowed: true }
          : blocked(input.controlled ? "LIFE_DRAFT_CONTROLLED_BOUNDARY" : "LIFE_DRAFT_NOT_DELETABLE", "此草稿目前不能直接刪除。"),
      restore: blocked("LIFE_DRAFT_NOT_DELETED", "此草稿尚未刪除，不需要還原。"),
      obsolete: { ...blocked("LIFE_UNSUPPORTED_ENTITY", "草稿不使用申請作廢流程。"), requiresApproval: false }
    }
  };
}

export function buildNumberingFormalRecordLifecyclePolicy(input: {
  entityType: "numbering_part_number" | "numbering_drawing_number";
  entityId: string;
  recordStatus: NumberingRecordStatus;
  pendingObsoleteRequest?: boolean;
  canRequestObsolete?: boolean;
}): LifecycleActionPolicy {
  if (input.recordStatus === "Obsolete") {
    return {
      entityType: input.entityType,
      entityId: input.entityId,
      visibleStage: "history",
      stageLabel: "歷史",
      uiSurface: "controlled_history",
      traceabilityClass: "controlled_history",
      detailTags: ["不可還原"],
      actions: {
        delete: blocked("LIFE_OBSOLETE_FORMAL_RECORD", "正式資料已進入受控歷史，不能直接刪除。"),
        restore: blocked("LIFE_OBSOLETE_CONTROLLED_HISTORY", "已作廢正式資料不能從已刪除資料還原。"),
        obsolete: { ...blocked("LIFE_OBSOLETE_ALREADY_APPROVED", "此正式資料已作廢。"), requiresApproval: false }
      }
    };
  }

  if (input.pendingObsoleteRequest) {
    return {
      entityType: input.entityType,
      entityId: input.entityId,
      visibleStage: "in_review",
      stageLabel: "審核中",
      uiSurface: "work_list",
      traceabilityClass: "working",
      detailTags: ["需審核"],
      actions: {
        delete: blocked("LIFE_FORMAL_DELETE_BLOCKED", "正式資料不能直接刪除。"),
        restore: blocked("LIFE_OBSOLETE_NOT_DELETED", "正式資料不使用已刪除資料還原。"),
        obsolete: { ...blocked("LIFE_OBSOLETE_ALREADY_REQUESTED", "此正式資料已有作廢審核中申請。"), requiresApproval: true }
      }
    };
  }

  const formal = input.recordStatus === "Active" || input.recordStatus === "Released";
  if (formal) {
    return {
      entityType: input.entityType,
      entityId: input.entityId,
      visibleStage: "formal",
      stageLabel: "正式",
      uiSurface: "work_list",
      traceabilityClass: "working",
      detailTags: input.recordStatus === "Released" ? ["已發行"] : [],
      actions: {
        delete: blocked("LIFE_FORMAL_DELETE_BLOCKED", "正式資料不能直接刪除，請使用申請作廢。"),
        restore: blocked("LIFE_OBSOLETE_NOT_DELETED", "正式資料不使用已刪除資料還原。"),
        obsolete:
          input.canRequestObsolete === false
            ? { ...blocked("LIFE_PERMISSION_DENIED", "沒有申請作廢此正式資料的權限。"), requiresApproval: true }
            : { allowed: true, requiresApproval: true }
      }
    };
  }

  const inReview = input.recordStatus === "PendingReview" || input.recordStatus === "PendingAdminConfirm";
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    visibleStage: inReview ? "in_review" : "draft",
    stageLabel: inReview ? "審核中" : "草稿",
    uiSurface: "work_list",
    traceabilityClass: "working",
    detailTags: inReview ? ["需審核"] : input.recordStatus === "NeedInfo" ? ["待補"] : [],
    actions: {
      delete: blocked("LIFE_OBSOLETE_NOT_FORMAL", "此資料尚未成為正式資料，不能使用申請作廢流程。"),
      restore: blocked("LIFE_OBSOLETE_NOT_DELETED", "此資料尚未刪除，不需要還原。"),
      obsolete: { ...blocked("LIFE_OBSOLETE_NOT_FORMAL", "只有正式資料可申請作廢。"), requiresApproval: true }
    }
  };
}

export function buildSubmissionLifecyclePolicy(input: {
  submissionId: string;
  status: SubmissionStatus;
  pendingObsoleteRequest?: boolean;
  canRequestObsolete?: boolean;
}): LifecycleActionPolicy {
  if (input.status === "Obsolete") {
    return {
      entityType: "submission",
      entityId: input.submissionId,
      visibleStage: "history",
      stageLabel: "歷史",
      uiSurface: "controlled_history",
      traceabilityClass: "controlled_history",
      detailTags: ["不可還原"],
      actions: {
        delete: blocked("LIFE_OBSOLETE_FORMAL_RECORD", "正式圖面已進入受控歷史，不能直接刪除。"),
        restore: blocked("LIFE_OBSOLETE_CONTROLLED_HISTORY", "已作廢圖面不能從已刪除資料還原。"),
        obsolete: { ...blocked("LIFE_OBSOLETE_ALREADY_APPROVED", "此圖面已作廢。"), requiresApproval: false }
      }
    };
  }

  if (input.status === "Released" && input.pendingObsoleteRequest) {
    return {
      entityType: "submission",
      entityId: input.submissionId,
      visibleStage: "in_review",
      stageLabel: "審核中",
      uiSurface: "work_list",
      traceabilityClass: "working",
      detailTags: ["需審核"],
      actions: {
        delete: blocked("LIFE_FORMAL_DELETE_BLOCKED", "正式圖面不能直接刪除。"),
        restore: blocked("LIFE_OBSOLETE_NOT_DELETED", "正式圖面不使用已刪除資料還原。"),
        obsolete: { ...blocked("LIFE_OBSOLETE_ALREADY_REQUESTED", "此圖面已有作廢審核中申請。"), requiresApproval: true }
      }
    };
  }

  if (input.status === "Released") {
    return {
      entityType: "submission",
      entityId: input.submissionId,
      visibleStage: "formal",
      stageLabel: "正式",
      uiSurface: "work_list",
      traceabilityClass: "working",
      detailTags: ["已發行"],
      actions: {
        delete: blocked("LIFE_FORMAL_DELETE_BLOCKED", "正式圖面不能直接刪除，請使用申請作廢。"),
        restore: blocked("LIFE_OBSOLETE_NOT_DELETED", "正式圖面不使用已刪除資料還原。"),
        obsolete:
          input.canRequestObsolete === false
            ? { ...blocked("LIFE_PERMISSION_DENIED", "沒有申請作廢此圖面的權限。"), requiresApproval: true }
            : { allowed: true, requiresApproval: true }
      }
    };
  }

  const inReview = input.status === "Pending" || input.status === "Releasing";
  return {
    entityType: "submission",
    entityId: input.submissionId,
    visibleStage: inReview ? "in_review" : "draft",
    stageLabel: inReview ? "審核中" : "草稿",
    uiSurface: "work_list",
    traceabilityClass: "working",
    detailTags: inReview ? ["需審核"] : input.status === "Rejected" || input.status === "ReleaseFailed" ? ["待補"] : [],
    actions: {
      delete: blocked("LIFE_OBSOLETE_NOT_FORMAL", "此圖面尚未成為正式資料，不能使用申請作廢流程。"),
      restore: blocked("LIFE_OBSOLETE_NOT_DELETED", "此圖面尚未刪除，不需要還原。"),
      obsolete: { ...blocked("LIFE_OBSOLETE_NOT_FORMAL", "只有已發布圖面可申請作廢。"), requiresApproval: true }
    }
  };
}

function getDeletedAttachmentRestoreBlock(input: {
  parentValid: boolean;
  activeDuplicate: boolean;
  canRestore?: boolean;
}): LifecycleActionState | null {
  if (input.canRestore === false) return blocked("LIFE_PERMISSION_DENIED", "沒有還原此附件的權限。");
  if (!input.parentValid) return blocked("LIFE_ATTACHMENT_PARENT_INVALID", "原始料號或圖號不存在，不能還原。");
  if (input.activeDuplicate) return blocked("LIFE_ATTACHMENT_DUPLICATE_ACTIVE", "此附件已有同名有效版本，不能還原。");
  return null;
}

function getDeletedPartNumberDraftRestoreBlock(input: {
  controlled: boolean;
  recycled: boolean;
  numberReused: boolean;
  canRestore?: boolean;
}): LifecycleActionState | null {
  if (input.canRestore === false) return blocked("LIFE_PERMISSION_DENIED", "沒有還原此草稿的權限。");
  if (input.controlled) return blocked("LIFE_DRAFT_CONTROLLED_BOUNDARY", "此草稿已跨受控邊界，不能從已刪除資料還原。");
  if (input.recycled) return blocked("LIFE_DRAFT_ALREADY_RECYCLED", "此草稿號已被回收重用，不能還原。");
  if (input.numberReused) return blocked("LIFE_DRAFT_NUMBER_REUSED", "此草稿號已被重新使用，不能還原。");
  return null;
}

function blocked(reasonCode: string, message: string): LifecycleActionState {
  return { allowed: false, reasonCode, message };
}
