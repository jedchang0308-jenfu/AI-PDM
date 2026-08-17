export type ApprovalRuleSummaryInput = {
  actionCode?: string | null;
  recordStatus?: string | null;
  itemKind?: string | null;
  riskFlag?: string | null;
  requiresApproval?: boolean | null;
  approverRole?: string | null;
  blocksUsage?: boolean | null;
  blocksRelease?: boolean | null;
  showsWarning?: boolean | null;
  exportMarker?: boolean | null;
};

export function withPredictedApprovalControls<T extends ApprovalRuleSummaryInput>(rule: T): T & { blocksUsage: false; blocksRelease: true } {
  return {
    ...rule,
    blocksUsage: false,
    blocksRelease: true
  };
}

export function approvalActionLabel(code: string | null | undefined) {
  const labels: Record<string, string> = {
    "numbering.search": "查詢",
    "numbering.drawings.view": "圖號工作台",
    "numbering.approvals": "審核",
    "numbering.impact": "影響",
    "numbering.tasks": "待辦",
    "numbering.reports": "報表",
    "settings.admin_matrix": "權限設定",
    "numbering.create": "建立號碼",
    "numbering.draft.update": "更新草稿",
    "numbering.draft.obsolete": "作廢草稿",
    "numbering.draft.admin_confirm": "管理員確認",
    "numbering.duplicate_check": "查重",
    "numbering.link_variant": "同圖連結",
    "numbering.approval.request": "送審",
    "numbering.approval.batch.create": "建審核批次",
    "numbering.approval.batch.decide": "批次決議",
    "numbering.approval.batch.resubmit": "退回重送",
    "numbering.impact.analyze": "影響分析",
    "numbering.impact.apply": "套用作廢",
    "numbering.export.create": "匯出總表",
    "numbering.audit_report.generate": "產生月報",
    "numbering.task.update": "更新待辦",
    "numbering.notification.update": "更新通知",
    "numbering.attachments.manage": "管理附件",
    "pdm.comment.create": "留言",
    "pdm.advice.create": "提供建議",
    release: "正式發行審核",
    release_missing_ma_confirm: "發行時缺少主要製造圖確認",
    same_drawing_variant_after_release: "發行後同圖多料號",
    main_drawing_restore: "恢復主要製造圖",
    merge_part_number: "合併參考料號",
    obsolete_part_root: "圖料根號作廢審核",
    obsolete_ma_drawing: "作廢製造圖",
    obsolete_part_number: "作廢料號",
    post_release_change: "發行後異動",
    update_name: "改品名",
    update_spec: "改規格",
    "pdm.drawing_package.model_exception.confirm": "確認純 2D 圖包例外",
    "pdm.manufacturing_baseline.release": "發布製造基準",
    "pdm.shared_model.release": "發布共用 3D"
  };
  const normalized = code?.trim() ?? "";
  return labels[normalized] ?? (normalized ? "自訂動作" : "未選動作");
}

export function approvalRecordStatusLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    Draft: "草稿",
    NeedInfo: "待補資料",
    Active: "使用中",
    PendingReview: "待審核",
    Released: "已發布",
    Obsolete: "已作廢",
    Merged: "已合併",
    PendingAdminConfirm: "待管理員確認",
    MainDrawingInvalid: "主要製造圖失效"
  };
  const normalized = value?.trim() ?? "";
  return labels[normalized] ?? (normalized ? "自訂狀態" : null);
}

export function approvalItemKindLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    manufactured: "自製件",
    outsourced: "委外件",
    purchased: "採購件",
    custom: "客製件",
    universal: "通用件"
  };
  const normalized = value?.trim() ?? "";
  return labels[normalized] ?? (normalized ? "自訂料件" : null);
}

export function approvalRiskFlagLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    duplicate_code: "編號重複",
    multiple_primary_ma: "多張主要製造圖",
    released_document_unrevised: "已發布文件尚未進版",
    released_document_blocker: "已發布文件阻擋",
    main_drawing_invalid: "主要製造圖失效",
    missing_primary_ma: "缺少主要製造圖",
    has_override: "已核准例外",
    high_similarity: "高相似編號",
    has_reference: "有參考關聯",
    two_d_only_model_exception: "純 2D 模型例外"
  };
  const normalized = value?.trim() ?? "";
  return labels[normalized] ?? (normalized ? "自訂風險" : null);
}

