import type { MasterAttachmentEntityType } from "@/lib/repositories/master-attachment-repository";
import type { PartNumberDraftStatus } from "@/lib/pdm-change-control-domain";
import type { NumberingRecordStatus } from "@/lib/repositories/numbering-repository";
import type { BomWorkbenchDraftStatus, SubmissionStatus } from "@/lib/types";

export type LifecycleEntityType =
  | "master_attachment"
  | "part_number_draft"
  | "numbering_import_batch"
  | "bom_workbench_draft"
  | "submission"
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

export function buildNumberingImportBatchLifecyclePolicy(input: {
  batchId: string;
  status: "staged" | "confirmed" | "rejected";
  canDelete?: boolean;
  canRestore?: boolean;
}): LifecycleActionPolicy {
  if (input.status === "rejected") {
    const restoreBlock = getDeletedImportBatchRestoreBlock(input);
    const restorable = !restoreBlock;
    return {
      entityType: "numbering_import_batch",
      entityId: input.batchId,
      visibleStage: "history",
      stageLabel: "歷史",
      uiSurface: "deleted_data",
      traceabilityClass: "uncontrolled_deleted",
      detailTags: [restorable ? "可還原" : "不可還原"],
      actions: {
        delete: blocked("LIFE_IMPORT_ALREADY_DELETED", "此匯入批次已在已刪除資料中。"),
        restore: restoreBlock ?? { allowed: true },
        obsolete: { ...blocked("LIFE_UNSUPPORTED_ENTITY", "暫存匯入不使用申請作廢流程。"), requiresApproval: false }
      }
    };
  }

  const formal = input.status === "confirmed";
  return {
    entityType: "numbering_import_batch",
    entityId: input.batchId,
    visibleStage: formal ? "formal" : "draft",
    stageLabel: formal ? "正式" : "草稿",
    uiSurface: "work_list",
    traceabilityClass: "working",
    detailTags: formal ? ["已發行"] : [],
    actions: {
      delete:
        input.status === "staged" && input.canDelete !== false
          ? { allowed: true }
          : blocked(formal ? "LIFE_IMPORT_CONFIRMED" : "LIFE_IMPORT_NOT_DELETABLE", "此匯入批次目前不能直接刪除。"),
      restore: blocked("LIFE_IMPORT_NOT_DELETED", "此匯入批次尚未刪除，不需要還原。"),
      obsolete: { ...blocked("LIFE_UNSUPPORTED_ENTITY", "暫存匯入不使用申請作廢流程。"), requiresApproval: false }
    }
  };
}

