# DEV-049 Phase 1B-0：Status Scope Inventory

- 任務：`DEV-049-1B-01`
- Schema：`dev-049-status-scope-inventory.v1`
- 來源：`src/app`、`src/components`
- 執行模式：唯讀、離線、只產出本 inventory artifact

## Summary

| 指標 | 數值 |
| --- | ---: |
| 掃描 source files | 298 |
| status-bearing files | 221 |
| routes | 19 |
| sections | 202 |
| exceptions | 9 |

### Signal counts

| Signal | 次數 |
| --- | ---: |
| `status-column-header` | 35 |
| `status-help-popover` | 2 |
| `status-scope-help` | 31 |
| `status-badge` | 55 |
| `format-status-for-user` | 28 |
| `status-filter` | 191 |
| `status-data-label` | 2 |
| `status-axis-label` | 33 |
| `status-property` | 975 |

### Candidate axis coverage

| 狀態軸 | 涉及檔案數 |
| --- | ---: |
| 資料狀態 | 23 |
| 號碼效力 | 1 |
| 申請狀態 | 108 |
| 審核狀態 | 85 |
| 發布狀態 | 67 |
| 準備狀態 | 11 |
| 檔案狀態 | 41 |
| 任務狀態 | 20 |
| 帳號狀態 | 29 |
| 邀請狀態 | 8 |
| 還原狀態 | 15 |
| 成本狀態 | 10 |
| 提醒 | 30 |

## Status-bearing routes

### `/account-recovery`
- 檔案：`src/app/account-recovery/page.tsx`
- 類型：route
- Signals：`status-property` ×11
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態、邀請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L8: | { status: "loading" }
  - `status-property` L9: | { status: "ready"; account: { displayName: string; email: string | null } }

