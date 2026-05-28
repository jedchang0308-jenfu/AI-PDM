# PDM 管理辦法基準草案

狀態：Proposed Baseline  
版本：2026-05-27  
Owner：CTO / PDM Admin  
適用範圍：AI PDM Web/API MVP、SolidWorks Add-in 送審流程、Google Drive 發布流程  

本文件是目前系統已實作規則的基準草案，用於 RD、QA、QC 與 AI 助手查詢。正式生產上線前，仍需由管理層完成 P0 正式 PDM 管理辦法確認。

## 1. 圖號規則

- `drawing_number` 為必填欄位。
- `drawing_number + revision` 必須唯一，系統不可接受重複送審。
- 圖號代表工程圖、3D 模型或受控技術文件的識別碼。
- 新版設計變更不得覆蓋既有 Released 紀錄，必須建立新的 revision 送審紀錄。
- 送審 API 必須在寫入檔案前檢查重複 `drawing_number + revision`，避免失敗送審留下 orphan files。
- 建議圖號只使用英文字母、數字、底線、連字號與句點；若公司既有圖號格式不同，應先由 PDM Admin 在正式管理辦法中確認。

## 2. 料號規則

- `part_number` 為必填欄位。
- `part_number` 代表 item master identity，同一料號不得重複指向不同實體零件。
- item master 可保存目前有效 revision 指標，但 submission history 必須保留所有送審與發布紀錄。
- 同一零件改版時應沿用料號並建立新 revision；不同零件不得共用料號。
- 若需要變更料號命名規則，需同步更新送審表單、SolidWorks Add-in 與 AI 政策資料來源。

## 3. 版次規則

- `revision` 為必填欄位。
- MVP 目前接受使用者或 SolidWorks Add-in 提交的 revision 字串，不自動產生版次。
- 新設計變更應建立下一個 revision 的新送審紀錄。
- Released 紀錄必須保持可追溯，不可因後續 revision 建立而被覆蓋或刪除。
- Pending / Rejected / ReleaseFailed revision 不得更新 item master 的 `current_revision`。
- 新 revision 成功 Released 後，系統才更新 item master 的 `current_revision`，並將同一 item 既有 Released revision 自動轉為 `Obsolete`。
- `Obsolete` revision 代表已被新版取代；內部仍可查詢與下載 release package，但不可作為製造交接、採購同步或外部分享的有效版本。
- 若公司決定固定版次格式，例如 `A/B/C`、`R01/R02` 或語意版本，需在正式管理辦法中補充並新增對應欄位驗證。

## 4. 檔案提交規則

- 每筆送審至少需包含一個檔案。
- 支援的 file roles / file types 為 `pdf`、`dwg`、`sldprt`、`sldasm`、`slddrw`、`other`。
- PDF 是主要預覽格式；非 PDF 檔案以下載與發布追溯為主。
- 檔案必須通過大小與副檔名驗證後才能儲存。
- 系統必須記錄每個檔案的 SHA256、檔案大小、原始檔名與本地 repository 路徑。
- DB 與 repository 必須保持一致；缺檔、orphan files 或 hash mismatch 都視為 QC 失敗。
- Google Drive release 必須完整成功，或在部分搬移失敗時補償回復。

## 5. 審核規則

- Engineer 可建立送審，但不可 approve 或 reject。
- R&D Manager 與 Admin 可依角色權限 approve 或 reject。
- `approval_required=1` 代表任一位有權限審核者核准後即可發布。
- `approval_required=2` 代表兩位不同審核者都必須核准後才可發布。
- 同一位審核者不可在同一筆 two-reviewer submission 中重複核准兩次。
- 若任一審核者 reject，該筆 submission 應轉為 Rejected，不再進入發布流程。
- 正式上線前，公司需確認預設採用 `approval_required=1` 或 `approval_required=2`。

## 6. 發布與 Released 同名檔案規則

- Pending submission 可被核准並進入發布流程。
- Released、Rejected 或 Obsolete submission 不可再次 approve。
- Release failure 必須記錄為 `ReleaseFailed`，並保留錯誤代碼與錯誤訊息供 QC 追查。
- 成功 Released 新 revision 後，同一 item 的舊 Released revision 會自動轉為 `Obsolete`，並記錄被哪個新版取代。
- Released duplicate filename policy：不同 item 的 Released 同名檔案仍採用「禁止發布並回錯誤」。
- 同一 item 進版時可沿用相同檔名；新版 Released 成功後舊版會轉為 Obsolete，不視為跨 item 同名衝突。
- 若 Google Drive Released 區已存在不同 item 的同名檔案，系統必須 blocked the release，回傳明確錯誤，不可覆蓋既有 Released 檔案。
- 自動刪除舊檔與覆蓋檔案不屬於 MVP 規則；Obsolete 舊檔必須保留稽核紀錄、檔案 hash 與 release package。

## 7. AI 助手使用限制

- AI assistant is read-only。
- AI 可查詢 pending reviews、dashboard metrics、submission detail、file metadata 與 PDM rules。
- AI 不可 approve、reject、delete、revise、release、publish 或修改任何 PDM record。
- AI 回答管理辦法時必須引用政策資料來源，例如 `docs/pdm-management-policy-draft.md`。
- 若政策文件與程式行為不一致，需優先視為 RD/QC 缺陷處理，不可只修改 AI 回答掩蓋差異。

## 8. 目前仍需管理層確認的 P0 項目

- 正式圖號格式與是否需強制格式驗證。
- 正式料號格式與 item master 管理責任。
- 正式版次格式與是否由系統自動產生。
- 預設審核模式：`approval_required=1` 或 `approval_required=2`。
- Released 同名檔案長期策略：維持禁止、改成封存舊檔，或允許受控版本覆蓋。