export function buildBomWorkbenchDraftLifecyclePolicy(input: {
  draftId: string;
  status: BomWorkbenchDraftStatus;
  canDelete?: boolean;
  canRestore?: boolean;
  pendingObsoleteRequest?: boolean;
  canRequestObsolete?: boolean;
}): LifecycleActionPolicy {
  if (input.status === "Archived") {
    const restoreBlock = getDeletedBomWorkbenchDraftRestoreBlock(input);
    const restorable = !restoreBlock;
    return {
      entityType: "bom_workbench_draft",
      entityId: input.draftId,
      visibleStage: "history",
      stageLabel: "歷史",
      uiSurface: "deleted_data",
      traceabilityClass: "uncontrolled_deleted",
      detailTags: [restorable ? "可還原" : "不可還原"],
      actions: {
        delete: blocked("LIFE_BOM_DRAFT_ALREADY_DELETED", "此 BOM 草稿已在已刪除資料中。"),
        restore: restoreBlock ?? { allowed: true },
        obsolete: { ...blocked("LIFE_UNSUPPORTED_ENTITY", "BOM 草稿不使用申請作廢流程。"), requiresApproval: false }
      }
    };
  }

  if (input.status === "Released" && input.pendingObsoleteRequest) {
    return {
      entityType: "bom_workbench_draft",
      entityId: input.draftId,
      visibleStage: "in_review",
      stageLabel: "審核中",
      uiSurface: "work_list",
      traceabilityClass: "working",
      detailTags: ["需審核"],
      actions: {
        delete: blocked("LIFE_BOM_DRAFT_FORMAL", "正式 BOM 不能直接刪除。"),
        restore: blocked("LIFE_BOM_DRAFT_CONTROLLED_HISTORY", "正式 BOM 不使用已刪除資料還原。"),
        obsolete: { ...blocked("LIFE_OBSOLETE_ALREADY_REQUESTED", "此 BOM 已有作廢審核中申請。"), requiresApproval: true }
      }
    };
  }

  if (input.status === "Released" || input.status === "Obsolete") {
    return {
      entityType: "bom_workbench_draft",
      entityId: input.draftId,
      visibleStage: input.status === "Released" ? "formal" : "history",
      stageLabel: input.status === "Released" ? "正式" : "歷史",
      uiSurface: input.status === "Released" ? "work_list" : "controlled_history",
      traceabilityClass: input.status === "Released" ? "working" : "controlled_history",
      detailTags: input.status === "Released" ? ["已發行"] : ["不可還原"],
      actions: {
        delete: blocked("LIFE_BOM_DRAFT_FORMAL", "此 BOM 已進入正式或受控歷史，不能直接刪除。"),
        restore: blocked("LIFE_BOM_DRAFT_CONTROLLED_HISTORY", "受控 BOM 歷史不能從已刪除資料還原。"),
        obsolete:
          input.status === "Obsolete"
            ? { ...blocked("LIFE_OBSOLETE_ALREADY_APPROVED", "此 BOM 已作廢。"), requiresApproval: false }
            : input.canRequestObsolete === false
              ? { ...blocked("LIFE_PERMISSION_DENIED", "沒有申請作廢此 BOM 的權限。"), requiresApproval: true }
              : { allowed: true, requiresApproval: true }
      }
    };
  }

  const inReview = input.status === "PendingReview";
  const rejected = input.status === "Rejected";
  return {
    entityType: "bom_workbench_draft",
    entityId: input.draftId,
    visibleStage: inReview ? "in_review" : "draft",
    stageLabel: inReview ? "審核中" : "草稿",
    uiSurface: "work_list",
    traceabilityClass: "working",
    detailTags: inReview ? ["需審核"] : rejected ? ["待補"] : [],
    actions: {
      delete:
        input.status === "Draft" && input.canDelete !== false
          ? { allowed: true }
          : blocked(inReview ? "LIFE_BOM_DRAFT_IN_REVIEW" : "LIFE_BOM_DRAFT_NOT_DELETABLE", "此 BOM 草稿目前不能直接刪除。"),
      restore: blocked("LIFE_BOM_DRAFT_NOT_DELETED", "此 BOM 草稿尚未刪除，不需要還原。"),
      obsolete: { ...blocked("LIFE_UNSUPPORTED_ENTITY", "BOM 草稿不使用申請作廢流程。"), requiresApproval: false }
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

function getDeletedImportBatchRestoreBlock(input: {
  status: "staged" | "confirmed" | "rejected";
  canRestore?: boolean;
}): LifecycleActionState | null {
  if (input.canRestore === false) return blocked("LIFE_PERMISSION_DENIED", "沒有還原此匯入批次的權限。");
  if (input.status === "confirmed") return blocked("LIFE_IMPORT_CONFIRMED", "此匯入批次已確認轉正式資料，不能還原。");
  if (input.status !== "rejected") return blocked("LIFE_IMPORT_NOT_DELETED", "此匯入批次尚未刪除，不需要還原。");
  return null;
}

function getDeletedBomWorkbenchDraftRestoreBlock(input: {
  status: BomWorkbenchDraftStatus;
  canRestore?: boolean;
}): LifecycleActionState | null {
  if (input.canRestore === false) return blocked("LIFE_PERMISSION_DENIED", "沒有還原此 BOM 草稿的權限。");
  if (input.status !== "Archived") return blocked("LIFE_BOM_DRAFT_NOT_DELETED", "此 BOM 草稿尚未刪除，不需要還原。");
  return null;
}

function blocked(reasonCode: string, message: string): LifecycleActionState {
  return { allowed: false, reasonCode, message };
}