### `/approvals`
- 檔案：`src/app/approvals/page.tsx`
- 類型：route
- Signals：`status-scope-help` ×2、`status-filter` ×14、`status-axis-label` ×1、`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態、還原狀態、成本狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-scope-help` L5: import { StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L290: <h1>審核工作台 <StatusScopeHelp scope="approvalInbox" /></h1>
  - `status-filter` L71: const statusFilters = [
  - `status-filter` L109: type StatusFilter = (typeof statusFilters)[number]["value"];
  - `status-axis-label` L293: <div className="status-tabs" role="tablist" aria-label="審核狀態">
  - `status-property` L19: status: ApprovalStatus;
  - `status-property` L41: status: string | null;

### `/bom/workbench`
- 檔案：`src/app/bom/workbench/page.tsx`
- 類型：route
- Signals：`status-column-header` ×3、`status-scope-help` ×2、`status-badge` ×3、`format-status-for-user` ×3、`status-axis-label` ×1、`status-property` ×4
- Contexts：`bomDraft`、`restorePolicy`
- 候選狀態軸：申請狀態、審核狀態、發布狀態、檔案狀態、還原狀態、提醒
- Help：欄位級 3；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-column-header` L47: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-column-header` L1367: <StatusColumnHeader context="bomDraft" />
  - `status-scope-help` L47: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L904: <h1>BOM 工作台 <StatusScopeHelp scope="bomWorkbench" /></h1>
  - `status-badge` L47: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-badge` L1387: <StatusBadge status={deleted.draft.status} context="bomDraft" />
  - `format-status-for-user` L49: import { formatStatusForUser } from "@/lib/status-display";
  - `format-status-for-user` L987: <small>{submission.part_name || "未填品名"} · {formatStatusForUser(submission.status, "submission")}</small>
  - `status-axis-label` L1371: <StatusColumnHeader label="還原狀態" context="restorePolicy" />
  - `status-property` L58: status: string;

### `/handoff`
- 檔案：`src/app/handoff/page.tsx`
- 類型：route
- Signals：`status-scope-help` ×2、`status-property` ×10
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-scope-help` L8: import { StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L92: <h1>製造交接 <StatusScopeHelp scope="handoffWorkbench" /></h1>
  - `status-property` L45: | { status: "loading" }
  - `status-property` L46: | { status: "unauthorized" }

### `/numbering/drawings`
- 檔案：`src/app/numbering/drawings/page.tsx`
- 類型：route
- Signals：`status-column-header` ×2、`status-badge` ×4、`format-status-for-user` ×3、`status-filter` ×15、`status-data-label` ×1、`status-axis-label` ×4、`status-property` ×15
- Contexts：`masterRecord`、`numbering_drawings`
- 候選狀態軸：資料狀態、申請狀態、審核狀態、發布狀態、準備狀態、檔案狀態、成本狀態、提醒
- Help：欄位級 2；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-column-header` L11: import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
  - `status-column-header` L516: <StatusColumnHeader label="資料狀態 / 提醒" context="masterRecord" />
  - `status-badge` L11: import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
  - `status-badge` L563: <StatusBadge status={drawing.recordStatus} context="masterRecord" />
  - `format-status-for-user` L13: import { drawingRecordStatusFilterValues, formatStatusForUser } from "@/lib/status-display";
  - `format-status-for-user` L469: <SelectField label="資料狀態" value={recordStatus} onChange={setRecordStatus} options={statuses} formatOption={(option) => formatStatusForUser(option, "masterRecord")} />
  - `status-filter` L33: recordStatus: NumberingRecordStatus;
  - `status-filter` L65: recordStatus: NumberingRecordStatus;
  - `status-data-label` L561: <td data-label="資料狀態 / 提醒">
  - `status-axis-label` L469: <SelectField label="資料狀態" value={recordStatus} onChange={setRecordStatus} options={statuses} formatOption={(option) => formatStatusForUser(option, "masterRecord")} />

### `/numbering/impact`
- 檔案：`src/app/numbering/impact/page.tsx`
- 類型：route
- Signals：`status-column-header` ×2、`status-scope-help` ×2、`status-badge` ×2、`format-status-for-user` ×2、`status-filter` ×5、`status-axis-label` ×1、`status-property` ×5
- Contexts：`masterRecord`
- 候選狀態軸：資料狀態、審核狀態、發布狀態、任務狀態、提醒
- Help：欄位級 2；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-column-header` L8: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-column-header` L240: <StatusColumnHeader context="masterRecord" />
  - `status-scope-help` L8: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L99: <h1>製造圖影響 <StatusScopeHelp scope="impactWorkbench" /></h1>
  - `status-badge` L8: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-badge` L252: <StatusBadge status={partNumber.recordStatus} context="masterRecord" />
  - `format-status-for-user` L11: import { formatStatusForUser } from "@/lib/status-display";
  - `format-status-for-user` L218: <Metric label="資料狀態" value={formatStatusForUser(impact.drawingNumber.recordStatus, "masterRecord")} />
  - `status-filter` L20: recordStatus:
  - `status-filter` L38: recordStatus: PartNumber["recordStatus"];

### `/numbering/imports`
- 檔案：`src/app/numbering/imports/page.tsx`
- 類型：route
- Signals：`status-column-header` ×4、`status-scope-help` ×2、`status-badge` ×4、`status-axis-label` ×1、`status-property` ×1
- Contexts：`importBatch`、`importRow`、`restorePolicy`
- 候選狀態軸：發布狀態、檔案狀態、還原狀態、提醒
- Help：欄位級 4；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-column-header` L7: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-column-header` L436: <StatusColumnHeader context="importRow" />
  - `status-scope-help` L7: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L255: <h1>總表匯入 <StatusScopeHelp scope="importCenter" /></h1>
  - `status-badge` L7: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-badge` L449: <StatusBadge status={row.checkStatus} context="importRow" />
  - `status-axis-label` L592: <StatusColumnHeader label="還原狀態" context="restorePolicy" />
  - `status-property` L26: status: "staged" | "confirmed" | "rejected";

### `/numbering/reports`
- 檔案：`src/app/numbering/reports/page.tsx`
- 類型：route
- Signals：`status-column-header` ×3、`status-scope-help` ×2、`status-badge` ×3、`status-property` ×2
- Contexts：`jobStatus`
- 候選狀態軸：審核狀態、任務狀態
- Help：欄位級 3；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-column-header` L7: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-column-header` L458: <StatusColumnHeader label="執行狀態" context="jobStatus" />
  - `status-scope-help` L7: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L218: <h1>圖號稽核報表 <StatusScopeHelp scope="reportCenter" /></h1>
  - `status-badge` L7: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-badge` L470: <StatusBadge status={job.status} context="jobStatus" />
  - `status-property` L18: status: "queued" | "running" | "completed" | "failed";
  - `status-property` L61: status: "queued" | "running" | "completed" | "failed";

### `/numbering/revisions`
- 檔案：`src/app/numbering/revisions/page.tsx`
- 類型：route
- Signals：`status-scope-help` ×2、`status-filter` ×2、`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、申請狀態、審核狀態、發布狀態、檔案狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-scope-help` L7: import { StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L566: <h1>圖面進版 <StatusScopeHelp scope="revisionSubmission" /></h1>
  - `status-filter` L32: recordStatus: string;
  - `status-filter` L42: recordStatus: string;
  - `status-property` L32: recordStatus: string;
  - `status-property` L42: recordStatus: string;

### `/numbering/search`
- 檔案：`src/app/numbering/search/page.tsx`
- 類型：route
- Signals：`status-badge` ×9、`format-status-for-user` ×2、`status-filter` ×61、`status-axis-label` ×2、`status-property` ×65
- Contexts：`masterRecord`、`numbering_search`
- 候選狀態軸：資料狀態、申請狀態、審核狀態、發布狀態、準備狀態、檔案狀態、任務狀態、成本狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-badge` L12: import { StatusBadge } from "@/components/status-help-popover";
  - `status-badge` L959: <StatusBadge status={root.recordStatus} context="masterRecord" />
  - `format-status-for-user` L14: import { formatStatusErrorForUser, formatStatusForUser, masterRecordStatusFilterValues } from "@/lib/status-display";
  - `format-status-for-user` L757: {formatStatusForUser(status, "masterRecord")}
  - `status-filter` L40: recordStatus: NumberingRecordStatus;
  - `status-filter` L56: recordStatus: NumberingRecordStatus;
  - `status-axis-label` L751: <label className="pdm-master-field">
  - `status-axis-label` L754: <option value="">全部資料狀態</option>
  - `status-property` L40: recordStatus: NumberingRecordStatus;
  - `status-property` L56: recordStatus: NumberingRecordStatus;

### `/numbering/tasks`
- 檔案：`src/app/numbering/tasks/page.tsx`
- 類型：route
- Signals：`status-column-header` ×3、`status-scope-help` ×2、`status-badge` ×3、`status-filter` ×3、`status-axis-label` ×1、`status-property` ×6
- Contexts：`masterRecord`、`task`
- 候選狀態軸：資料狀態、申請狀態、審核狀態、任務狀態、提醒
- Help：欄位級 3；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-column-header` L8: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-column-header` L283: <StatusColumnHeader context="task" />
  - `status-scope-help` L8: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L165: <h1>圖號待辦 <StatusScopeHelp scope="taskCenter" /></h1>
  - `status-badge` L8: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-badge` L306: <StatusBadge status={task.taskStatus} context="task" />
  - `status-filter` L64: recordStatus: string;
  - `status-filter` L104: fetch("/api/numbering/search?recordStatus=Draft&limit=30")
  - `status-axis-label` L356: <StatusColumnHeader label="資料狀態" context="masterRecord" />
  - `status-property` L64: recordStatus: string;

### `/parts`
- 檔案：`src/app/parts/page.tsx`
- 類型：route
- Signals：`status-column-header` ×5、`status-badge` ×6、`format-status-for-user` ×2、`status-filter` ×12、`status-data-label` ×1、`status-axis-label` ×4、`status-property` ×21
- Contexts：`cost`、`masterRecord`、`parts`
- 候選狀態軸：資料狀態、申請狀態、審核狀態、發布狀態、準備狀態、檔案狀態、成本狀態、提醒
- Help：欄位級 5；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-column-header` L10: import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
  - `status-column-header` L651: <StatusColumnHeader label="資料狀態 / 提醒" context="masterRecord" />
  - `status-badge` L10: import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
  - `status-badge` L677: <StatusBadge status={part.recordStatus} context="masterRecord" />
  - `format-status-for-user` L11: import { formatStatusErrorForUser, formatStatusForUser, partRecordStatusFilterValues } from "@/lib/status-display";
  - `format-status-for-user` L569: <FilterSelectField label="資料狀態" value={recordStatus} onChange={setRecordStatus} options={statuses} formatOption={(option) => formatStatusForUser(option, "masterRecord")} />
  - `status-filter` L50: recordStatus: NumberingRecordStatus;
  - `status-filter` L180: const [recordStatus, setRecordStatus] = useState("");
  - `status-data-label` L675: <td data-label="資料狀態 / 提醒">
  - `status-axis-label` L569: <FilterSelectField label="資料狀態" value={recordStatus} onChange={setRecordStatus} options={statuses} formatOption={(option) => formatStatusForUser(option, "masterRecord")} />

### `/privacy/acknowledgement`
- 檔案：`src/app/privacy/acknowledgement/page.tsx`
- 類型：route
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L11: status?: {
  - `status-property` L17: status: "acknowledged" | "reacknowledgement_required" | "not_acknowledged";

### `/settings`
- 檔案：`src/app/settings/page.tsx`
- 類型：route
- Signals：`status-column-header` ×8、`status-scope-help` ×2、`status-badge` ×8、`format-status-for-user` ×2、`status-filter` ×9、`status-axis-label` ×1、`status-property` ×39
- Contexts：`masterRecord`、`settingsLifecycle`
- 候選狀態軸：資料狀態、審核狀態、發布狀態、檔案狀態、任務狀態、帳號狀態、還原狀態、提醒
- Help：欄位級 8；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-column-header` L29: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-column-header` L1696: <StatusColumnHeader context="masterRecord" />
  - `status-scope-help` L29: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L376: <h1>系統設定 <StatusScopeHelp scope="settingsCenter" /></h1>
  - `status-badge` L29: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-badge` L2037: <StatusBadge status="active" context="settingsLifecycle" />
  - `format-status-for-user` L39: import { formatStatusForUser } from "@/lib/status-display";
  - `format-status-for-user` L2647: <td>{formatStatusForUser("default", "settingsLifecycle")}</td>
  - `status-filter` L150: recordStatus: string | null;
  - `status-filter` L300: recordStatus: null,

### `/settings/account-invitations`
- 檔案：`src/app/settings/account-invitations/page.tsx`
- 類型：route
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態、邀請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: status: InvitationStatus;
  - `status-property` L41: function statusLabel(status: InvitationStatus) {

### `/settings/accounts`
- 檔案：`src/app/settings/accounts/page.tsx`
- 類型：route
- Signals：`status-filter` ×2、`status-axis-label` ×5、`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、帳號狀態、邀請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L80: const statusOptions: Array<{ value: string; label: string }> = [
  - `status-filter` L358: {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  - `status-axis-label` L226: setMessage({ type: "error", text: body.message ?? "帳號狀態異動失敗。" });
  - `status-axis-label` L229: setMessage({ type: "success", text: "帳號狀態已更新。" });
  - `status-property` L31: status: IdentityStatus;
  - `status-property` L40: status: "active" | "retired";

### `/share/:token`
- 檔案：`src/app/share/[token]/page.tsx`
- 類型：route
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L23: status: string;
  - `status-property` L43: status: string;

### `/submissions/:id`
- 檔案：`src/app/submissions/[id]/page.tsx`
- 類型：route
- Signals：`status-scope-help` ×2、`status-badge` ×3、`format-status-for-user` ×3、`status-axis-label` ×2、`status-property` ×20
- Contexts：`submission`
- 候選狀態軸：資料狀態、申請狀態、審核狀態、發布狀態、檔案狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-scope-help` L7: import { StatusBadge, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L119: <h1>送審明細 <StatusScopeHelp scope="submissionDetail" /></h1>
  - `status-badge` L7: import { StatusBadge, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-badge` L196: <StatusBadge status={summary.status} context="submission" />
  - `format-status-for-user` L9: import { formatStatusErrorForUser, formatStatusForUser } from "@/lib/status-display";
  - `format-status-for-user` L315: <Info label="狀態" value={submissionDetailStatusLabels[submission.status] ?? formatStatusForUser(submission.status, "submission")} />
  - `status-axis-label` L521: if (text.includes("主資料狀態同步失敗")) return "發行已嘗試完成，但主資料狀態同步未完成。請主管或 Admin 檢查主資料同步後再交接。";
  - `status-property` L18: | { status: "loading" }
  - `status-property` L19: | { status: "unauthorized" }

### `/upload`
- 檔案：`src/app/upload/page.tsx`
- 類型：route
- Signals：`status-scope-help` ×2、`format-status-for-user` ×2、`status-filter` ×2、`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、申請狀態、審核狀態、發布狀態、檔案狀態、任務狀態、帳號狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-scope-help` L9: import { StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L1125: <h1>圖面送審 <StatusScopeHelp scope="uploadSubmission" /></h1>
  - `format-status-for-user` L12: import { formatStatusErrorForUser, formatStatusForUser } from "@/lib/status-display";
  - `format-status-for-user` L1185: {context.drawing.purposeLabel} / {formatStatusForUser(context.drawing.recordStatus, "masterRecord")}
  - `status-filter` L141: recordStatus: string;
  - `status-filter` L1185: {context.drawing.purposeLabel} / {formatStatusForUser(context.drawing.recordStatus, "masterRecord")}
  - `status-property` L106: status: string;
  - `status-property` L141: recordStatus: string;

## Status-bearing sections

### `src/app/api/account-invitations/accept/route.ts`
- 檔案：`src/app/api/account-invitations/accept/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態、邀請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L12: return NextResponse.json({ error: "legacy_invitation_disabled", message: "請使用 Firebase 管理的邀請連結。" }, { status: 404 });
  - `status-property` L22: return NextResponse.json({ error: "account_activation_failed", message: "帳號已建立但登入資料讀取失敗，請回到登入頁重試。" }, { status: 500 });

### `src/app/api/account-invitations/lookup/route.ts`
- 檔案：`src/app/api/account-invitations/lookup/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態、邀請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: return NextResponse.json({ error: "legacy_invitation_disabled", message: "請使用 Firebase 管理的邀請連結。" }, { status: 404 });
  - `status-property` L17: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });

### `src/app/api/account-recovery/complete/route.ts`
- 檔案：`src/app/api/account-recovery/complete/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L11: return NextResponse.json({ error: "account_recovery_failed", message: "密碼重設失敗，請稍後重試。" }, { status: 500 });

### `src/app/api/account-recovery/handoff/route.ts`
- 檔案：`src/app/api/account-recovery/handoff/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: return NextResponse.json({ error: "invalid_origin", message: "要求來源不正確。" }, { status: 403 });
  - `status-property` L20: return NextResponse.json({ error: "json_body_required", message: "要求格式不正確。" }, { status: 415 });

### `src/app/api/account-recovery/lookup/route.ts`
- 檔案：`src/app/api/account-recovery/lookup/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L11: return NextResponse.json({ error: "account_recovery_lookup_failed", message: "連結資料暫時無法讀取，請稍後重試。" }, { status: 500 });

### `src/app/api/account/sessions/[sessionId]/revoke/route.ts`
- 檔案：`src/app/api/account/sessions/[sessionId]/revoke/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L34: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L36: return NextResponse.json({ error: "session_revoke_failed", message: "工作階段撤銷失敗，請稍後重試。" }, { status: 500 });

### `src/app/api/admin/account-invitations/route.ts`
- 檔案：`src/app/api/admin/account-invitations/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：發布狀態、帳號狀態、邀請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L18: return NextResponse.json({ error: "account_invitation_failed", message: "邀請處理失敗，請稍後重試。" }, { status: 500 });

### `src/app/api/admin/accounts/[userId]/identities/[identityId]/route.ts`
- 檔案：`src/app/api/admin/accounts/[userId]/identities/[identityId]/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L10: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L12: return NextResponse.json({ error: "identity_lifecycle_failed", message: "登入方式異動失敗，請稍後重試。" }, { status: 500 });

### `src/app/api/admin/accounts/[userId]/lifecycle/route.ts`
- 檔案：`src/app/api/admin/accounts/[userId]/lifecycle/route.ts`
- 類型：section
- Signals：`status-axis-label` ×2、`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-axis-label` L17: return NextResponse.json({ error: "account_lifecycle_failed", message: "帳號狀態異動失敗，請稍後重試。" }, { status: 500 });
  - `status-axis-label` L28: return NextResponse.json({ error: "invalid_lifecycle_action", message: "不支援的帳號狀態異動。" }, { status: 400 });
  - `status-property` L15: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L17: return NextResponse.json({ error: "account_lifecycle_failed", message: "帳號狀態異動失敗，請稍後重試。" }, { status: 500 });

### `src/app/api/admin/accounts/[userId]/login-aliases/[aliasId]/route.ts`
- 檔案：`src/app/api/admin/accounts/[userId]/login-aliases/[aliasId]/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L24: return NextResponse.json({ error: "server_not_configured", message: "工號登入尚未完成伺服器設定。" }, { status: 503 });

### `src/app/api/admin/accounts/[userId]/login-aliases/route.ts`
- 檔案：`src/app/api/admin/accounts/[userId]/login-aliases/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L24: return NextResponse.json({ error: "server_not_configured", message: "工號登入尚未完成伺服器設定。" }, { status: 503 });

### `src/app/api/admin/accounts/[userId]/password-reset/route.ts`
- 檔案：`src/app/api/admin/accounts/[userId]/password-reset/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：發布狀態、帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L11: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L13: return NextResponse.json({ error: "password_reset_failed", message: "密碼重設連結建立失敗，請稍後重試。" }, { status: 500 });

### `src/app/api/admin/accounts/[userId]/route.ts`
- 檔案：`src/app/api/admin/accounts/[userId]/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L11: return NextResponse.json({ error: "account_lifecycle_failed", message: "帳號資料處理失敗，請稍後重試。" }, { status: 500 });

### `src/app/api/admin/accounts/[userId]/sessions/revoke/route.ts`
- 檔案：`src/app/api/admin/accounts/[userId]/sessions/revoke/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L11: return NextResponse.json({ error: "account_session_revoke_failed", message: "撤銷登入狀態失敗，請稍後重試。" }, { status: 500 });

### `src/app/api/admin/accounts/route.ts`
- 檔案：`src/app/api/admin/accounts/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L11: return NextResponse.json({ error: "account_lifecycle_failed", message: "帳號資料處理失敗，請稍後重試。" }, { status: 500 });

### `src/app/api/approvals/requests/[requestId]/apply/route.ts`
- 檔案：`src/app/api/approvals/requests/[requestId]/apply/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L32: if (!detail) return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND" }, { status: 404 });
  - `status-property` L44: return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND" }, { status: 404 });

### `src/app/api/approvals/requests/[requestId]/decisions/route.ts`
- 檔案：`src/app/api/approvals/requests/[requestId]/decisions/route.ts`
- 類型：section
- Signals：`status-property` ×7
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L29: return NextResponse.json({ error: "decision must be approved, rejected, or needs_info" }, { status: 400 });
  - `status-property` L40: if (!detail) return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND" }, { status: 404 });

### `src/app/api/approvals/requests/[requestId]/route.ts`
- 檔案：`src/app/api/approvals/requests/[requestId]/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L13: if (!detail) return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
  - `status-property` L15: return NextResponse.json({ error: "Approval request not found" }, { status: 404 });

### `src/app/api/approvals/requests/route.ts`
- 檔案：`src/app/api/approvals/requests/route.ts`
- 類型：section
- Signals：`status-property` ×8
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: if (!actionCode) return NextResponse.json({ error: "actionCode is required" }, { status: 400 });
  - `status-property` L19: return NextResponse.json({ error: "APPROVAL_DOMAIN_SUBMIT_REQUIRED" }, { status: 400 });

### `src/app/api/auth/employee-login-intents/route.ts`
- 檔案：`src/app/api/auth/employee-login-intents/route.ts`
- 類型：section
- Signals：`status-property` ×8
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L26: return NextResponse.json({ error: "Employee login routing is disabled" }, { status: 404 });
  - `status-property` L29: return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });

### `src/app/api/auth/firebase/session/route.ts`
- 檔案：`src/app/api/auth/firebase/session/route.ts`
- 類型：section
- Signals：`status-property` ×16
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L35: return NextResponse.json({ error: error.message, code: error.code }, { status: error.httpStatus });
  - `status-property` L40: { status: 503 }

### `src/app/api/auth/google/callback/route.ts`
- 檔案：`src/app/api/auth/google/callback/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態、邀請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: const response = NextResponse.redirect(redirectUrl, { status: 303 });
  - `status-property` L22: return NextResponse.json({ error: "legacy_google_oauth_disabled" }, { status: 404 });

### `src/app/api/auth/google/start/route.ts`
- 檔案：`src/app/api/auth/google/start/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態、邀請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L10: return NextResponse.json({ error: "legacy_google_oauth_disabled" }, { status: 404 });
  - `status-property` L25: status: 303,

### `src/app/api/auth/login/route.ts`
- 檔案：`src/app/api/auth/login/route.ts`
- 類型：section
- Signals：`status-property` ×8
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L33: return NextResponse.json({ error: "Demo login is disabled" }, { status: 404 });
  - `status-property` L39: if (!account) return NextResponse.json({ error: "Unknown demo account" }, { status: 400 });

### `src/app/api/auth/token/route.ts`
- 檔案：`src/app/api/auth/token/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L13: return NextResponse.json({ error: "Firebase BFF token exchange required" }, { status: 404 });
  - `status-property` L20: return NextResponse.json({ error: "電子郵件與密碼為必填" }, { status: 400 });

### `src/app/api/bom/drafts/[draftId]/active/route.ts`
- 檔案：`src/app/api/bom/drafts/[draftId]/active/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  - `status-property` L21: return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/bom/drafts/[draftId]/delete/route.ts`
- 檔案：`src/app/api/bom/drafts/[draftId]/delete/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: if (!draft) return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  - `status-property` L19: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/bom/drafts/[draftId]/diff/route.ts`
- 檔案：`src/app/api/bom/drafts/[draftId]/diff/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  - `status-property` L21: return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/bom/drafts/[draftId]/obsolete-request/route.ts`
- 檔案：`src/app/api/bom/drafts/[draftId]/obsolete-request/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: if (!draft) return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  - `status-property` L19: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/bom/drafts/[draftId]/reconfirm-replacements/route.ts`
- 檔案：`src/app/api/bom/drafts/[draftId]/reconfirm-replacements/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  - `status-property` L21: return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/bom/drafts/[draftId]/restore/route.ts`
- 檔案：`src/app/api/bom/drafts/[draftId]/restore/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、還原狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: if (!draft) return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  - `status-property` L19: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/bom/drafts/[draftId]/route.ts`
- 檔案：`src/app/api/bom/drafts/[draftId]/route.ts`
- 類型：section
- Signals：`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  - `status-property` L21: return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/bom/drafts/[draftId]/submit-review/route.ts`
- 檔案：`src/app/api/bom/drafts/[draftId]/submit-review/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  - `status-property` L21: return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/bom/drafts/from-assembly/route.ts`
- 檔案：`src/app/api/bom/drafts/from-assembly/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L22: return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  - `status-property` L27: return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/bom/drafts/import-xls/route.ts`
- 檔案：`src/app/api/bom/drafts/import-xls/route.ts`
- 類型：section
- Signals：`status-property` ×7
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L35: return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_XLS_PAYLOAD_INVALID" }, { status: 400 });
  - `status-property` L39: return NextResponse.json({ error: "submissionId is required" }, { status: 400 });

### `src/app/api/bom/releases/[releaseId]/export/route.ts`
- 檔案：`src/app/api/bom/releases/[releaseId]/export/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L32: return NextResponse.json({ error: "BOM release snapshot not found" }, { status: 404 });
  - `status-property` L37: return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/bom/reviews/[reviewId]/approve/route.ts`
- 檔案：`src/app/api/bom/reviews/[reviewId]/approve/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L21: return NextResponse.json({ error: "BOM review not found" }, { status: 404 });
  - `status-property` L25: return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });

### `src/app/api/bom/reviews/[reviewId]/reject/route.ts`
- 檔案：`src/app/api/bom/reviews/[reviewId]/reject/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: return NextResponse.json({ error: "BOM review not found" }, { status: 404 });
  - `status-property` L21: return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });

### `src/app/api/bom/workbench/route.ts`
- 檔案：`src/app/api/bom/workbench/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  - `status-property` L22: return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/chat/route.ts`
- 檔案：`src/app/api/chat/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: return NextResponse.json({ error: "訊息為必填" }, { status: 400 });
  - `status-property` L39: return NextResponse.json({ error: "找不到對話" }, { status: 404 });

### `src/app/api/file-metadata/detect/route.ts`
- 檔案：`src/app/api/file-metadata/detect/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L21: return NextResponse.json({ error: "files_required" }, { status: 400 });
  - `status-property` L45: { status: 400 }

### `src/app/api/integrations/procurement/releases/route.ts`
- 檔案：`src/app/api/integrations/procurement/releases/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L66: status: submission.bom.status,

### `src/app/api/integrations/procurement/sync-runs/[runId]/route.ts`
- 檔案：`src/app/api/integrations/procurement/sync-runs/[runId]/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: return NextResponse.json({ error: "動作必須為確認或失敗" }, { status: 400 });
  - `status-property` L23: status: action === "acknowledge" ? "acknowledged" : "failed",

### `src/app/api/integrations/procurement/sync-runs/route.ts`
- 檔案：`src/app/api/integrations/procurement/sync-runs/route.ts`
- 類型：section
- Signals：`status-property` ×7
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L28: return NextResponse.json({ error: "?格?蝟餌絞敹???ERP?澈摮??∟頃" }, { status: 400 });
  - `status-property` L43: if (!submissionId) return NextResponse.json({ error: "submissionId is required" }, { status: 400 });

### `src/app/api/items/[partNumber]/revisions/route.ts`
- 檔案：`src/app/api/items/[partNumber]/revisions/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: return NextResponse.json({ error: "料號為必填" }, { status: 400 });

### `src/app/api/items/[partNumber]/where-used/route.ts`
- 檔案：`src/app/api/items/[partNumber]/where-used/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: return NextResponse.json({ error: "料號為必填" }, { status: 400 });

### `src/app/api/lifecycle/controlled-history/route.ts`
- 檔案：`src/app/api/lifecycle/controlled-history/route.ts`
- 類型：section
- Signals：`status-filter` ×1、`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、申請狀態、審核狀態、發布狀態、還原狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L138: source_status: request.entitySummary.recordStatus ?? "Obsolete",
  - `status-property` L28: status: "Obsolete",
  - `status-property` L37: status: "approved",

### `src/app/api/lifecycle/obsolete-requests/route.ts`
- 檔案：`src/app/api/lifecycle/obsolete-requests/route.ts`
- 類型：section
- Signals：`status-filter` ×2、`status-property` ×7
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L103: recordStatus: result.entity.recordStatus,
  - `status-property` L51: return NextResponse.json({ error: "LIFE_UNSUPPORTED_ENTITY" }, { status: 400 });
  - `status-property` L54: return NextResponse.json({ error: "reason is required" }, { status: 400 });

### `src/app/api/lifecycle/policy/route.ts`
- 檔案：`src/app/api/lifecycle/policy/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: return NextResponse.json({ error: "LIFE_UNSUPPORTED_ENTITY" }, { status: 400 });
  - `status-property` L18: return NextResponse.json({ error: "LIFE_ATTACHMENT_PARENT_INVALID" }, { status: 409 });

### `src/app/api/manufacturing-baselines/[baselineId]/release/route.ts`
- 檔案：`src/app/api/manufacturing-baselines/[baselineId]/release/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  - `status-property` L21: return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });

### `src/app/api/manufacturing-baselines/resolve/route.ts`
- 檔案：`src/app/api/manufacturing-baselines/resolve/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  - `status-property` L24: return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });

### `src/app/api/manufacturing-baselines/route.ts`
- 檔案：`src/app/api/manufacturing-baselines/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  - `status-property` L27: return NextResponse.json(result, { status: 201 });

### `src/app/api/notifications/route.ts`
- 檔案：`src/app/api/notifications/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、準備狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L34: const status = dashboard.run?.status ?? "missing";
  - `status-property` L36: const blockerCount = dashboard.readiness?.blockers.length ?? 0;

### `src/app/api/numbering/admin/matrix/route.ts`
- 檔案：`src/app/api/numbering/admin/matrix/route.ts`
- 類型：section
- Signals：`status-filter` ×3、`status-property` ×8
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、審核狀態、發布狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L139: recordStatus: typeof body.recordStatus === "string" ? body.recordStatus : undefined,
  - `status-property` L51: return NextResponse.json({ error: "permissionKind must be page or action" }, { status: 400 });
  - `status-property` L66: return NextResponse.json({ error: "scopeKind must be department, project, or action" }, { status: 400 });

### `src/app/api/numbering/approval-batches/[batchId]/route.ts`
- 檔案：`src/app/api/numbering/approval-batches/[batchId]/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L28: return NextResponse.json({ error: "Approval batch not found" }, { status: 404 });
  - `status-property` L44: return NextResponse.json({ error: "Approval batch not found" }, { status: 404 });

### `src/app/api/numbering/approval-batches/route.ts`
- 檔案：`src/app/api/numbering/approval-batches/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、發布狀態、還原狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L43: status: status as ListNumberingApprovalBatchesInput["status"],
  - `status-property` L75: return NextResponse.json({ error: "approvalRequestIds is required" }, { status: 400 });

### `src/app/api/numbering/approval-decisions/route.ts`
- 檔案：`src/app/api/numbering/approval-decisions/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L21: return NextResponse.json({ error: "approvalRequestId is required" }, { status: 400 });
  - `status-property` L24: return NextResponse.json({ error: "decision must be approved, rejected, or needs_info" }, { status: 400 });

### `src/app/api/numbering/approval-requests/route.ts`
- 檔案：`src/app/api/numbering/approval-requests/route.ts`
- 類型：section
- Signals：`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、發布狀態、還原狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L31: return NextResponse.json({ error: "Invalid approval action code" }, { status: 400 });
  - `status-property` L34: return NextResponse.json({ error: "reason is required" }, { status: 400 });

### `src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/route.ts`
- 檔案：`src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L19: if (!form) return numberStateFlowJson({ error: { code: "candidate_file_required", message: "A valid multipart body is required.", retryable: false } }, { status: 400 });
  - `status-property` L22: return numberStateFlowJson({ error: { code: "candidate_file_required", message: "A candidate revision file is required.", retryable: false } }, { status: 400 });

### `src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/route.ts`
- 檔案：`src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L28: return numberStateFlowJson({ ...result, pdmCompany: access.company }, { status: 201 });

### `src/app/api/numbering/draft-workspaces/route.ts`
- 檔案：`src/app/api/numbering/draft-workspaces/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L71: { status: result.idempotentReplay ? 200 : 201 }
  - `status-property` L74: return numberStateFlowJson({ ...result, pdmCompany: access.company }, { status: result.idempotentReplay ? 200 : 201 });

### `src/app/api/numbering/drafts/overdue/route.ts`
- 檔案：`src/app/api/numbering/drafts/overdue/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L21: return NextResponse.json({ error: message }, { status: 400 });

### `src/app/api/numbering/drawing-revision-packages/[packageId]/model-basis/route.ts`
- 檔案：`src/app/api/numbering/drawing-revision-packages/[packageId]/model-basis/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  - `status-property` L29: return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });

### `src/app/api/numbering/drawing-revision-packages/[packageId]/supplements/route.ts`
- 檔案：`src/app/api/numbering/drawing-revision-packages/[packageId]/supplements/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L19: { status: 403 }
  - `status-property` L30: return NextResponse.json({ error: "supplement_reason_required", message: "請選擇補件原因。" }, { status: 400 });

### `src/app/api/numbering/drawing-revision-packages/supplements/[supplementId]/decision/route.ts`
- 檔案：`src/app/api/numbering/drawing-revision-packages/supplements/[supplementId]/decision/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L21: return NextResponse.json({ error: "supplement_decision_required", message: "請選擇核准或駁回補件。" }, { status: 400 });
  - `status-property` L52: return NextResponse.json({ error: error.code, code: error.code, message: error.message, details: error.details }, { status: error.status });

### `src/app/api/numbering/drawing-revisions/fff-assessments/route.ts`
- 檔案：`src/app/api/numbering/drawing-revisions/fff-assessments/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L37: return NextResponse.json({ error: "Invalid drawing revision FFF assessment", details: errors }, { status: 400 });
  - `status-property` L83: return NextResponse.json({ ...result, pdmCompany: companyResult.company }, { status: 201 });

### `src/app/api/numbering/drawing-revisions/submissions/route.ts`
- 檔案：`src/app/api/numbering/drawing-revisions/submissions/route.ts`
- 類型：section
- Signals：`status-property` ×9
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、檔案狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L32: { status: 403 }
  - `status-property` L73: return NextResponse.json({ error: "Invalid drawing revision submission", details: errors }, { status: 400 });

### `src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/previews/route.ts`
- 檔案：`src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/previews/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、檔案狀態、任務狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L18: if (!attachment) return NextResponse.json({ error: "MASTER_ATTACHMENT_NOT_FOUND" }, { status: 404 });
  - `status-property` L40: return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });

### `src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/restore/route.ts`
- 檔案：`src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/restore/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：檔案狀態、還原狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L24: if (!attachment) return NextResponse.json({ error: "LIFE_ATTACHMENT_NOT_FOUND" }, { status: 404 });
  - `status-property` L33: return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });

### `src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts`
- 檔案：`src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts`
- 類型：section
- Signals：`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L30: if (!derivative) return NextResponse.json({ error: "PREVIEW_DERIVATIVE_NOT_FOUND" }, { status: 404 });
  - `status-property` L46: if (!result) return NextResponse.json({ error: "MASTER_ATTACHMENT_NOT_FOUND" }, { status: 404 });

### `src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts`
- 檔案：`src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: if (!result) return NextResponse.json({ error: "DRAWING_NUMBER_NOT_FOUND" }, { status: 404 });
  - `status-property` L28: if (!result) return NextResponse.json({ error: "DRAWING_NUMBER_NOT_FOUND" }, { status: 404 });

### `src/app/api/numbering/drawings/[drawingNumber]/parts/route.ts`
- 檔案：`src/app/api/numbering/drawings/[drawingNumber]/parts/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L29: if (!match) return NextResponse.json({ error: `DRAWING_NUMBER_NOT_FOUND: ${decodedDrawingNumber}` }, { status: 404 });
  - `status-property` L33: if (seriesCode.length > 80) return NextResponse.json({ error: "seriesCode must be 80 characters or fewer" }, { status: 400 });

### `src/app/api/numbering/drawings/[drawingNumber]/submission-context/route.ts`
- 檔案：`src/app/api/numbering/drawings/[drawingNumber]/submission-context/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L24: return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  - `status-property` L31: { status: 500 }

### `src/app/api/numbering/drawings/[drawingNumber]/submission-readiness/route.ts`
- 檔案：`src/app/api/numbering/drawings/[drawingNumber]/submission-readiness/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、準備狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L24: return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  - `status-property` L27: return NextResponse.json({ error: "DRAWING_SUBMISSION_READINESS_FAILED", message }, { status: 500 });

### `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts`
- 檔案：`src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L32: return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  - `status-property` L39: { status: 500 }

### `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`
- 檔案：`src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`
- 類型：section
- Signals：`status-property` ×8
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態、準備狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L32: const readiness = resolveSubmissionReadiness({
  - `status-property` L49: blockers: readiness.blockers

### `src/app/api/numbering/drawings/route.ts`
- 檔案：`src/app/api/numbering/drawings/route.ts`
- 類型：section
- Signals：`status-filter` ×3、`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L31: const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  - `status-filter` L42: recordStatus,
  - `status-property` L31: const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  - `status-property` L42: recordStatus,

### `src/app/api/numbering/drawings/workbench/[rowKey]/route.ts`
- 檔案：`src/app/api/numbering/drawings/workbench/[rowKey]/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L13: return NextResponse.json({ error: "drawing_workbench_not_enabled" }, { status: 404 });
  - `status-property` L42: if (!detail) return NextResponse.json({ error: "drawing_workbench_row_not_found" }, { status: 404 });

### `src/app/api/numbering/drawings/workbench/route.ts`
- 檔案：`src/app/api/numbering/drawings/workbench/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L13: return NextResponse.json({ error: "drawing_workbench_not_enabled" }, { status: 404 });

### `src/app/api/numbering/duplicate-check/route.ts`
- 檔案：`src/app/api/numbering/duplicate-check/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L27: return NextResponse.json({ error: "At least one numbering check field is required" }, { status: 400 });
  - `status-property` L34: return NextResponse.json({ error: message }, { status: 400 });

### `src/app/api/numbering/export-jobs/[jobId]/route.ts`
- 檔案：`src/app/api/numbering/export-jobs/[jobId]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：任務狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: return NextResponse.json({ error: "Export job not found" }, { status: 404 });

### `src/app/api/numbering/export-jobs/route.ts`
- 檔案：`src/app/api/numbering/export-jobs/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：任務狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L28: return NextResponse.json({ error: "exportMode must be no_audit, last_change_summary, or full_change_summary" }, { status: 400 });
  - `status-property` L32: return NextResponse.json(result, { status: 201 });

### `src/app/api/numbering/impact-analysis/route.ts`
- 檔案：`src/app/api/numbering/impact-analysis/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L18: return NextResponse.json({ error: "drawingNumber is required" }, { status: 400 });
  - `status-property` L21: return NextResponse.json({ error: "Admin or R&D Manager approval is required to apply invalidation" }, { status: 403 });

### `src/app/api/numbering/import-batches/[batchId]/delete/route.ts`
- 檔案：`src/app/api/numbering/import-batches/[batchId]/delete/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L19: const policy = buildNumberingImportBatchLifecyclePolicy({ batchId: batch.id, status: batch.status });

### `src/app/api/numbering/import-batches/[batchId]/restore/route.ts`
- 檔案：`src/app/api/numbering/import-batches/[batchId]/restore/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：還原狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L19: const policy = buildNumberingImportBatchLifecyclePolicy({ batchId: batch.id, status: batch.status });

### `src/app/api/numbering/import-batches/[batchId]/route.ts`
- 檔案：`src/app/api/numbering/import-batches/[batchId]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: return NextResponse.json({ error: "Import batch not found" }, { status: 404 });

### `src/app/api/numbering/import-batches/route.ts`
- 檔案：`src/app/api/numbering/import-batches/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L19: const batches = await listNumberingImportBatchesAsync({ companyId: companyResult.company.companyId, status: "rejected", limit });
  - `status-property` L24: policy: buildNumberingImportBatchLifecyclePolicy({ batchId: batch.id, status: batch.status })

### `src/app/api/numbering/monthly-audit-reports/[reportId]/route.ts`
- 檔案：`src/app/api/numbering/monthly-audit-reports/[reportId]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: return NextResponse.json({ error: "Monthly numbering audit report not found" }, { status: 404 });

### `src/app/api/numbering/monthly-audit-reports/route.ts`
- 檔案：`src/app/api/numbering/monthly-audit-reports/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L36: return NextResponse.json(result, { status: 201 });

### `src/app/api/numbering/part-number-drafts/[draftId]/reconfirm/route.ts`
- 檔案：`src/app/api/numbering/part-number-drafts/[draftId]/reconfirm/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: return NextResponse.json(productionSliceDeniedPayload("POST /api/numbering/part-number-drafts/[draftId]/reconfirm"), { status: 403 });

### `src/app/api/numbering/part-number-drafts/[draftId]/restore/route.ts`
- 檔案：`src/app/api/numbering/part-number-drafts/[draftId]/restore/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：還原狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: return NextResponse.json(productionSliceDeniedPayload("POST /api/numbering/part-number-drafts/[draftId]/restore"), { status: 403 });

### `src/app/api/numbering/part-number-drafts/[draftId]/route.ts`
- 檔案：`src/app/api/numbering/part-number-drafts/[draftId]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L22: return NextResponse.json({ error: "version is required for optimistic locking" }, { status: 400 });

### `src/app/api/numbering/part-number-drafts/[draftId]/submit-review/route.ts`
- 檔案：`src/app/api/numbering/part-number-drafts/[draftId]/submit-review/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: return NextResponse.json(productionSliceDeniedPayload("POST /api/numbering/part-number-drafts/[draftId]/submit-review"), { status: 403 });

### `src/app/api/numbering/part-number-drafts/route.ts`
- 檔案：`src/app/api/numbering/part-number-drafts/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、發布狀態、任務狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L76: return NextResponse.json({ error: "Invalid part-number draft request", details: errors }, { status: 400 });
  - `status-property` L97: return NextResponse.json({ draft, pdmCompany: access.company }, { status: 201 });

### `src/app/api/numbering/records/[rootCode]/draft/route.ts`
- 檔案：`src/app/api/numbering/records/[rootCode]/draft/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: return NextResponse.json({ error: "confirmDelete is required" }, { status: 400 });
  - `status-property` L31: return NextResponse.json({ error: message }, { status: errorStatus(message) });

### `src/app/api/numbering/records/[rootCode]/obsolete/route.ts`
- 檔案：`src/app/api/numbering/records/[rootCode]/obsolete/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L19: return NextResponse.json({ error: "reason is required" }, { status: 400 });

### `src/app/api/numbering/records/route.ts`
- 檔案：`src/app/api/numbering/records/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L37: return NextResponse.json({ error: "Invalid numbering record request", details: errors }, { status: 400 });
  - `status-property` L54: return NextResponse.json({ ...result, pdmCompany: access.company }, { status: 201 });

### `src/app/api/numbering/relations/route.ts`
- 檔案：`src/app/api/numbering/relations/route.ts`
- 類型：section
- Signals：`status-filter` ×13、`status-property` ×14
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、審核狀態、發布狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L58: const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  - `status-filter` L70: recordStatus,
  - `status-property` L58: const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  - `status-property` L70: recordStatus,

### `src/app/api/numbering/roots/[rootCode]/append-policy/route.ts`
- 檔案：`src/app/api/numbering/roots/[rootCode]/append-policy/route.ts`
- 類型：section
- Signals：`status-filter` ×4、`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L29: const reasonRequired = [detail.root.recordStatus, ...detail.partNumbers.map((part) => part.recordStatus), ...detail.drawingNumbers.map((drawing) => drawing.recordStatus)].some(
  - `status-filter` L32: const locked = ["Obsolete", "Merged"].includes(detail.root.recordStatus);
  - `status-property` L23: if (!detail) return NextResponse.json({ error: "PART_ROOT_NOT_FOUND" }, { status: 404 });
  - `status-property` L29: const reasonRequired = [detail.root.recordStatus, ...detail.partNumbers.map((part) => part.recordStatus), ...detail.drawingNumbers.map((drawing) => drawing.recordStatus)].some(

### `src/app/api/numbering/roots/[rootCode]/drawing-part/route.ts`
- 檔案：`src/app/api/numbering/roots/[rootCode]/drawing-part/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L41: return NextResponse.json({ error: "Invalid contextual drawing and part request", details: errors }, { status: 400 });
  - `status-property` L61: return NextResponse.json({ ...result, pdmCompany: access.company }, { status: result.reusedFromIdempotency ? 200 : 201 });

### `src/app/api/numbering/roots/[rootCode]/drawings/route.ts`
- 檔案：`src/app/api/numbering/roots/[rootCode]/drawings/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L38: if (errors.length > 0 || !purposeCode) return NextResponse.json({ error: "Invalid contextual drawing request", details: errors }, { status: 400 });
  - `status-property` L53: return NextResponse.json({ ...result, pdmCompany: access.company }, { status: result.reusedFromIdempotency ? 200 : 201 });

### `src/app/api/numbering/roots/[rootCode]/obsolete-impact/route.ts`
- 檔案：`src/app/api/numbering/roots/[rootCode]/obsolete-impact/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L24: return NextResponse.json({ error: message }, { status: message.includes("NOT_FOUND") ? 404 : 400 });

### `src/app/api/numbering/roots/[rootCode]/parts/route.ts`
- 檔案：`src/app/api/numbering/roots/[rootCode]/parts/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L35: if (errors.length > 0) return NextResponse.json({ error: "Invalid contextual part request", details: errors }, { status: 400 });
  - `status-property` L53: return NextResponse.json({ ...result, pdmCompany: access.company }, { status: result.reusedFromIdempotency ? 200 : 201 });

### `src/app/api/numbering/roots/[rootCode]/route.ts`
- 檔案：`src/app/api/numbering/roots/[rootCode]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L18: return NextResponse.json({ error: "Numbering root not found" }, { status: 404 });

### `src/app/api/numbering/roots/[rootCode]/submission-readiness/route.ts`
- 檔案：`src/app/api/numbering/roots/[rootCode]/submission-readiness/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、準備狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: const readiness = await resolveRootSubmissionReadiness({
  - `status-property` L21: return NextResponse.json(readiness);

### `src/app/api/numbering/rule-simulator/route.ts`
- 檔案：`src/app/api/numbering/rule-simulator/route.ts`
- 類型：section
- Signals：`status-filter` ×2、`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L23: recordStatus: body.recordStatus ?? body.record_status,
  - `status-property` L23: recordStatus: body.recordStatus ?? body.record_status,
  - `status-property` L31: return NextResponse.json({ error: message }, { status: 400 });

### `src/app/api/numbering/search/route.ts`
- 檔案：`src/app/api/numbering/search/route.ts`
- 類型：section
- Signals：`status-filter` ×3、`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L32: const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  - `status-filter` L38: recordStatus,
  - `status-property` L32: const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  - `status-property` L38: recordStatus,

### `src/app/api/numbering/tasks/[taskId]/route.ts`
- 檔案：`src/app/api/numbering/tasks/[taskId]/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：任務狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: const status = String(body.status ?? body.action ?? "").trim();
  - `status-property` L18: return NextResponse.json({ error: "status must be open, handled, or cancelled" }, { status: 400 });

### `src/app/api/numbering/variants/route.ts`
- 檔案：`src/app/api/numbering/variants/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L21: return NextResponse.json({ error: "Invalid numbering variant request", details: errors }, { status: 400 });
  - `status-property` L31: return NextResponse.json(result, { status: 201 });

### `src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts`
- 檔案：`src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、檔案狀態、任務狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L18: if (!attachment) return NextResponse.json({ error: "MASTER_ATTACHMENT_NOT_FOUND" }, { status: 404 });
  - `status-property` L40: return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });

### `src/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route.ts`
- 檔案：`src/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：檔案狀態、還原狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L24: if (!attachment) return NextResponse.json({ error: "LIFE_ATTACHMENT_NOT_FOUND" }, { status: 404 });
  - `status-property` L33: return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });

### `src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts`
- 檔案：`src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts`
- 類型：section
- Signals：`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L30: if (!derivative) return NextResponse.json({ error: "PREVIEW_DERIVATIVE_NOT_FOUND" }, { status: 404 });
  - `status-property` L46: if (!result) return NextResponse.json({ error: "MASTER_ATTACHMENT_NOT_FOUND" }, { status: 404 });

### `src/app/api/parts/[partNumber]/attachments/route.ts`
- 檔案：`src/app/api/parts/[partNumber]/attachments/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: if (!result) return NextResponse.json({ error: "PART_NUMBER_NOT_FOUND" }, { status: 404 });
  - `status-property` L28: if (!result) return NextResponse.json({ error: "PART_NUMBER_NOT_FOUND" }, { status: 404 });

### `src/app/api/parts/[partNumber]/cost-change-requests/[requestId]/route.ts`
- 檔案：`src/app/api/parts/[partNumber]/cost-change-requests/[requestId]/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、成本狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L19: return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 });
  - `status-property` L32: if (!part) return NextResponse.json({ error: "Part number not found" }, { status: 404 });

### `src/app/api/parts/[partNumber]/cost-profiles/route.ts`
- 檔案：`src/app/api/parts/[partNumber]/cost-profiles/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、成本狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L22: return NextResponse.json({ error: "costType must be outsourced, in_house, purchase, trial, or other" }, { status: 400 });
  - `status-property` L25: return NextResponse.json({ error: "tiers array is required" }, { status: 400 });

### `src/app/api/parts/[partNumber]/cost-resolution/route.ts`
- 檔案：`src/app/api/parts/[partNumber]/cost-resolution/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：成本狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L45: return NextResponse.json({ error: error instanceof Error ? error.message : "PART_COST_RESOLUTION_FAILED" }, { status: 400 });

### `src/app/api/parts/[partNumber]/route.ts`
- 檔案：`src/app/api/parts/[partNumber]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：成本狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L18: return NextResponse.json({ error: "Part number not found" }, { status: 404 });

### `src/app/api/parts/[partNumber]/shared-models/route.ts`
- 檔案：`src/app/api/parts/[partNumber]/shared-models/route.ts`
- 類型：section
- Signals：`status-property` ×7
- Contexts：（未直接找到 context）
- 候選狀態軸：發布狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  - `status-property` L22: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

### `src/app/api/parts/[partNumber]/variant/route.ts`
- 檔案：`src/app/api/parts/[partNumber]/variant/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L30: return NextResponse.json({ error: error instanceof Error ? error.message : "PART_VARIANT_UPDATE_FAILED" }, { status: 400 });

### `src/app/api/parts/route.ts`
- 檔案：`src/app/api/parts/route.ts`
- 類型：section
- Signals：`status-filter` ×3、`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、審核狀態、發布狀態、成本狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L31: const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  - `status-filter` L41: recordStatus,
  - `status-property` L31: const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  - `status-property` L41: recordStatus,

### `src/app/api/policy/management/route.ts`
- 檔案：`src/app/api/policy/management/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L35: { status: 500 }
  - `status-property` L53: { status: 400 }

### `src/app/api/preview-jobs/[jobId]/complete/route.ts`
- 檔案：`src/app/api/preview-jobs/[jobId]/complete/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、檔案狀態、任務狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: const status = body.status === "succeeded" || body.status === "skipped" ? body.status : "failed";
  - `status-property` L38: return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });

### `src/app/api/preview-jobs/claim/route.ts`
- 檔案：`src/app/api/preview-jobs/claim/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、任務狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L29: if (!configuredToken) return NextResponse.json({ error: "PREVIEW_WORKER_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  - `status-property` L31: if (!providedToken || providedToken !== configuredToken) return NextResponse.json({ error: "PREVIEW_WORKER_FORBIDDEN" }, { status: 403 });

### `src/app/api/privacy/acknowledgements/current/route.ts`
- 檔案：`src/app/api/privacy/acknowledgements/current/route.ts`
- 類型：section
- Signals：`status-property` ×11
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L78: return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  - `status-property` L82: { status: 500 }

### `src/app/api/public/shares/[token]/package/route.ts`
- 檔案：`src/app/api/public/shares/[token]/package/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: return NextResponse.json({ error: "找不到分享連結" }, { status: 404 });
  - `status-property` L59: return NextResponse.json({ error: "儲存的發布包路徑超出發布包資料夾" }, { status: 500 });

### `src/app/api/public/shares/[token]/responses/route.ts`
- 檔案：`src/app/api/public/shares/[token]/responses/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L11: if (!publicShare) return NextResponse.json({ error: "找不到分享連結" }, { status: 404 });
  - `status-property` L15: if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

### `src/app/api/public/shares/[token]/route.ts`
- 檔案：`src/app/api/public/shares/[token]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L13: if (!publicShare) return NextResponse.json({ error: "找不到分享連結" }, { status: 404 });

### `src/app/api/settings/gdrive/folders/route.ts`
- 檔案：`src/app/api/settings/gdrive/folders/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L23: { status: 503 }

### `src/app/api/settings/gdrive/folders/verify/route.ts`
- 檔案：`src/app/api/settings/gdrive/folders/verify/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：發布狀態、檔案狀態、帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L18: return NextResponse.json({ error: "GDRIVE_FOLDER_ID_INVALID" }, { status: 400 });
  - `status-property` L21: return NextResponse.json({ error: "GDRIVE_INTENDED_USE_INVALID" }, { status: 400 });

### `src/app/api/settings/route.ts`
- 檔案：`src/app/api/settings/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：發布狀態、檔案狀態、帳號狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L30: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  - `status-property` L64: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

### `src/app/api/settings/secrets/[kind]/activate/route.ts`
- 檔案：`src/app/api/settings/secrets/[kind]/activate/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L14: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  - `status-property` L31: return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });

### `src/app/api/settings/secrets/[kind]/draft/route.ts`
- 檔案：`src/app/api/settings/secrets/[kind]/draft/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L14: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  - `status-property` L36: return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });

### `src/app/api/settings/secrets/[kind]/revoke/route.ts`
- 檔案：`src/app/api/settings/secrets/[kind]/revoke/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L14: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  - `status-property` L36: return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });

