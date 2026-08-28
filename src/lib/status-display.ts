export type StatusDisplayContext =
  | "masterRecord"
  | "submission"
  | "workflow"
  | "applicationStatus"
  | "approvalStatus"
  | "publicationStatus"
  | "readinessStatus"
  | "fileStatus"
  | "accountStatus"
  | "identityStatus"
  | "invitationStatus"
  | "reminderStatus"
  | "numberEffectiveness"
  | "task"
  | "importRow"
  | "importBatch"
  | "settingsLifecycle"
  | "jobStatus"
  | "restorePolicy"
  | "fileSync"
  | "notification"
  | "recognitionStatus"
  | "recognitionReviewStatus"
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
  { keys: ["Draft", "draft"], label: "未發布", description: "主資料尚未發布為正式資料；請先補齊內容並依流程送審。", tone: "warning", actionable: true },
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
    description: "主要製造圖不可作為目前有效主圖，需要重新確認。",
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
    keys: ["PendingAdminConfirm", "admin_confirm"],
    label: "待管理員確認",
    description: "需要管理員確認後才能往下走。",
    tone: "critical",
    abnormal: true,
    actionable: true
  }
];

const submissionStatuses: StatusDefinition[] = [
  {
    keys: ["ReviewApproved"],
    label: "研發受控",
    description: "小數研發版已完成影響審核並受控；不代表量產正式 Released。",
    tone: "success",
    terminal: true
  },
  { keys: ["Pending"], label: "審核中", description: "送審已建立，等待主管或指定審核者處理。", tone: "warning", actionable: true },
  { keys: ["Releasing"], label: "發行中", description: "審核已通過，系統正在建立正式發行紀錄。", tone: "warning" },
  { keys: ["Released"], label: "已發布", description: "已完成審核與正式發行。", tone: "success", terminal: true },
  { keys: ["Rejected"], label: "已退回", description: "審核未通過，需要修正後重新送審。", tone: "critical", actionable: true },
  { keys: ["ReleaseFailed"], label: "發行未完成", description: "正式發行未完成，需要主管或管理員處理。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["Obsolete"], label: "已作廢", description: "此送審紀錄已被新版取代或不再使用。", tone: "critical", terminal: true },
  { keys: ["Cancelled"], label: "已取消", description: "送審流程已取消，不會繼續審核或發行。", tone: "neutral", terminal: true }
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

const applicationStatusStatuses: StatusDefinition[] = [
  { keys: ["Draft", "draft", "editing", "editable"], label: "編輯中", description: "編號申請仍可調整，完成內容後再送出申請。", tone: "warning", actionable: true },
  { keys: ["Pending", "pending", "pending_review", "submitted", "active"], label: "申請中", description: "申請已送出，請等待審核或查看目前處理進度。", tone: "warning", actionable: true },
  { keys: ["Cancelled", "cancelled"], label: "已取消", description: "這筆編號申請已取消，不會再繼續處理。", tone: "neutral", terminal: true },
  { keys: ["Published", "published", "promoted", "official"], label: "已發布", description: "申請結果已發布，後續請從主資料清單查看。", tone: "success", terminal: true },
  { keys: ["Obsolete", "obsolete", "retired", "voided"], label: "已失效", description: "這筆申請已失效，不能再作為目前申請來源。", tone: "neutral", terminal: true }
];

const approvalStatusStatuses: StatusDefinition[] = [
  { keys: ["None", "none", "NotSubmitted", "not_submitted"], label: "未送審", description: "目前尚未送出審核，不代表資料已核准或可發布。", tone: "neutral", actionable: true },
  { keys: ["Pending", "pending", "PendingReview", "pending_review"], label: "審核中", description: "已送出，等待指定審核者判定。", tone: "warning", actionable: true },
  { keys: ["NeedInfo", "need_info", "needs_info", "needs_reconfirmation"], label: "需補資料", description: "審核者要求補充資料；補齊後再重新送審。", tone: "warning", actionable: true },
  { keys: ["Approved", "approved"], label: "已核准", description: "審核已通過；若尚未發布，仍需依發布流程處理。", tone: "success", terminal: true },
  { keys: ["Rejected", "rejected"], label: "已退回", description: "審核未通過，需要修正後重新送審。", tone: "critical", actionable: true },
  { keys: ["Cancelled", "cancelled"], label: "已取消", description: "這筆審核流程已取消，不會繼續判定。", tone: "neutral", terminal: true },
  { keys: ["Resubmitted", "resubmitted"], label: "已重送", description: "資料已修正並再次送出，請查看最新審核紀錄。", tone: "warning", actionable: true }
];

const publicationStatusStatuses: StatusDefinition[] = [
  { keys: ["NotReady", "not_ready", "not_published", "unreleased", "blocked"], label: "尚未可發布", description: "目前仍有必要條件未完成，不能發布。", tone: "warning", actionable: true },
  { keys: ["Ready", "ready", "can_publish", "approved"], label: "可發布", description: "必要條件已具備，可以由具權限角色進行發布。", tone: "success", actionable: true },
  { keys: ["Releasing", "releasing", "running", "publishing"], label: "發布中", description: "系統正在建立已發布資料，請等待結果後再操作。", tone: "warning" },
  { keys: ["Released", "released", "published", "official"], label: "已發布", description: "資料已成為正式紀錄，可以依權限使用。", tone: "success", terminal: true },
  { keys: ["ReleaseFailed", "release_failed", "failed"], label: "發布失敗", description: "發布未完成，請查看錯誤明細並重試或請管理員協助。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["Applied", "applied", "confirmed"], label: "已套用", description: "核准結果已套用到目標資料。", tone: "success", terminal: true },
  { keys: ["ApplyFailed", "apply_failed"], label: "套用失敗", description: "核准結果尚未套用，請重試或請管理員檢查。", tone: "critical", abnormal: true, actionable: true }
];

const readinessStatusStatuses: StatusDefinition[] = [
  { keys: ["Incomplete", "incomplete", "need_info", "needs_info"], label: "未完成", description: "必要資料或檢查尚未齊備，請先補齊後再繼續。", tone: "warning", actionable: true },
  { keys: ["Ready", "ready", "valid"], label: "已就緒", description: "目前條件已具備，可以進入下一步。", tone: "success", actionable: true },
  { keys: ["Blocked", "blocked"], label: "阻擋", description: "目前有條件阻擋流程，請先處理阻擋項目。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["NeedsUpdate", "needs_update", "stale"], label: "需更新", description: "資料或檢查結果已過期，請重新整理後再判定。", tone: "warning", actionable: true },
  { keys: ["NotApplicable", "not_applicable", "na"], label: "不適用", description: "此資料範圍不需要這項檢查，不必處理。", tone: "neutral", terminal: true }
];

const fileStatusStatuses: StatusDefinition[] = [
  { keys: ["None", "none", "no_file"], label: "無檔案", description: "目前沒有可供此流程使用的檔案。", tone: "neutral", actionable: true },
  { keys: ["Queued", "queued", "uploading", "waiting"], label: "等待處理", description: "檔案已進入處理佇列，請等待結果。", tone: "warning" },
  { keys: ["Processing", "processing", "started", "running"], label: "處理中", description: "系統正在檢查或同步檔案，請等待完成。", tone: "warning" },
  { keys: ["Valid", "valid", "available", "uploaded"], label: "可用", description: "檔案已通過必要檢查，可以進入下一步。", tone: "success" },
  { keys: ["NeedInfo", "need_info", "needs_update"], label: "需更新", description: "檔案資訊不足或已過期，請補齊或重新上傳。", tone: "warning", actionable: true },
  { keys: ["Failed", "failed", "error"], label: "處理失敗", description: "檔案處理未完成，請重試或請管理員檢查。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["Missing", "missing", "file_missing"], label: "檔案遺失", description: "系統找不到這個檔案，請重新選擇或補上檔案。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["Conflict", "conflict", "hash_mismatch"], label: "檔案不一致", description: "檔案與既有紀錄不一致，請確認版本後再處理。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["Moved", "moved", "migrated"], label: "已搬移", description: "檔案已完成受控搬移，可以查看目前位置。", tone: "success", terminal: true },
  { keys: ["LocalOnly", "local_only"], label: "僅本機", description: "檔案目前只存在本機，尚未成為共享或正式來源。", tone: "neutral" },
  { keys: ["Disabled", "disabled", "retired"], label: "已停用", description: "此檔案來源已停用，不應再作為目前流程來源。", tone: "neutral", terminal: true }
];

const accountStatusStatuses: StatusDefinition[] = [
  { keys: ["active", "enabled"], label: "使用中", description: "帳號目前可以登入並依權限使用系統。", tone: "success", actionable: true },
  { keys: ["suspended", "disabled", "blocked"], label: "已停權", description: "帳號目前不能登入或執行受限操作，請由管理員處理。", tone: "critical", abnormal: true },
  { keys: ["expired"], label: "已到期", description: "帳號使用期限已到，請由管理員確認是否恢復。", tone: "warning", actionable: true },
  { keys: ["offboarded", "retired"], label: "已離職", description: "帳號已完成離職停用，不應再作為日常使用帳號。", tone: "neutral", terminal: true }
];

const identityStatusStatuses: StatusDefinition[] = [
  { keys: ["active", "verified", "enabled"], label: "使用中", description: "此登入身分已啟用，可用於建立登入 session。", tone: "success" },
  { keys: ["disabled", "blocked"], label: "已停用", description: "此登入身分已停用，不能用來登入系統。", tone: "critical", abnormal: true },
  { keys: ["revoked", "retired"], label: "已撤銷", description: "此登入身分已撤銷，僅保留追溯紀錄。", tone: "neutral", terminal: true },
  { keys: ["expired"], label: "已到期", description: "此登入身分已到期，不能繼續使用。", tone: "warning", terminal: true }
];

const invitationStatusStatuses: StatusDefinition[] = [
  { keys: ["pending", "open", "created"], label: "待接受", description: "邀請連結仍可由受邀者完成設定。", tone: "warning", actionable: true },
  { keys: ["accepted", "completed", "used"], label: "已接受", description: "受邀者已完成設定，這個邀請不需要再處理。", tone: "success", terminal: true },
  { keys: ["revoked", "cancelled"], label: "已撤銷", description: "邀請已撤銷，原連結不能再使用。", tone: "neutral", terminal: true },
  { keys: ["expired"], label: "已過期", description: "邀請已超過有效期限，請建立新的邀請。", tone: "warning", actionable: true }
];

const reminderStatusStatuses: StatusDefinition[] = [
  { keys: ["none", "clear", "0"], label: "無提醒", description: "目前沒有需要額外注意的提醒。", tone: "neutral", terminal: true },
  { keys: ["info", "notice", "warning"], label: "有提醒", description: "有提示資訊，請查看明細判斷是否需要處理。", tone: "info", actionable: true },
  { keys: ["blocker", "blocked", "critical"], label: "阻擋提醒", description: "此提醒會影響下一步，請先處理阻擋條件。", tone: "critical", abnormal: true, actionable: true }
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
  { keys: ["scheduled", "not_started"], label: "未生效", description: "此設定已有安排，但尚未到開始生效日。", tone: "info" },
  { keys: ["expired"], label: "已到期", description: "此設定已過到期日，不再套用到作業判斷。", tone: "neutral", terminal: true },
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

const recognitionStatuses: StatusDefinition[] = [
  { keys: ["queued"], label: "等待辨識", description: "辨識工作已建立，等待系統開始處理。", tone: "warning" },
  { keys: ["extracting", "running"], label: "辨識中", description: "系統正在從來源檔案擷取資料，請等待結果。", tone: "warning" },
  { keys: ["review_ready"], label: "待人工核對", description: "辨識已完成，請由負責人核對候選值與來源證據。", tone: "warning", actionable: true },
  { keys: ["extraction_partial"], label: "部分完成，待核對", description: "部分資料已辨識，仍有候選值需要人工核對。", tone: "warning", actionable: true },
  { keys: ["extraction_failed", "failed"], label: "辨識失敗", description: "辨識未完成，請重新辨識或更換來源檔案。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["ready_to_formalize"], label: "可確認寫入", description: "必要核對已完成，可以先預覽影響再確認寫入 PDM。", tone: "success", actionable: true },
  { keys: ["formalized"], label: "已寫入 PDM", description: "辨識結果已正式寫入 PDM，保留來源與核對紀錄。", tone: "success", terminal: true },
  { keys: ["cancelled"], label: "已由新版取代", description: "這次辨識結果已由新版辨識工作取代，僅供追溯。", tone: "neutral", terminal: true }
];

const recognitionReviewStatuses: StatusDefinition[] = [
  { keys: ["proposed"], label: "待核對", description: "候選值尚未完成人工核對。", tone: "warning", actionable: true },
  { keys: ["conflict"], label: "與系統正式值不同", description: "候選值與目前系統正式值不同，需要人工判定。", tone: "critical", abnormal: true, actionable: true },
  { keys: ["accepted"], label: "已接受", description: "候選值已由人工接受。", tone: "success", terminal: true },
  { keys: ["corrected"], label: "已修正", description: "候選值已由人工修正並保留理由。", tone: "success", terminal: true },
  { keys: ["mapped"], label: "已歸類", description: "候選值已完成欄位與資料歸屬。", tone: "success", terminal: true },
  { keys: ["ignored"], label: "已忽略", description: "候選值已標記為不寫入，保留追溯。", tone: "neutral", terminal: true },
  { keys: ["deferred"], label: "已延後", description: "候選值已延後處理，尚未寫入正式資料。", tone: "warning", actionable: true },
  { keys: ["blocked"], label: "需處理", description: "候選值缺少必要核對或歸屬，暫時不能寫入。", tone: "critical", abnormal: true, actionable: true }
];

const restorePolicyStatuses: StatusDefinition[] = [
  { keys: ["restore_allowed", "allowed", "can_restore"], label: "可還原", description: "這筆資料符合還原條件，可以回到原作業清單。", tone: "success", actionable: true },
  { keys: ["restore_blocked", "blocked", "not_allowed"], label: "不可還原", description: "目前有條件阻擋，不能直接還原。", tone: "critical", abnormal: true },
  { keys: ["controlled_boundary", "controlled"], label: "受控邊界", description: "還原會影響受控資料，需依主管或 Admin 指示處理。", tone: "warning", actionable: true },
  { keys: ["reused", "recycled", "deleted"], label: "已回收或已重用", description: "相關編號或資料已被回收/重用，不能直接還原。", tone: "neutral", terminal: true }
];

const numberEffectivenessStatuses: StatusDefinition[] = [
  {
    keys: ["preview"],
    label: "編號申請",
    description: "編號仍隨申請內容處理，完成申請後再進入後續流程。",
    tone: "info"
  },
  {
    keys: ["candidate", "active", "review_locked", "approved_locked"],
    label: "申請中",
    description: "編號已由這筆申請建立，仍須依流程完成審核與發布。",
    tone: "warning",
    actionable: true
  },
  {
    keys: ["official", "promoted", "legacy_official_reservation"],
    label: "已發布",
    description: "編號已發布，可以依資料狀態與權限使用。",
    tone: "success",
    terminal: true
  },
  {
    keys: ["recycled", "released"],
    label: "已取消",
    description: "原編號申請已取消，這個編號不再屬於該申請。",
    tone: "neutral",
    terminal: true
  }
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

const notificationStatuses: StatusDefinition[] = [
  { keys: ["open"], label: "未處理", description: "通知或待辦仍需要處理。", tone: "warning", actionable: true },
  { keys: ["handled", "resolved", "closed"], label: "已處理", description: "通知或待辦已處理。", tone: "success", terminal: true },
  { keys: ["cancelled"], label: "已取消", description: "此項目已取消。", tone: "neutral", terminal: true }
];

const contextDefinitions: Record<StatusDisplayContext, StatusDefinition[]> = {
  masterRecord: masterRecordStatuses,
  submission: submissionStatuses,
  workflow: workflowStatuses,
  applicationStatus: applicationStatusStatuses,
  approvalStatus: approvalStatusStatuses,
  publicationStatus: publicationStatusStatuses,
  readinessStatus: readinessStatusStatuses,
  fileStatus: fileStatusStatuses,
  accountStatus: accountStatusStatuses,
  identityStatus: identityStatusStatuses,
  invitationStatus: invitationStatusStatuses,
  reminderStatus: reminderStatusStatuses,
  numberEffectiveness: numberEffectivenessStatuses,
  task: taskStatuses,
  importRow: importRowStatuses,
  importBatch: importBatchStatuses,
  settingsLifecycle: settingsLifecycleStatuses,
  jobStatus: jobStatuses,
  restorePolicy: restorePolicyStatuses,
  fileSync: fileSyncStatuses,
  notification: notificationStatuses,
  recognitionStatus: recognitionStatuses,
  recognitionReviewStatus: recognitionReviewStatuses,
  generic: [
    ...masterRecordStatuses,
    ...submissionStatuses,
    ...workflowStatuses,
    ...applicationStatusStatuses,
    ...approvalStatusStatuses,
    ...publicationStatusStatuses,
    ...readinessStatusStatuses,
    ...fileStatusStatuses,
    ...accountStatusStatuses,
    ...identityStatusStatuses,
    ...invitationStatusStatuses,
    ...reminderStatusStatuses,
    ...taskStatuses,
    ...importRowStatuses,
    ...importBatchStatuses,
    ...settingsLifecycleStatuses,
    ...jobStatuses,
    ...restorePolicyStatuses,
    ...fileSyncStatuses,
    ...recognitionStatuses,
    ...recognitionReviewStatuses
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
  if (text.includes("release_failed")) return "核准已送出，但發布未完成。請開完整送審頁查看發布錯誤，修正後再重新發布或請 Admin 協助。";
  if (text.includes("duplicate_active_submission")) return "這版已有送審在處理。請先查看既有送審；若不送審了，請取消審核中送審後再重新建立。";
  if (text.includes("UNIQUE constraint failed: submission_files")) return "送審附件重複，請保留一份正確附件後再送出。";
  if (text.includes("drawing_number_not_found")) return "找不到此圖號。請回圖號工作台確認編號是否存在，再重新開啟這個流程。";
  if (/not_found|not found|404/i.test(text)) return "找不到這筆資料。請回上一個清單重新開啟；若清單也找不到，請 Admin 協助確認。";
  if (/forbidden|unauthorized|401|403|Insufficient role permission/i.test(text)) return "你目前不能執行這個動作。請改由負責角色處理，或請主管確認權限。";
  if (/constraint failed|SQLITE_CONSTRAINT|Internal Server Error|HTTP 5\d\d|\/api\//i.test(text)) return "操作未完成。請重新整理後再試；若仍發生，請把這個畫面交給 Admin 檢查。";
  if (findDefinition(text, context)) return formatStatusForUser(text, context);
  if (/[一-龥]/u.test(text)) return text;
  return "操作未完成。請重新整理後再試；若仍失敗，請主管或 Admin 協助確認。";
}