export function approvalRoleLabel(code: string | null | undefined) {
  const labels: Record<string, string> = {
    system_admin: "系統管理員",
    pdm_admin: "PDM 管理員",
    qa: "QA",
    qc: "QC",
    rd: "RD",
    rd_manager: "研發主管",
    engineer: "工程師",
    manufacturing: "製造",
    procurement: "採購",
    external_specialist: "外部專員"
  };
  const normalized = code?.trim() ?? "";
  return labels[normalized] ?? (normalized ? "指定角色" : "未指定角色");
}

function approvalActionUserPhrase(code: string | null | undefined) {
  const labels: Record<string, string> = {
    release: "正式發行",
    release_missing_ma_confirm: "確認沒有主要製造圖仍要發行",
    same_drawing_variant_after_release: "處理已發布後的同圖多料號",
    main_drawing_restore: "恢復主要製造圖",
    merge_part_number: "合併參考料號",
    obsolete_ma_drawing: "作廢製造圖",
    obsolete_part_number: "作廢料號",
    post_release_change: "修改已發布資料",
    update_name: "修改品名",
    update_spec: "修改規格",
    "pdm.drawing_package.model_exception.confirm": "確認只有 2D 圖包可以例外放行",
    "pdm.manufacturing_baseline.release": "發布製造基準",
    "pdm.shared_model.release": "發布共用 3D"
  };
  const normalized = code?.trim() ?? "";
  return labels[normalized] ?? `執行「${approvalActionLabel(normalized)}」`;
}

function approvalRecordStatusUserPhrase(value: string | null | undefined) {
  const labels: Record<string, string> = {
    Draft: "資料還是草稿",
    NeedInfo: "資料需要補齊",
    Active: "資料正在使用中",
    PendingReview: "資料等待審核",
    Released: "資料已發布",
    Obsolete: "資料已作廢",
    Merged: "資料已合併",
    PendingAdminConfirm: "等待管理員確認",
    MainDrawingInvalid: "主要製造圖失效"
  };
  const normalized = value?.trim() ?? "";
  return labels[normalized] ?? approvalRecordStatusLabel(normalized);
}

function approvalItemKindUserPhrase(value: string | null | undefined) {
  const labels: Record<string, string> = {
    manufactured: "自製件",
    outsourced: "委外件",
    purchased: "採購件",
    custom: "客製件",
    universal: "通用件"
  };
  const normalized = value?.trim() ?? "";
  return labels[normalized] ?? approvalItemKindLabel(normalized);
}

function approvalRiskUserPhrase(value: string | null | undefined) {
  const labels: Record<string, string> = {
    duplicate_code: "編號可能重複",
    multiple_primary_ma: "有多張主要製造圖",
    released_document_unrevised: "已發布文件還沒進版",
    released_document_blocker: "已發布文件會影響這次變更",
    main_drawing_invalid: "主要製造圖失效",
    missing_primary_ma: "缺少主要製造圖",
    has_override: "已核准例外",
    high_similarity: "編號高度相似",
    has_reference: "有參考關聯",
    two_d_only_model_exception: "只有 2D 圖包的例外情況"
  };
  const normalized = value?.trim() ?? "";
  return labels[normalized] ?? approvalRiskFlagLabel(normalized);
}

function buildRuleSituation(rule: ApprovalRuleSummaryInput) {
  const conditionParts = [
    approvalItemKindUserPhrase(rule.itemKind),
    approvalRecordStatusUserPhrase(rule.recordStatus),
    approvalRiskUserPhrase(rule.riskFlag)
  ].filter((item): item is string => Boolean(item));
  const action = approvalActionUserPhrase(rule.actionCode);
  return conditionParts.length > 0 ? `${conditionParts.join("、")}，且要${action}` : `要${action}`;
}

function buildRuleOutcome(rule: ApprovalRuleSummaryInput) {
  const predictedRule = withPredictedApprovalControls(rule);
  const outcomes = [
    predictedRule.requiresApproval ? `需要「${approvalRoleLabel(predictedRule.approverRole)}」審核` : null,
    predictedRule.blocksRelease ? (predictedRule.requiresApproval ? "審核未通過前不可正式發行" : "條件未排除前不可正式發行") : null,
    predictedRule.showsWarning ? "使用處會標示風險" : null,
    predictedRule.exportMarker ? "匯出資料時會標示" : null
  ].filter((item): item is string => Boolean(item));
  return outcomes.length > 0 ? outcomes.join("；") : "只留下紀錄，不額外阻擋";
}

export function buildApprovalRuleSummary(rule: ApprovalRuleSummaryInput) {
  const predictedRule = withPredictedApprovalControls(rule);
  return `情境：${buildRuleSituation(predictedRule)}。處理：${buildRuleOutcome(predictedRule)}。`;
}