### `src/app/api/settings/secrets/[kind]/test/route.ts`
- 檔案：`src/app/api/settings/secrets/[kind]/test/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  - `status-property` L23: return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });

### `src/app/api/settings/secrets/route.ts`
- 檔案：`src/app/api/settings/secrets/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

### `src/app/api/storage/evidence/route.ts`
- 檔案：`src/app/api/storage/evidence/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：（待人工判定）
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

### `src/app/api/submission-lifecycle-requests/[requestId]/approve/route.ts`
- 檔案：`src/app/api/submission-lifecycle-requests/[requestId]/approve/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: if (!lifecycleRequest) return NextResponse.json({ error: "Submission lifecycle request not found" }, { status: 404 });
  - `status-property` L19: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/submission-lifecycle-requests/[requestId]/reject/route.ts`
- 檔案：`src/app/api/submission-lifecycle-requests/[requestId]/reject/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: if (!lifecycleRequest) return NextResponse.json({ error: "Submission lifecycle request not found" }, { status: 404 });
  - `status-property` L19: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/submissions/[id]/ai-risks/route.ts`
- 檔案：`src/app/api/submissions/[id]/ai-risks/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });

### `src/app/api/submissions/[id]/ai-summary/route.ts`
- 檔案：`src/app/api/submissions/[id]/ai-summary/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });

### `src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts`
- 檔案：`src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L19: if (!existing) return NextResponse.json({ error: "Approval matrix requirement not found" }, { status: 404 });

