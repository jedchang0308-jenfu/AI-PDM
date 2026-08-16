import { getStatusHelpItems, type StatusDisplay, type StatusDisplayContext } from "@/lib/status-display";

export type StatusAxisId =
  | "numberEffectiveness"
  | "dataStatus"
  | "applicationStatus"
  | "approvalStatus"
  | "publicationStatus"
  | "readinessStatus"
  | "fileStatus"
  | "taskStatus"
  | "accountStatus"
  | "invitationStatus"
  | "settingsStatus"
  | "restoreStatus"
  | "reminderStatus";

export type StatusScopeId =
  | "dashboardSummary"
  | "partsList"
  | "drawingList"
  | "numberingSearch"
  | "numberingRequest"
  | "numberingDraftList"
  | "numberStateWorkspace"
  | "approvalInbox"
  | "uploadSubmission"
  | "submissionDetail"
  | "bomWorkbench"
  | "handoffWorkbench"
  | "transferPackageWorkbench"
  | "reportCenter"
  | "taskCenter"
  | "impactWorkbench"
  | "settingsCenter"
  | "accountList"
  | "invitationList"
  | "revisionSubmission";

export type StatusAxisDefinition = {
  id: StatusAxisId;
  label: string;
  question: string;
  description: string;
};

export type StatusScopeDefinition = {
  id: StatusScopeId;
  route: string;
  section: string;
  title: string;
  description: string;
  axes: readonly StatusAxisId[];
  contexts: readonly StatusDisplayContext[];
  ownerEvidence: string;
};

export type StatusScopeHelpGroup = {
  axis: StatusAxisDefinition;
  contexts: Array<{
    context: StatusDisplayContext;
    items: StatusDisplay[];
  }>;
};

const INVENTORY_EVIDENCE = "output/dev-049-status-scope-inventory/status-scope-inventory.json";

export const STATUS_AXIS_DEFINITIONS: Record<StatusAxisId, StatusAxisDefinition> = {
  numberEffectiveness: {
    id: "numberEffectiveness",
    label: "編號處理",
    question: "這筆編號目前走到哪一個處理階段？",
    description: "只在相容資料投影中保留，不作為一般使用者需要判讀的獨立狀態。"
  },
  dataStatus: {
    id: "dataStatus",
    label: "資料狀態",
    question: "這筆主資料是否可用、已發布或已終止？",
    description: "說明主資料目前能否作業，以及是否需要補資料或改走其他流程。"
  },
  applicationStatus: {
    id: "applicationStatus",
    label: "申請狀態",
    question: "編號申請本身走到哪裡？",
    description: "編輯中的申請與已送出的申請分開顯示，不把兩者都稱為草稿。"
  },
  approvalStatus: {
    id: "approvalStatus",
    label: "審核狀態",
    question: "誰還需要判定或補資料？",
    description: "說明是否已送審、等待判定、需要補資料或已完成審核。"
  },
  publicationStatus: {
    id: "publicationStatus",
    label: "發布狀態",
    question: "已核准資料是否已成功成為正式資料？",
    description: "核准與發布是不同步驟；發布失敗時會保留可處理的提醒。"
  },
  readinessStatus: {
    id: "readinessStatus",
    label: "準備狀態",
    question: "進入下一步的必要條件是否齊備？",
    description: "說明目前已就緒、未完成、阻擋、需更新或不適用。"
  },
  fileStatus: {
    id: "fileStatus",
    label: "檔案狀態",
    question: "檔案、預覽或同步是否可用？",
    description: "說明檔案是否存在、處理中、可用、遺失或與紀錄不一致。"
  },
  taskStatus: {
    id: "taskStatus",
    label: "任務狀態",
    question: "待辦是否仍需要處理？",
    description: "說明待辦或背景工作是待處理、執行中、已完成或已取消。"
  },
  accountStatus: {
    id: "accountStatus",
    label: "帳號狀態",
    question: "人員是否仍可登入及使用系統？",
    description: "帳號狀態與登入身分分開說明；停權或停用時會說明不能做什麼。"
  },
  invitationStatus: {
    id: "invitationStatus",
    label: "邀請狀態",
    question: "帳號邀請是否仍可使用？",
    description: "說明邀請是否待接受、已接受、已撤銷或已過期。"
  },
  settingsStatus: {
    id: "settingsStatus",
    label: "設定狀態",
    question: "這項設定目前是否會套用？",
    description: "說明設定目前啟用、未生效、停用、到期或已退役。"
  },
  restoreStatus: {
    id: "restoreStatus",
    label: "還原狀態",
    question: "這筆資料目前能否安全還原？",
    description: "說明可以還原、不可還原或需要受控確認的原因。"
  },
  reminderStatus: {
    id: "reminderStatus",
    label: "提醒",
    question: "目前是否有需要額外注意的風險？",
    description: "提醒不等於主資料狀態；只有會影響下一步的提示才列為阻擋提醒。"
  }
};

