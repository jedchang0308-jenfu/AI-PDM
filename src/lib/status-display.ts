export type StatusDisplayContext =
  | "masterRecord"
  | "submission"
  | "bomDraft"
  | "workflow"
  | "developmentPhase"
  | "task"
  | "importRow"
  | "importBatch"
  | "settingsLifecycle"
  | "jobStatus"
  | "restorePolicy"
  | "dvtReadiness"
  | "fileSync"
  | "cost"
  | "notification"
  | "generic";

export type StatusTone = "neutral" | "info" | "warning" | "critical" | "success";

export type StatusDisplay = {
  raw: string;
  label: string;
  description: string;
  tone: StatusTone;
  terminal?: boolean;
  abnormal?: boolean;
  actionable?: boolean;
};

type StatusDefinition = Omit<StatusDisplay, "raw"> & {
  keys: string[];
};

const masterRecordStatuses: StatusDefinition[] = [
  { keys: ["Draft", "draft"], label: "草稿", description: "資料尚未送審，可以繼續整理。", tone: "warning", actionable: true },
  {
    keys: ["NeedInfo", "needs_info", "need_info", "needs_reconfirmation"],
    label: "待補資料",
    description: "必要資料不足，補齊後才能進下一步。",
    tone: "warning",
    actionable: true
  },
  { keys: ["Active", "active"], label: "可作業", description: "資料可進行後續作業，例如上傳、送審或編輯。", tone: "neutral", actionable: true },
  {
    keys: ["PendingReview", "pending_review", "Pending", "pending"],
    label: "審核中",
    description: "已送出，等待審核或處理結果。",
    tone: "warning"
  },
  { keys: ["Releasing", "running"], label: "發布中", description: "系統正在把審核通過的資料轉成正式紀錄。", tone: "warning" },
  {
    keys: ["Released", "released", "ReleasedSnapshot"],
    label: "已發布",
    description: "已完成審核並進入正式使用。",
    tone: "success",
    terminal: true
  },
  {
    keys: ["Rejected", "rejected"],
    label: "已退回",
    description: "審核未通過，需要修正後重新送審。",
    tone: "critical",
    actionable: true
  },
  { keys: ["Cancelled", "cancelled"], label: "已取消", description: "流程已取消，不會繼續審核或發布。", tone: "neutral", terminal: true },
  {
    keys: ["Obsolete", "obsolete", "retired", "voided"],
    label: "已作廢",
    description: "此資料已不再作為日常使用資料。",
    tone: "critical",
    terminal: true
  },
  { keys: ["Archived", "archived"], label: "歷史", description: "此資料保留供追溯，不在日常作業中使用。", tone: "neutral", terminal: true },
  {
    keys: ["MainDrawingInvalid"],
    label: "主圖失效",
    description: "主要 MA 圖不可作為目前有效主圖，需要重新確認。",
    tone: "critical",
    abnormal: true,
    actionable: true
  },
  {
    keys: ["ReleaseFailed"],
    label: "發行未完成",
    description: "審核後發行未完成，需要主管或管理員處理。",
    tone: "critical",
    abnormal: true,
    actionable: true
  },
  { keys: ["Merged", "merged"], label: "已合併", description: "資料已併入其他正式資料，保留追溯。", tone: "neutral", terminal: true },
  {
    keys: ["EVTDisabled"],
    label: "EVT 停用",
    description: "此 EVT 資料已停用，不應再作為後續作業來源。",
    tone: "critical",
    terminal: true
  },
  {
    keys: ["PendingAdminConfirm", "admin_confirm"],
    label: "待管理員確認",
    description: "需要管理員確認後才能往下走。",
    tone: "critical",
    abnormal: true,
    actionable: true
  }
];