### `src/app/api/submissions/[id]/approval-matrix/route.ts`
- 檔案：`src/app/api/submissions/[id]/approval-matrix/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L19: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L35: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/submissions/[id]/approve/route.ts`
- 檔案：`src/app/api/submissions/[id]/approve/route.ts`
- 類型：section
- Signals：`status-property` ×13
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L31: return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  - `status-property` L37: { status: 409 }

### `src/app/api/submissions/[id]/bom/diff/route.ts`
- 檔案：`src/app/api/submissions/[id]/bom/diff/route.ts`
- 類型：section
- Signals：`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L21: return NextResponse.json({ error: "?曆??啁璅祟鞈?" }, { status: 404 });
  - `status-property` L25: return NextResponse.json({ error: "Target ?曆???BOM" }, { status: 409 });

### `src/app/api/submissions/[id]/bom/export/route.ts`
- 檔案：`src/app/api/submissions/[id]/bom/export/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L43: return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  - `status-property` L49: return NextResponse.json({ error: "?曆???BOM" }, { status: 404 });

### `src/app/api/submissions/[id]/bom/route.ts`
- 檔案：`src/app/api/submissions/[id]/bom/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });

### `src/app/api/submissions/[id]/cancel/route.ts`
- 檔案：`src/app/api/submissions/[id]/cancel/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  - `status-property` L27: { status: 403 }