export const STATUS_SCOPE_REGISTRY: Record<StatusScopeId, StatusScopeDefinition> = {
  dashboardSummary: {
    id: "dashboardSummary",
    route: "/",
    section: "工作台摘要",
    title: "工作台資料範圍",
    description: "工作台摘要同時包含主資料、送審與待辦資訊。",
    axes: ["dataStatus", "approvalStatus", "publicationStatus", "taskStatus", "reminderStatus"],
    contexts: ["masterRecord", "submission", "publicationStatus", "task", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  partsList: {
    id: "partsList",
    route: "/parts",
    section: "料號總表",
    title: "料號資料範圍",
    description: "料號總表的主資料與提醒分開判讀。",
    axes: ["dataStatus", "reminderStatus"],
    contexts: ["masterRecord", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  drawingList: {
    id: "drawingList",
    route: "/numbering/drawings",
    section: "圖號清單",
    title: "圖號資料範圍",
    description: "圖號清單將主資料、審核與發布提醒分開顯示。",
    axes: ["dataStatus", "approvalStatus", "publicationStatus", "reminderStatus"],
    contexts: ["masterRecord", "approvalStatus", "publicationStatus", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  numberingSearch: {
    id: "numberingSearch",
    route: "/numbering/search",
    section: "圖料工作台",
    title: "圖料工作台資料範圍",
    description: "查詢結果分開呈現資料狀態、關聯與提醒。",
    axes: ["dataStatus", "approvalStatus", "publicationStatus", "reminderStatus"],
    contexts: ["masterRecord", "approvalStatus", "publicationStatus", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  numberingRequest: {
    id: "numberingRequest",
    route: "/numbering/search?tab=reserved",
    section: "編號申請",
    title: "編號申請資料範圍",
    description: "申請內容、審核、發布與下一步分層說明。",
    axes: ["applicationStatus", "approvalStatus", "publicationStatus", "readinessStatus"],
    contexts: ["applicationStatus", "approvalStatus", "publicationStatus", "readinessStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  numberingDraftList: {
    id: "numberingDraftList",
    route: "/numbering/part-drafts",
    section: "編號申請清單",
    title: "編號申請資料範圍",
    description: "這裡顯示可編輯的編號申請，主資料發布狀態另行呈現。",
    axes: ["applicationStatus", "approvalStatus", "publicationStatus", "restoreStatus"],
    contexts: ["applicationStatus", "approvalStatus", "publicationStatus", "restorePolicy"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  numberStateWorkspace: {
    id: "numberStateWorkspace",
    route: "/parts?tab=drafts",
    section: "編號申請",
    title: "編號申請分頁說明",
    description: "這裡處理編號申請；審核與發布結果分開呈現。",
    axes: ["applicationStatus", "approvalStatus", "publicationStatus"],
    contexts: ["applicationStatus", "approvalStatus", "publicationStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  approvalInbox: {
    id: "approvalInbox",
    route: "/approvals",
    section: "審核清單",
    title: "審核資料範圍",
    description: "審核工作台將審核、發布與補資料狀態分開判讀。",
    axes: ["approvalStatus", "publicationStatus", "readinessStatus", "reminderStatus"],
    contexts: ["approvalStatus", "publicationStatus", "readinessStatus", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  uploadSubmission: {
    id: "uploadSubmission",
    route: "/upload",
    section: "圖面送審",
    title: "送審資料範圍",
    description: "送審頁面分開呈現申請、檔案、審核與發布狀態。",
    axes: ["applicationStatus", "fileStatus", "approvalStatus", "publicationStatus", "readinessStatus"],
    contexts: ["applicationStatus", "fileStatus", "submission", "approvalStatus", "publicationStatus", "readinessStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  submissionDetail: {
    id: "submissionDetail",
    route: "/submissions/:id",
    section: "送審明細",
    title: "送審明細資料範圍",
    description: "送審紀錄、附件檔案與發布結果各自有清楚的狀態軸。",
    axes: ["approvalStatus", "publicationStatus", "fileStatus", "readinessStatus"],
    contexts: ["submission", "approvalStatus", "publicationStatus", "fileStatus", "readinessStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  bomWorkbench: {
    id: "bomWorkbench",
    route: "/bom/workbench",
    section: "BOM 工作台",
    title: "BOM 資料範圍",
    description: "BOM 資料、審核、發布與還原分開說明。",
    axes: ["dataStatus", "approvalStatus", "publicationStatus", "restoreStatus", "reminderStatus"],
    contexts: ["bomDraft", "approvalStatus", "publicationStatus", "restorePolicy", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  handoffWorkbench: {
    id: "handoffWorkbench",
    route: "/handoff",
    section: "製造交接",
    title: "製造交接資料範圍",
    description: "交接 package 的準備、檔案、發布與還原狀態分開判讀。",
    axes: ["readinessStatus", "fileStatus", "publicationStatus", "restoreStatus", "reminderStatus"],
    contexts: ["readinessStatus", "fileStatus", "publicationStatus", "restorePolicy", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  transferPackageWorkbench: {
    id: "transferPackageWorkbench",
    route: "/transfer-packages/:id",
    section: "技術移轉 package",
    title: "技術移轉資料範圍",
    description: "技轉案件的資料、準備、審核、發布與還原狀態分開顯示。",
    axes: ["dataStatus", "readinessStatus", "approvalStatus", "publicationStatus", "restoreStatus"],
    contexts: ["bomDraft", "readinessStatus", "approvalStatus", "publicationStatus", "restorePolicy"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  reportCenter: {
    id: "reportCenter",
    route: "/numbering/reports",
    section: "報表工作",
    title: "報表工作資料範圍",
    description: "報表工作狀態與檔案可用性分開呈現。",
    axes: ["taskStatus", "fileStatus", "reminderStatus"],
    contexts: ["jobStatus", "fileStatus", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  taskCenter: {
    id: "taskCenter",
    route: "/numbering/tasks",
    section: "待辦中心",
    title: "待辦資料範圍",
    description: "待辦、通知與來源資料狀態分開顯示，避免把草稿當成任務狀態。",
    axes: ["taskStatus", "dataStatus", "reminderStatus"],
    contexts: ["task", "notification", "masterRecord", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  impactWorkbench: {
    id: "impactWorkbench",
    route: "/numbering/impact",
    section: "影響分析",
    title: "影響分析資料範圍",
    description: "影響分析以資料狀態與關聯準備度為主，提醒另行列出。",
    axes: ["dataStatus", "readinessStatus", "reminderStatus"],
    contexts: ["masterRecord", "readinessStatus", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  settingsCenter: {
    id: "settingsCenter",
    route: "/settings",
    section: "設定中心",
    title: "系統設定資料範圍",
    description: "設定是否套用、審核與提醒分開顯示，不以 generic 狀態代替。",
    axes: ["settingsStatus", "approvalStatus", "reminderStatus"],
    contexts: ["settingsLifecycle", "approvalStatus", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  accountList: {
    id: "accountList",
    route: "/settings/accounts",
    section: "帳號管理",
    title: "帳號與登入身分資料範圍",
    description: "帳號能否使用與登入身分是否啟用分開說明。",
    axes: ["accountStatus", "invitationStatus", "reminderStatus"],
    contexts: ["accountStatus", "identityStatus", "invitationStatus", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  invitationList: {
    id: "invitationList",
    route: "/settings/account-invitations",
    section: "邀請紀錄",
    title: "帳號邀請資料範圍",
    description: "邀請能否被接受與帳號建立後的狀態分開說明。",
    axes: ["invitationStatus", "accountStatus", "reminderStatus"],
    contexts: ["invitationStatus", "accountStatus", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  },
  revisionSubmission: {
    id: "revisionSubmission",
    route: "/numbering/revisions",
    section: "新版圖面送審",
    title: "版次送審資料範圍",
    description: "新版圖面、附件、審核與替代料號申請分開判讀。",
    axes: ["applicationStatus", "fileStatus", "approvalStatus", "readinessStatus", "reminderStatus"],
    contexts: ["applicationStatus", "fileStatus", "approvalStatus", "readinessStatus", "reminderStatus"],
    ownerEvidence: INVENTORY_EVIDENCE
  }
};

const CONTEXT_AXIS_MAP: Partial<Record<StatusDisplayContext, readonly StatusAxisId[]>> = {
  masterRecord: ["dataStatus"],
  submission: ["approvalStatus", "publicationStatus"],
  bomDraft: ["dataStatus", "approvalStatus", "publicationStatus"],
  workflow: ["applicationStatus", "approvalStatus", "readinessStatus"],
  applicationStatus: ["applicationStatus"],
  approvalStatus: ["approvalStatus"],
  publicationStatus: ["publicationStatus"],
  readinessStatus: ["readinessStatus"],
  fileStatus: ["fileStatus"],
  accountStatus: ["accountStatus"],
  identityStatus: ["accountStatus"],
  invitationStatus: ["invitationStatus"],
  reminderStatus: ["reminderStatus"],
  numberEffectiveness: ["numberEffectiveness"],
  task: ["taskStatus"],
  importRow: ["fileStatus", "readinessStatus"],
  importBatch: ["applicationStatus", "fileStatus"],
  settingsLifecycle: ["settingsStatus"],
  jobStatus: ["taskStatus"],
  restorePolicy: ["restoreStatus"],
  fileSync: ["fileStatus"],
  notification: ["taskStatus"]
};

export function getStatusScopeDefinition(scopeId: StatusScopeId) {
  const definition = STATUS_SCOPE_REGISTRY[scopeId];
  if (!definition) throw new Error(`Unknown status scope: ${scopeId}`);
  return definition;
}

export function getStatusScopeHelpGroups(scopeId: StatusScopeId): StatusScopeHelpGroup[] {
  const scope = getStatusScopeDefinition(scopeId);
  return scope.axes.map((axisId) => {
    const axis = STATUS_AXIS_DEFINITIONS[axisId];
    const contexts = scope.contexts
      .filter((context) => CONTEXT_AXIS_MAP[context]?.includes(axisId))
      .map((context) => ({ context, items: getStatusHelpItems(context) }));
    return { axis, contexts };
  });
}

export function getStatusScopeContextLabels(scopeId: StatusScopeId) {
  return getStatusScopeHelpGroups(scopeId).flatMap((group) => group.contexts.map((entry) => entry.context));
}