const submissionStatuses: StatusDefinition[] = [
  { keys: ["Pending"], label: "審核中", description: "送審已建立，等待主管或指定審核者處理。", tone: "warning", actionable: true },
  { keys: ["Releasing"], label: "發行中", description: "審核已通過，系統正在建立正式發行紀錄。", tone: "warning" },
  { keys: ["Released"], label: "已發布", description: "已完成審核與正式發行。", tone: "success", terminal: true },
  { keys: ["Rejected"], label: "已退回", description: "審核未通過，需要修正後重新送審。", tone: "critical", actionable: true },
  { keys: ["ReleaseFailed"], label: "發行未完成", description: "正式發行未完成，需要主管或管理員處理。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["Obsolete"], label: "已作廢", description: "此送審紀錄已被新版取代或不再使用。", tone: "critical", terminal: true },
  { keys: ["Cancelled"], label: "已取消", description: "送審流程已取消，不會繼續審核或發行。", tone: "neutral", terminal: true }
];

const bomDraftStatuses: StatusDefinition[] = [
  { keys: ["Draft"], label: "草稿", description: "BOM 尚未送審，可以繼續編輯。", tone: "warning", actionable: true },
  { keys: ["Rejected"], label: "草稿", description: "BOM 已退回，修正後可重新送審。", tone: "warning", actionable: true },
  { keys: ["PendingReview"], label: "審核中", description: "BOM 已送出，等待審核結果。", tone: "warning" },
  { keys: ["Released"], label: "已發布", description: "BOM 已審核通過並成為正式版本。", tone: "success", terminal: true },
  { keys: ["Obsolete"], label: "已作廢", description: "此 BOM 不再作為日常使用版本。", tone: "critical", terminal: true },
  { keys: ["Archived"], label: "歷史", description: "此 BOM 保留追溯，不在日常作業中使用。", tone: "neutral", terminal: true }
];

const workflowStatuses: StatusDefinition[] = [
  { keys: ["pending"], label: "審核中", description: "已送出，等待審核者處理。", tone: "warning", actionable: true },
  { keys: ["staged"], label: "待確認", description: "資料已暫存，等待確認後才會正式寫入。", tone: "warning", actionable: true },
  { keys: ["open"], label: "未結案", description: "此項目仍需要處理。", tone: "warning", actionable: true },
  { keys: ["ready"], label: "可處理", description: "條件已具備，可以進行下一步。", tone: "success", actionable: true },
  { keys: ["blocked"], label: "阻擋", description: "目前有阻擋條件，需要處理後才能繼續。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["handled", "resolved", "closed", "satisfied", "acknowledged"], label: "已處理", description: "此項目已處理或確認。", tone: "success", terminal: true },
  { keys: ["confirmed"], label: "已確認", description: "資料已確認並完成指定處理。", tone: "success", terminal: true },
  { keys: ["active"], label: "啟用中", description: "此項目目前可使用或仍在進行。", tone: "neutral", actionable: true },
  { keys: ["approved"], label: "已核准", description: "審核已通過，但不一定代表資料已發布。", tone: "success" },
  { keys: ["rejected"], label: "已退回", description: "審核未通過或要求修正。", tone: "critical", actionable: true },
  { keys: ["needs_info"], label: "待補資料", description: "審核者要求補充資料後再處理。", tone: "warning", actionable: true },
  { keys: ["cancelled"], label: "已取消", description: "此流程已取消，不會繼續處理。", tone: "neutral", terminal: true },
  { keys: ["partially_approved"], label: "部分核准", description: "只有部分項目通過，需要查看明細。", tone: "warning", actionable: true },
  { keys: ["resubmitted"], label: "已重送", description: "已修正並再次送出。", tone: "warning" },
  { keys: ["waived"], label: "已豁免", description: "此要求經授權免除。", tone: "neutral", terminal: true },
  { keys: ["sent", "submitted", "created"], label: "已送出", description: "資料已送出，等待對方確認。", tone: "warning" },
  { keys: ["failed"], label: "失敗", description: "處理失敗，需要重新處理或通知管理員。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["promoted"], label: "已採用", description: "此分支或資料已被採用。", tone: "success", terminal: true }
];

const workflowHelpStatuses: StatusDefinition[] = [
  { keys: ["pending"], label: "審核中", description: "已送出，等待審核者處理。", tone: "warning", actionable: true },
  { keys: ["needs_info"], label: "待補資料", description: "資料不足，補齊後再處理。", tone: "warning", actionable: true },
  { keys: ["blocked"], label: "阻擋", description: "有條件未完成，需要先排除。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["approved"], label: "已核准", description: "審核已通過，後續可能還有發行或寫入流程。", tone: "success" },
  { keys: ["rejected"], label: "已退回", description: "審核未通過，需要修正後重新送審。", tone: "critical", actionable: true }
];

const taskStatuses: StatusDefinition[] = [
  { keys: ["open"], label: "待處理", description: "此待辦還需要負責角色查看並完成下一步。", tone: "warning", actionable: true },
  { keys: ["handled", "resolved", "closed", "satisfied", "acknowledged"], label: "已處理", description: "此待辦已確認或關閉；若狀況再發生，可重新開啟或回來源頁處理。", tone: "success", terminal: true },
  { keys: ["cancelled"], label: "已取消", description: "此待辦已取消，不會繼續要求處理。", tone: "neutral", terminal: true }
];

const importRowStatuses: StatusDefinition[] = [
  { keys: ["pending"], label: "待檢查", description: "這列尚未完成檢查，請先執行或等待檢查結果。", tone: "warning", actionable: true },
  { keys: ["valid"], label: "可匯入", description: "這列資料已通過檢查，可以納入匯入確認。", tone: "success", actionable: true },
  { keys: ["need_info"], label: "待補資料", description: "這列缺少必要資料，補齊後才能匯入。", tone: "warning", actionable: true },
  { keys: ["admin_confirm"], label: "待管理員確認", description: "這列需要管理員判斷後才能繼續。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["conflict"], label: "資料衝突", description: "這列與既有資料衝突，需要修正或決定保留哪一筆。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["legacy_keep"], label: "保留既有", description: "這列不覆蓋既有資料，保留目前正式紀錄。", tone: "neutral", terminal: true }
];

const importBatchStatuses: StatusDefinition[] = [
  { keys: ["staged"], label: "暫存中", description: "匯入批次已暫存，尚未正式確認寫入。", tone: "warning", actionable: true },
  { keys: ["confirmed"], label: "已確認", description: "匯入批次已確認處理完成。", tone: "success", terminal: true },
  { keys: ["rejected"], label: "已排除", description: "此匯入批次已排除，不會繼續寫入。", tone: "neutral", terminal: true }
];

const settingsLifecycleStatuses: StatusDefinition[] = [
  { keys: ["active", "enabled", "allowed", "valid"], label: "啟用中", description: "此設定目前生效，可作為系統判斷依據。", tone: "success", actionable: true },
  { keys: ["inactive", "disabled", "blocked", "denied"], label: "停用", description: "此設定目前停用，不會套用到作業判斷。", tone: "neutral" },
  { keys: ["retired", "revoked"], label: "已退役", description: "此設定已退役或撤銷，僅保留追溯。", tone: "neutral", terminal: true },
  { keys: ["builtin", "default", "mocked"], label: "內建預設", description: "目前使用系統預設設定；需要正式設定時請由 Admin 建立。", tone: "info" }
];

const jobStatuses: StatusDefinition[] = [
  { keys: ["queued", "pending"], label: "等待中", description: "工作已排入佇列，等待系統執行。", tone: "warning" },
  { keys: ["running", "started", "processing"], label: "執行中", description: "系統正在產生報表或匯出檔。", tone: "warning" },
  { keys: ["completed", "done", "success"], label: "已完成", description: "工作已完成，可以查看或下載結果。", tone: "success", terminal: true },
  { keys: ["failed", "error"], label: "失敗", description: "工作未完成，請重試；若仍失敗，請 Admin 檢查。", tone: "critical", abnormal: true, actionable: true }
];

const restorePolicyStatuses: StatusDefinition[] = [
  { keys: ["restore_allowed", "allowed", "can_restore"], label: "可還原", description: "這筆資料符合還原條件，可以回到原作業清單。", tone: "success", actionable: true },
  { keys: ["restore_blocked", "blocked", "not_allowed"], label: "不可還原", description: "目前有條件阻擋，不能直接還原。", tone: "critical", abnormal: true },
  { keys: ["controlled_boundary", "controlled"], label: "受控邊界", description: "還原會影響受控資料，需依主管或 Admin 指示處理。", tone: "warning", actionable: true },
  { keys: ["reused", "recycled", "deleted"], label: "已回收或已重用", description: "相關編號或資料已被回收/重用，不能直接還原。", tone: "neutral", terminal: true }
];

const dvtReadinessStatuses: StatusDefinition[] = [
  { keys: ["ready"], label: "可送審", description: "DVT 送審條件已具備，可以送審 DVT 階段。", tone: "success", actionable: true },
  { keys: ["needs_override"], label: "需補資料或 Override", description: "仍有缺漏；補齊資料或取得例外確認後才能送審。", tone: "warning", actionable: true },
  { keys: ["blocked"], label: "阻擋", description: "目前條件不足，不能送審 DVT 階段。", tone: "critical", abnormal: true, actionable: true }
];

const developmentPhaseStatuses: StatusDefinition[] = [
  { keys: ["EVT"], label: "EVT 工程樣", description: "工程驗證階段，資料仍在建立與初步確認。", tone: "warning", actionable: true },
  { keys: ["DVT"], label: "DVT 設計驗證", description: "設計驗證階段，需確認設計符合需求。", tone: "warning", actionable: true },
  { keys: ["PVT"], label: "PVT 試產", description: "試產驗證階段，需確認製程與量產準備狀態。", tone: "warning", actionable: true },
  { keys: ["Release"], label: "正式階段", description: "資料已進入正式使用或量產交接階段。", tone: "success", terminal: true },
  { keys: ["ECR"], label: "ECR 設變", description: "工程變更階段，需依設變流程處理。", tone: "warning", actionable: true }
];

const fileSyncStatuses: StatusDefinition[] = [
  { keys: ["none", "local_only"], label: "本機資料", description: "檔案或資料目前只在本機或系統內部。", tone: "neutral" },
  { keys: ["valid"], label: "已通過", description: "檢核已通過，可以進入下一步。", tone: "success" },
  { keys: ["need_info"], label: "待補資料", description: "資料不足，需要補齊後再確認。", tone: "warning", actionable: true },
  { keys: ["admin_confirm"], label: "待管理員確認", description: "需要管理員確認後才能往下走。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["conflict"], label: "資料衝突", description: "匯入資料與既有資料衝突，需要處理。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["legacy_keep"], label: "保留既有", description: "此筆資料維持既有紀錄，不覆蓋。", tone: "neutral" },
  { keys: ["uploading", "queued", "started", "running"], label: "等待處理", description: "系統已排入處理或正在準備上傳。", tone: "warning" },
  { keys: ["uploaded", "moved", "migrated", "imported", "confirmed", "completed", "created"], label: "已完成", description: "系統已完成指定處理。", tone: "success", terminal: true },
  { keys: ["failed", "missing", "hash_mismatch", "conflict", "blocker", "critical", "blocked"], label: "異常", description: "系統偵測到阻礙流程的問題，需要處理後才能繼續。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["warning", "info"], label: "提醒", description: "有提示資訊，但不一定阻擋流程。", tone: "info" }
];

const costStatuses: StatusDefinition[] = [
  { keys: ["active"], label: "使用中", description: "目前作為有效設定使用。", tone: "success" },
  { keys: ["missing"], label: "未設定", description: "尚未建立必要設定。", tone: "warning", actionable: true },
  { keys: ["draft"], label: "草稿", description: "尚未送審，可以繼續編輯。", tone: "warning" },
  { keys: ["pending", "pending_review"], label: "審核中", description: "已送出，等待審核結果。", tone: "warning" },
  { keys: ["approved"], label: "已核准", description: "審核已通過。", tone: "success" },
  { keys: ["rejected"], label: "已退回", description: "審核未通過，需要修正。", tone: "critical" },
  { keys: ["cancelled"], label: "已取消", description: "流程已取消。", tone: "neutral", terminal: true },
  { keys: ["retired"], label: "已停用", description: "此設定已不再使用。", tone: "neutral", terminal: true }
];

const notificationStatuses: StatusDefinition[] = [
  { keys: ["open"], label: "未處理", description: "通知或待辦仍需要處理。", tone: "warning", actionable: true },
  { keys: ["handled", "resolved", "closed"], label: "已處理", description: "通知或待辦已處理。", tone: "success", terminal: true },
  { keys: ["cancelled"], label: "已取消", description: "此項目已取消。", tone: "neutral", terminal: true }
];

const contextDefinitions: Record<StatusDisplayContext, StatusDefinition[]> = {
  masterRecord: masterRecordStatuses,
  submission: submissionStatuses,
  bomDraft: bomDraftStatuses,
  workflow: workflowStatuses,
  developmentPhase: developmentPhaseStatuses,
  task: taskStatuses,
  importRow: importRowStatuses,
  importBatch: importBatchStatuses,
  settingsLifecycle: settingsLifecycleStatuses,
  jobStatus: jobStatuses,
  restorePolicy: restorePolicyStatuses,
  dvtReadiness: dvtReadinessStatuses,
  fileSync: fileSyncStatuses,
  cost: costStatuses,
  notification: notificationStatuses,
  generic: [
    ...masterRecordStatuses,
    ...submissionStatuses,
    ...workflowStatuses,
    ...taskStatuses,
    ...importRowStatuses,
    ...importBatchStatuses,
    ...settingsLifecycleStatuses,
    ...jobStatuses,
    ...restorePolicyStatuses,
    ...dvtReadinessStatuses,
    ...developmentPhaseStatuses,
    ...fileSyncStatuses,
    ...costStatuses
  ]
};

export const masterRecordStatusFilterValues = ["Draft", "NeedInfo", "Active", "PendingReview", "Released", "Rejected", "Obsolete", "Merged", "PendingAdminConfirm", "MainDrawingInvalid"];
export const drawingRecordStatusFilterValues = ["Draft", "Active", "PendingReview", "Released", "Obsolete", "MainDrawingInvalid"];
export const partRecordStatusFilterValues = ["Draft", "Active", "PendingReview", "Released", "Obsolete"];
export const submissionStatusFilterValues = ["Pending", "Releasing", "Released", "Rejected", "ReleaseFailed", "Obsolete", "Cancelled"];

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function findDefinition(rawStatus: string, context: StatusDisplayContext) {
  const needle = normalized(rawStatus);
  const definitions = contextDefinitions[context] ?? contextDefinitions.generic;
  return (
    definitions.find((definition) => definition.keys.some((key) => normalized(key) === needle)) ??
    contextDefinitions.generic.find((definition) => definition.keys.some((key) => normalized(key) === needle))
  );
}

export function getStatusDisplay(rawStatus: unknown, context: StatusDisplayContext = "generic"): StatusDisplay {
  const raw = String(rawStatus ?? "").trim();
  if (!raw) {
    return {
      raw: "",
      label: "未分類狀態",
      description: "系統沒有提供狀態，請重新整理或請管理員確認。",
      tone: "warning",
      abnormal: true
    };
  }
  const definition = findDefinition(raw, context);
  if (!definition) {
    return {
      raw,
      label: "未分類狀態",
      description: "系統已記錄狀態，但此狀態尚未完成中文說明，請管理員確認。",
      tone: "warning",
      abnormal: true
    };
  }
  return { raw, ...definition };
}

export function formatStatusForUser(rawStatus: unknown, context: StatusDisplayContext = "generic") {
  return getStatusDisplay(rawStatus, context).label;
}

export function formatDevelopmentPhaseForUser(rawPhase: unknown) {
  return formatStatusForUser(rawPhase, "developmentPhase");
}

export function getStatusTone(rawStatus: unknown, context: StatusDisplayContext = "generic") {
  return getStatusDisplay(rawStatus, context).tone;
}

export function getStatusHelpItems(context: StatusDisplayContext = "generic"): StatusDisplay[] {
  const definitions = context === "workflow" ? workflowHelpStatuses : contextDefinitions[context] ?? contextDefinitions.generic;
  const seen = new Set<string>();
  const items: StatusDisplay[] = [];
  for (const definition of definitions) {
    if (seen.has(definition.label)) continue;
    seen.add(definition.label);
    items.push({ raw: definition.keys[0] ?? definition.label, ...definition });
  }
  return items;
}

export function getStatusOptions(context: StatusDisplayContext, rawValues: readonly string[]) {
  return rawValues.map((value) => ({ value, label: formatStatusForUser(value, context) }));
}

export function formatStatusErrorForUser(value: unknown, context: StatusDisplayContext = "generic") {
  const text = String(value ?? "").trim();
  if (!text) return "操作未完成。請重新整理後再試；若仍失敗，請主管或 Admin 協助確認。";
  if (text.includes("revision_release_order_conflict") || text.includes("已有較新版正式紀錄") || text.includes("不能發布版次")) {
    return text.includes("不能發布版次") || text.includes("已有較新版正式紀錄")
      ? text
      : "已有較新版正式紀錄，不能發布較低版次。請建立更高版次後重新送審。";
  }
  if (text.includes("submission_not_pending")) return "只有審核中的送審可以核准。請重新整理清單，確認這筆送審目前是否已發布、已駁回或已取消。";
  if (text.includes("reviewer_already_decided")) return "你已經判定過這筆送審。現在請重新整理查看最新審核狀態。";
  if (text.includes("active_sandbox_branch")) return "此送審仍有進行中的設計分支。請先完成或關閉分支後再核准。";
  if (text.includes("phase_gate_required")) return "此送審仍有必要檢查未完成，不能核准。請先完成審核關卡後再處理。";
  if (text.includes("release_failed")) return "核准已送出，但正式發布未完成。請開完整送審頁查看發布錯誤，修正後再重新發布或請 Admin 協助。";
  if (text.includes("duplicate_active_submission")) return "這版已有送審在處理。請先查看既有送審；若不送審了，請取消審核中送審後再重新建立。";
  if (text.includes("UNIQUE constraint failed: submission_files")) return "送審附件重複，請保留一份正確附件後再送出。";
  if (text.includes("drawing_number_not_found")) return "找不到此圖號。請回圖號模組確認編號是否存在，再重新開啟這個流程。";
  if (/not_found|not found|404/i.test(text)) return "找不到這筆資料。請回上一個清單重新開啟；若清單也找不到，請 Admin 協助確認。";
  if (/forbidden|unauthorized|401|403|Insufficient role permission/i.test(text)) return "你目前不能執行這個動作。請改由負責角色處理，或請主管確認權限。";
  if (/constraint failed|SQLITE_CONSTRAINT|Internal Server Error|HTTP 5\d\d|\/api\//i.test(text)) return "操作未完成。請重新整理後再試；若仍發生，請把這個畫面交給 Admin 檢查。";
  if (findDefinition(text, context)) return formatStatusForUser(text, context);
  if (/[一-龥]/u.test(text)) return text;
  return "操作未完成。請重新整理後再試；若仍失敗，請主管或 Admin 協助確認。";
}