### `src/app/api/submissions/[id]/changes/[changeId]/route.ts`
- 檔案：`src/app/api/submissions/[id]/changes/[changeId]/route.ts`
- 類型：section
- Signals：`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L19: if (!existing) return NextResponse.json({ error: "Change request not found" }, { status: 404 });

### `src/app/api/submissions/[id]/changes/route.ts`
- 檔案：`src/app/api/submissions/[id]/changes/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L28: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/submissions/[id]/checkout/route.ts`
- 檔案：`src/app/api/submissions/[id]/checkout/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  - `status-property` L24: return NextResponse.json({ error: "?????3 ??120 ??" }, { status: 400 });

### `src/app/api/submissions/[id]/discussions/[commentId]/route.ts`
- 檔案：`src/app/api/submissions/[id]/discussions/[commentId]/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L20: return NextResponse.json({ error: "Discussion comment not found" }, { status: 404 });

### `src/app/api/submissions/[id]/discussions/route.ts`
- 檔案：`src/app/api/submissions/[id]/discussions/route.ts`
- 類型：section
- Signals：`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L31: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/submissions/[id]/duplicate-geometry/route.ts`
- 檔案：`src/app/api/submissions/[id]/duplicate-geometry/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L14: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });

### `src/app/api/submissions/[id]/files/[...filePath]/route.ts`
- 檔案：`src/app/api/submissions/[id]/files/[...filePath]/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: return NextResponse.json({ error: "Invalid file route" }, { status: 404 });
  - `status-property` L23: return NextResponse.json({ error: "Only PDF files can be previewed" }, { status: 415 });

### `src/app/api/submissions/[id]/issues/[issueId]/route.ts`
- 檔案：`src/app/api/submissions/[id]/issues/[issueId]/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L20: return NextResponse.json({ error: "Review issue not found" }, { status: 404 });

### `src/app/api/submissions/[id]/issues/route.ts`
- 檔案：`src/app/api/submissions/[id]/issues/route.ts`
- 類型：section
- Signals：`status-property` ×9
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L31: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/submissions/[id]/obsolete-request/route.ts`
- 檔案：`src/app/api/submissions/[id]/obsolete-request/route.ts`
- 類型：section
- Signals：`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L21: if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });

### `src/app/api/submissions/[id]/pdf-markups/[markupId]/route.ts`
- 檔案：`src/app/api/submissions/[id]/pdf-markups/[markupId]/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L20: return NextResponse.json({ error: "PDF markup not found" }, { status: 404 });

### `src/app/api/submissions/[id]/pdf-markups/route.ts`
- 檔案：`src/app/api/submissions/[id]/pdf-markups/route.ts`
- 類型：section
- Signals：`status-property` ×9
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L32: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts`
- 檔案：`src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts`
- 類型：section
- Signals：`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L19: if (!existing) return NextResponse.json({ error: "Phase gate check not found" }, { status: 404 });

### `src/app/api/submissions/[id]/phase-gates/route.ts`
- 檔案：`src/app/api/submissions/[id]/phase-gates/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L32: if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

### `src/app/api/submissions/[id]/recovery-summary/route.ts`
- 檔案：`src/app/api/submissions/[id]/recovery-summary/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L16: return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  - `status-property` L35: status: submission.status,

### `src/app/api/submissions/[id]/reject/route.ts`
- 檔案：`src/app/api/submissions/[id]/reject/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L22: return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  - `status-property` L26: return NextResponse.json({ error: `Only Pending submissions can be rejected. Current status: ${submission.status}` }, { status: 409 });

### `src/app/api/submissions/[id]/release-package/route.ts`
- 檔案：`src/app/api/submissions/[id]/release-package/route.ts`
- 類型：section
- Signals：`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L22: return NextResponse.json({ error: "Release package not found" }, { status: 404 });
  - `status-property` L28: return NextResponse.json({ error: "Only Released or Obsolete submissions can download release packages" }, { status: 409 });

### `src/app/api/submissions/[id]/retry-release/route.ts`
- 檔案：`src/app/api/submissions/[id]/retry-release/route.ts`
- 類型：section
- Signals：`status-property` ×8
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L19: return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  - `status-property` L25: { status: 409 }

### `src/app/api/submissions/[id]/retry-upload/route.ts`
- 檔案：`src/app/api/submissions/[id]/retry-upload/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  - `status-property` L26: return NextResponse.json({ error: "敺祟?貉??冗 ID 撠閮剖?" }, { status: 400 });

### `src/app/api/submissions/[id]/return-for-correction/route.ts`
- 檔案：`src/app/api/submissions/[id]/return-for-correction/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  - `status-property` L53: { status: error.status }

### `src/app/api/submissions/[id]/reuse-candidates/route.ts`
- 檔案：`src/app/api/submissions/[id]/reuse-candidates/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L14: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });

### `src/app/api/submissions/[id]/route.ts`
- 檔案：`src/app/api/submissions/[id]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });

### `src/app/api/submissions/[id]/sandbox/[branchId]/route.ts`
- 檔案：`src/app/api/submissions/[id]/sandbox/[branchId]/route.ts`
- 類型：section
- Signals：`status-property` ×8
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L20: if (!submission) return NextResponse.json({ error: "Sandbox branch not found" }, { status: 404 });
  - `status-property` L25: return NextResponse.json({ error: "Sandbox branch not found" }, { status: 404 });

### `src/app/api/submissions/[id]/sandbox/route.ts`
- 檔案：`src/app/api/submissions/[id]/sandbox/route.ts`
- 類型：section
- Signals：`status-property` ×4
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  - `status-property` L31: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });

### `src/app/api/submissions/[id]/shares/[shareId]/route.ts`
- 檔案：`src/app/api/submissions/[id]/shares/[shareId]/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  - `status-property` L19: if (!share) return NextResponse.json({ error: "?曆??啣?鈭恍??" }, { status: 404 });

### `src/app/api/submissions/[id]/shares/route.ts`
- 檔案：`src/app/api/submissions/[id]/shares/route.ts`
- 類型：section
- Signals：`status-property` ×6
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L27: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  - `status-property` L39: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });

### `src/app/api/submissions/[id]/supplier-responses/[responseId]/route.ts`
- 檔案：`src/app/api/submissions/[id]/supplier-responses/[responseId]/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  - `status-property` L23: if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

### `src/app/api/submissions/[id]/supplier-responses/route.ts`
- 檔案：`src/app/api/submissions/[id]/supplier-responses/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L15: if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });

### `src/app/api/submissions/preflight-lock/route.ts`
- 檔案：`src/app/api/submissions/preflight-lock/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L23: return NextResponse.json({ error: "圖號或料號為必填" }, { status: 400 });

### `src/app/api/submissions/revision-suggestion/route.ts`
- 檔案：`src/app/api/submissions/revision-suggestion/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L34: return NextResponse.json({ error: "drawing_number_required" }, { status: 400 });
  - `status-property` L45: { status: 400 }

### `src/app/api/submissions/route.ts`
- 檔案：`src/app/api/submissions/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L76: { status: 410 }

### `src/app/api/technical-transfer/[id]/export/route.ts`
- 檔案：`src/app/api/technical-transfer/[id]/export/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態、檔案狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L17: if (!pkg) return Response.json({ error: { code: "PUBLISHED_HANDOFF_NOT_FOUND", message: "找不到已發布交接。", retryable: false } }, { status: 404 });

### `src/app/api/technical-transfer/route.ts`
- 檔案：`src/app/api/technical-transfer/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L32: status: pkg.status,

### `src/app/api/transfer-packages/[id]/cancel/route.ts`
- 檔案：`src/app/api/transfer-packages/[id]/cancel/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (!body) return numberStateFlowJson({ error: "invalid_json", message: "請提供有效的 JSON。" }, { status: 400 });

### `src/app/api/transfer-packages/[id]/draft-items/[itemId]/route.ts`
- 檔案：`src/app/api/transfer-packages/[id]/draft-items/[itemId]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (!body) return numberStateFlowJson({ error: { code: "invalid_json", message: "請提供有效的 JSON。", retryable: false } }, { status: 400 });

### `src/app/api/transfer-packages/[id]/draft-items/route.ts`
- 檔案：`src/app/api/transfer-packages/[id]/draft-items/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (!body) return numberStateFlowJson({ error: { code: "invalid_json", message: "請提供有效的 JSON。", retryable: false } }, { status: 400 });

### `src/app/api/transfer-packages/[id]/items/[itemId]/route.ts`
- 檔案：`src/app/api/transfer-packages/[id]/items/[itemId]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L12: if (!body) return numberStateFlowJson({ error: "invalid_json", message: "請提供有效的 JSON。" }, { status: 400 });

### `src/app/api/transfer-packages/[id]/items/route.ts`
- 檔案：`src/app/api/transfer-packages/[id]/items/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (!body) return numberStateFlowJson({ error: "invalid_json", message: "請提供有效的 JSON。" }, { status: 400 });

### `src/app/api/transfer-packages/[id]/publish/route.ts`
- 檔案：`src/app/api/transfer-packages/[id]/publish/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (!body) return numberStateFlowJson({ error: { code: "invalid_json", message: "請提供有效的 JSON。", retryable: false } }, { status: 400 });

### `src/app/api/transfer-packages/[id]/readiness-summary/route.ts`
- 檔案：`src/app/api/transfer-packages/[id]/readiness-summary/route.ts`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、準備狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L13: const readiness = await buildTransferPackageReadiness(id, access.company.companyId);
  - `status-property` L14: return NextResponse.json({ readiness, pdmCompany: access.company }, { headers: { "cache-control": "private, no-store" } });

### `src/app/api/transfer-packages/[id]/route.ts`
- 檔案：`src/app/api/transfer-packages/[id]/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L21: if (!body) return numberStateFlowJson({ error: "invalid_json", message: "請提供有效的 JSON。" }, { status: 400 });

### `src/app/api/transfer-packages/[id]/submit-review/route.ts`
- 檔案：`src/app/api/transfer-packages/[id]/submit-review/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (!body) return numberStateFlowJson({ error: { code: "invalid_json", message: "請提供有效的 JSON。", retryable: false } }, { status: 400 });

### `src/app/api/transfer-packages/[id]/withdraw-review/route.ts`
- 檔案：`src/app/api/transfer-packages/[id]/withdraw-review/route.ts`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (!body) return numberStateFlowJson({ error: { code: "invalid_json", message: "請提供有效的 JSON。", retryable: false } }, { status: 400 });

### `src/app/api/transfer-packages/route.ts`
- 檔案：`src/app/api/transfer-packages/route.ts`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L9: if (!body) return numberStateFlowJson({ error: "invalid_json", message: "請提供有效的 JSON。" }, { status: 400 });
  - `status-property` L27: return numberStateFlowJson({ workbench, pdmCompany: access.company }, { status: 201 });

### `src/components/dashboard.tsx`
- 檔案：`src/components/dashboard.tsx`
- 類型：section
- Signals：`status-column-header` ×2、`status-scope-help` ×2、`status-badge` ×6、`format-status-for-user` ×7、`status-filter` ×6、`status-axis-label` ×3、`status-property` ×22
- Contexts：`masterRecord`、`submission`
- 候選狀態軸：資料狀態、申請狀態、審核狀態、發布狀態、準備狀態、檔案狀態、任務狀態、還原狀態、成本狀態、提醒
- Help：欄位級 2；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-column-header` L36: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-column-header` L492: <StatusColumnHeader context="masterRecord" />
  - `status-scope-help` L36: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L2299: <h1>PDM 圖面資料庫 <StatusScopeHelp scope="dashboardSummary" /></h1>
  - `status-badge` L36: import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
  - `status-badge` L2435: <StatusBadge status={submission.status} context="submission" />
  - `format-status-for-user` L39: import { formatStatusErrorForUser, formatStatusForUser } from "@/lib/status-display";
  - `format-status-for-user` L69: return formatStatusForUser(value, "workflow");
  - `status-filter` L134: recordStatus: string;
  - `status-filter` L166: const statusFilters: StatusFilterConfig[] = [

### `src/components/dashboard/layout-parts.tsx`
- 檔案：`src/components/dashboard/layout-parts.tsx`
- 類型：section
- Signals：`status-column-header` ×2、`status-badge` ×3
- Contexts：`submission`
- 候選狀態軸：申請狀態、審核狀態、任務狀態、提醒
- Help：欄位級 2；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-column-header` L5: import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
  - `status-column-header` L323: <StatusColumnHeader context="submission" />
  - `status-badge` L5: import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
  - `status-badge` L157: <StatusBadge status={submission.status} context="submission" />

### `src/components/drawing-workbench.tsx`
- 檔案：`src/components/drawing-workbench.tsx`
- 類型：section
- Signals：`status-filter` ×5、`status-axis-label` ×1、`status-property` ×5
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、申請狀態、審核狀態、發布狀態、檔案狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L377: <dl className="drawing-workbench-facts"><div><dt>用途</dt><dd>{drawing.purposeCode}</dd></div><div><dt>關聯料號</dt><dd>{drawing.linkedPartNumbers.length > 0 ? drawing.linkedPartNumbers.join("、") : "尚未關聯"}</dd></div><div><dt>資
  - `status-filter` L383: drawing={{ id: drawing.id, drawingNumber: drawing.drawingNumber, purposeCode: drawing.purposeCode, recordStatus: drawing.recordStatus, linkedPartNumbers: drawing.linkedPartNumbers }}
  - `status-axis-label` L377: <dl className="drawing-workbench-facts"><div><dt>用途</dt><dd>{drawing.purposeCode}</dd></div><div><dt>關聯料號</dt><dd>{drawing.linkedPartNumbers.length > 0 ? drawing.linkedPartNumbers.join("、") : "尚未關聯"}</dd></div><div><dt>資
  - `status-property` L377: <dl className="drawing-workbench-facts"><div><dt>用途</dt><dd>{drawing.purposeCode}</dd></div><div><dt>關聯料號</dt><dd>{drawing.linkedPartNumbers.length > 0 ? drawing.linkedPartNumbers.join("、") : "尚未關聯"}</dd></div><div><dt>資
  - `status-property` L383: drawing={{ id: drawing.id, drawingNumber: drawing.drawingNumber, purposeCode: drawing.purposeCode, recordStatus: drawing.recordStatus, linkedPartNumbers: drawing.linkedPartNumbers }}

### `src/components/lifecycle-ux.tsx`
- 檔案：`src/components/lifecycle-ux.tsx`
- 類型：section
- Signals：`status-property` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態、檔案狀態、任務狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L345: status: ObjectLifecycleStatus;
  - `status-property` L456: function describeObjectLifecycleStatus(status: ObjectLifecycleStatus) {

### `src/components/master-attachment-panel.tsx`
- 檔案：`src/components/master-attachment-panel.tsx`
- 類型：section
- Signals：`status-property` ×3
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態、審核狀態、發布狀態、檔案狀態、任務狀態、還原狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L42: status: "ready" | "stale" | "retired" | "failed";
  - `status-property` L49: status: "queued" | "running" | "succeeded" | "failed" | "skipped" | "cancelled";

### `src/components/number-state-legacy-route.tsx`
- 檔案：`src/components/number-state-legacy-route.tsx`
- 類型：section
- Signals：`status-scope-help` ×2
- Contexts：（未直接找到 context）
- 候選狀態軸：申請狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-scope-help` L6: import { StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L63: <h1>{title} {statusScope ? <StatusScopeHelp scope={statusScope} /> : null}</h1>

### `src/components/number-state-workspace.tsx`
- 檔案：`src/components/number-state-workspace.tsx`
- 類型：section
- Signals：`status-scope-help` ×2、`format-status-for-user` ×2、`status-filter` ×2、`status-axis-label` ×3、`status-property` ×12
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、號碼效力、申請狀態、審核狀態、發布狀態、準備狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-scope-help` L30: import { StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L616: <StatusScopeHelp
  - `format-status-for-user` L31: import { formatStatusForUser } from "@/lib/status-display";
  - `format-status-for-user` L2009: return <span className={`number-state-badge qualification-${qualification}`}>{formatStatusForUser(qualification, "numberEffectiveness")}</span>;
  - `status-filter` L197: recordStatus: string;
  - `status-filter` L216: recordStatus: string;
  - `status-axis-label` L951: <label><span>生命週期</span><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value as "all" | LifecycleStatus)}><option value="all">全部</option><option value="active">進行中</option><option value="cancell
  - `status-axis-label` L970: <thead><tr><th>{moduleConfig.reservedCodeLabel}</th><th>申請名稱</th><th>內容</th><th>{lifecycleV2Enabled && module === "drawings" ? "首版準備 / 整包狀態" : "申請狀態 / 號碼效力"}</th></tr></thead>
  - `status-property` L60: readiness: "incomplete" | "ready" | "stale" | "not_applicable";
  - `status-property` L133: status: "pending" | "approved" | "rejected" | "needs_info" | "cancelled" | "apply_failed" | "applied";

### `src/components/numbering-contextual-entrypoints.tsx`
- 檔案：`src/components/numbering-contextual-entrypoints.tsx`
- 類型：section
- Signals：`status-filter` ×18、`status-axis-label` ×1、`status-property` ×11
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、審核狀態、發布狀態、檔案狀態、任務狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-filter` L7: type RecordStatus =
  - `status-filter` L34: formalTargets: Array<{ entityType: "part_number" | "drawing_number"; entityCode: string; recordStatus: RecordStatus }>;
  - `status-axis-label` L217: {!canDeleteDraftRoot && !canObsoleteRoot && mode === "root" ? <p className="pdm-contextual-hint">目前狀態不可新增、刪除或申請作廢，請先查看待辦或審核狀態。</p> : null}
  - `status-property` L34: formalTargets: Array<{ entityType: "part_number" | "drawing_number"; entityCode: string; recordStatus: RecordStatus }>;
  - `status-property` L35: parts: Array<{ partNumber: string; recordStatus: RecordStatus }>;

### `src/components/status-help-popover.tsx`
- 檔案：`src/components/status-help-popover.tsx`
- 類型：section
- Signals：`status-column-header` ×1、`status-help-popover` ×2、`status-scope-help` ×1、`status-badge` ×1、`status-property` ×1
- Contexts：`generic`
- 候選狀態軸：還原狀態
- Help：欄位級 1；StatusHelpPopover 2；scope-level present
- 代表證據：
  - `status-column-header` L156: export function StatusColumnHeader({ context = "generic", label = "狀態", className = "" }: StatusColumnHeaderProps) {
  - `status-help-popover` L36: export function StatusHelpPopover({ context = "generic", buttonLabel = "查看狀態說明", className = "" }: StatusHelpPopoverProps) {
  - `status-help-popover` L160: <StatusHelpPopover context={context} />
  - `status-scope-help` L165: export function StatusScopeHelp({ scope, buttonLabel, className = "" }: StatusScopeHelpProps) {
  - `status-badge` L318: export function StatusBadge({ status, context = "generic", className = "" }: StatusBadgeProps) {
  - `status-property` L21: status: unknown;

### `src/components/technical-transfer-workspace.tsx`
- 檔案：`src/components/technical-transfer-workspace.tsx`
- 類型：section
- Signals：`status-property` ×1
- Contexts：（未直接找到 context）
- 候選狀態軸：審核狀態、發布狀態
- Help：欄位級 0；StatusHelpPopover 0；scope-level not_yet_present
- 代表證據：
  - `status-property` L14: status: string;

### `src/components/transfer-package-workbench.tsx`
- 檔案：`src/components/transfer-package-workbench.tsx`
- 類型：section
- Signals：`status-scope-help` ×2、`status-filter` ×1、`status-property` ×31
- Contexts：（未直接找到 context）
- 候選狀態軸：資料狀態、審核狀態、發布狀態、準備狀態、檔案狀態、任務狀態、提醒
- Help：欄位級 0；StatusHelpPopover 0；scope-level present
- 代表證據：
  - `status-scope-help` L30: import { StatusScopeHelp } from "@/components/status-help-popover";
  - `status-scope-help` L662: return <div className="topbar transfer-topbar"><div><h1>{title} <StatusScopeHelp scope="transferPackageWorkbench" /></h1><p>{subtitle}</p></div><div className="transfer-topbar-actions">{actions}<Link className="secondary
  - `status-filter` L536: <td>{item.recordStatus ?? "-"}</td>
  - `status-property` L88: const [readiness, setReadiness] = useState<Phase1DReadiness | null>(null);
  - `status-property` L150: const readinessResponse = await fetch(`/api/transfer-packages/${encodeURIComponent(props.packageId)}/readiness-summary`, { cache: "no-store" });

## Exceptions

以下是 scanner 依規則標出的待 registry / rollout 判定項目；它們不是本階段自動修復清單。

| 類型 | 檔案 | route | 行 | 摘要 |
| --- | --- | --- | ---: | --- |
| `status-bearing-without-help` | `src/app/numbering/search/page.tsx` | /numbering/search | - | 未找到 StatusColumnHeader、StatusHelpPopover 或 StatusScopeHelp |
| `plain-status-label` | `src/app/settings/account-invitations/page.tsx` | /settings/account-invitations | 314 | <th>狀態</th> |
| `status-bearing-without-help` | `src/app/settings/accounts/page.tsx` | /settings/accounts | - | 未找到 StatusColumnHeader、StatusHelpPopover 或 StatusScopeHelp |
| `plain-status-label` | `src/app/settings/accounts/page.tsx` | /settings/accounts | 376 | <th>狀態</th> |
| `plain-status-label` | `src/app/submissions/[id]/page.tsx` | /submissions/:id | 315 | <Info label="狀態" value={submissionDetailStatusLabels[submission.status] ?? formatStatusForUser(submission.status, "submission")} /> |
| `generic-status-context` | `src/components/status-help-popover.tsx` | section | 36 | export function StatusHelpPopover({ context = "generic", buttonLabel = "查看狀態說明", className = "" }: StatusHelpPopoverProps) { |
| `generic-status-context` | `src/components/status-help-popover.tsx` | section | 156 | export function StatusColumnHeader({ context = "generic", label = "狀態", className = "" }: StatusColumnHeaderProps) { |
| `plain-status-label` | `src/components/status-help-popover.tsx` | section | 156 | export function StatusColumnHeader({ context = "generic", label = "狀態", className = "" }: StatusColumnHeaderProps) { |
| `generic-status-context` | `src/components/status-help-popover.tsx` | section | 318 | export function StatusBadge({ status, context = "generic", className = "" }: StatusBadgeProps) { |

## Next handoff

- 以本 inventory 作為 `DEV-049-1B-02` scope registry 的輸入；registry 需人工確認 route / section / title / axes / contexts / exceptions。
- 本 artifact 不代表已完成 `StatusScopeHelp`、頁面 rollout、raw status 改名或 browser QC。
- 建議重跑：`npm.cmd run inventory:dev-049-status-scope`。
