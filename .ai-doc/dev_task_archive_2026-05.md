# AI PDM 開發任務清單

日期：2026-05-27
定位：高效開發型 PDM，不追求大型 PLM 的嚴格流程，優先降低找檔、錯版、漏檔、重工與製造交接成本。

狀態說明：

- `[x]` 已完成
- `[/]` 部分完成 / 待外部實測
- `[ ]` 未完成 / 待執行
- `P0` 直接影響可用性或正式上線
- `P1` 核心效率功能
- `P2` 改善項或後續擴充

本輪規劃調用的思考習慣：

- #找對問題RightProblem：目前瓶頸不是更多簽核，而是減少錯版、漏檔、找檔與重工。
- #來源品質SourceQuality：參考 SOLIDWORKS PDM、Autodesk Vault、Siemens PDM/Teamcenter、PTC Windchill、OpenBOM、Onshape、Aras、Sibe PDM 等公開功能。
- #系統思考SystemsThinking：把 SolidWorks、Web、檔案庫、BOM、發布包、AI 與備份視為一條工程資料流。
- #條件限制ConstraintSatisfaction：維持 MVP 快速落地，不引入過重流程。
- #設計思考DesignThinking：以工程師每日操作效率為優先。
- #風險緩解RiskMitigation：避免 CAD 端高權限憑證、錯誤發布與無法追溯。

## 1. 已完成內容壓縮摘要

以下原本已完成的細項已壓縮，詳細歷史可查各 `docs/rd-*.md`、`docs/qc-*.md` 報告與原始程式碼。

- [x] `P1` 文件與規劃：已建立系統設計、QA/QC 計畫、RD 報告、正式 PDM 管理辦法草案、README 與本任務追蹤文件。
- [x] `P1` Web / Backend MVP：已完成 Next.js / React 後台、SQLite schema、本地 repository、送審/清單/明細/核准/駁回 API、設定頁、PDF preview/download、demo seed、smoke 與 API regression。
- [x] `P0` 資料一致性：已完成圖號+版次唯一、料號唯一、status constraint、submission files metadata、audit log、approval steps、two-reviewer workflow、item revision history、duplicate 不產生 orphan file。
- [x] `P1` AI 助手：已完成 Web AI 對話框、手機入口、local deterministic helper、LLM provider 設定、tool whitelist、來源引用、submission context、PDM 規則 RAG 與防止 AI 核准/駁回/刪除/改版。
- [x] `P1` 登入與權限：已完成本地 scrypt 帳號、session cookie、Bearer token、Engineer / R&D Manager / Admin 角色、API role guard、UI 權限隱藏、登入與操作 audit log。
- [x] `P0` Google Drive 整合：已完成 Pending upload、Released folder 設定、gdrive file id 保存、上傳狀態、失敗補償、PDF Drive viewer embed。
- [x] `P0` Release 流程：已完成 `PDM_RELEASE_MODE` guard、local stub、ReleaseFailed、retry、Released 同名檔案阻擋、本地 Google Drive move、PDF/DWG/SW source metadata 寫入基礎。
- [x] `P1` SolidWorks Add-in 程式基礎：已完成 C#/.NET Framework 4.8 WPF 專案、`ISwAddin` 入口、登入、DPAPI token、屬性讀取、PDF/DWG 背景匯出、送審表單、multipart upload、設定與日誌。
- [x] `P1` 檔案管理：已完成檔名 sanitize、SHA256、file size、type whitelist、PDF preview、download 權限、hash verification。
- [x] `P1` 備份與還原工具：已完成本地快照、checksum、restore drill、retention drill、handoff package、restore report template、Task Scheduler 腳本。
- [x] `P1` QC 自動化：已完成 lint、build、audit、smoke、API regression、UI E2E、Google Drive、release failure、policy alignment、defect zero、production readiness、field-test preflight 與 CI workflow。
- [x] `P1` Windows / Web 檔案送審入口：已完成 `/upload`、拖拉/選檔、sidecar metadata 偵測、檔名推測、共用 `POST /api/submissions`。

## 2. 目前仍需關注的未完成 / 部分完成項

- [/] `P0` SolidWorks Add-in 實機驗證：Release x64 build 已可用，仍需在真實 CAD 電腦完成系統管理員 COM 註冊、SolidWorks UI 測試、真實 `.sldprt/.sldasm/.slddrw` 端到端送審。
  - 阻塞：2026-05-27 QC `qc:production-readiness:report` 顯示 SW report `20260525-131542` 仍為 `draft/not_ready`，42 cases / 0 pass；缺 tester、testDate、backendUrl、testAccount、testMachineType、addinBuildPath、.NET 4.8 evidence、signoff 與 required cases pass。
- [/] `P0` 離線單向備份與還原：本地自動化與交接包已完成，仍需獨立測試機實測並回填 QC 報告。
  - 阻塞：2026-05-27 QC `qc:production-readiness:report` 顯示 restore report `20260525-144844` 仍為 `draft/not_ready`，12 cases / 0 pass；缺 tester、testDate、testMachineName、windowsVersion、node/npm version、snapshot/handoff/targetDir、signoff 與 required cases pass。
- [ ] `P0` SolidWorks Document Manager API 或等效授權元件：讓 Web/Windows 上傳可直接讀取 `.sldprt/.sldasm/.slddrw` 自訂屬性，不再依賴 sidecar 或檔名推測。
  - 阻塞：2026-05-27 QC `qc:document-manager-report:report` 顯示 report `20260527-145712` 仍為 `draft/not_ready`，缺 license owner、deployment host、extractor command/probe path、sample files、signoff 與 required cases pass。
  - 證據：`docs/qc-remaining-external-blockers-report-2026-05-27.md`。
- [x] `P0` CAD reference 資料表與可替換 extraction adapter 已建立；目前尚未接入 SolidWorks Document Manager 授權元件。
- [x] `P0` 全站快速搜尋 API/UI 已建立，可搜尋圖號、料號、品名、版次、材質、狀態、檔名、提交者，並套用 Engineer 權限範圍。
- [x] `P0` 進版與舊版廢止：維持手動輸入 revision，新版 Released 成功後自動將同一料號舊 Released 版轉為 Obsolete，避免找圖與製造交接拿到舊版。
- [ ] `P1` 正式現場測試：使用 `npm.cmd run field-test:preflight -- --profile all`、`field-test:handoff` 與實機報告完成最後閉環。
  - 進度：`field-test:handoff` 已納入 restore、SolidWorks Add-in、Document Manager/equivalent extractor 三份證據報告、extractor probe、probe path gate、`field-test:preflight -- --profile all --require-evidence`、`qa:dev-task:sync` 與 final QC gate；仍待實機執行與簽核報告。
  - 阻塞：2026-05-27 QC `field-test:preflight -- --profile all --require-evidence` 結果 `ready=false`，19 pass / 3 fail / 1 warning；CAD evidence、restore evidence、Document Manager evidence 仍 not ready。

## 3. 市面 PDM 功能檢索結論

市面 PDM/PLM 常見功能：

- 中央檔案庫、版本與版次控管。
- Check-in / Check-out，避免多人同時改同一檔。
- CAD 關聯管理：零件、組立、工程圖之間的引用關係。
- BOM 物料清單管理與 BOM diff。
- 變更管理：ECR / ECO / Change Order。
- PDF / 3D 預覽、Markup、留言與審核討論。
- 搜尋、設計重用、duplicate search。
- 發布包與製造交接。
- 權限、稽核、通知。
- ERP / 採購 / 供應商整合。

本系統下一階段不建議直接追求完整 ECO/PLM，而是採「高效率、低流程負擔」方向：先把 CAD 關聯、搜尋重用、BOM、Where-used、發布包與 AI 摘要做好。

參考來源：

- SOLIDWORKS PDM：https://www.solidworks.com/product/solidworks-pdm
- Autodesk Vault：https://www.autodesk.com/products/vault/features
- Siemens PDM：https://www.siemens.com/en-us/technology/product-data-management-pdm/
- PTC Windchill：https://www.ptc.com/es/products/windchill
- OpenBOM：https://help.openbom.com/get-started/openbom-basics/
- Onshape Branch / Merge：https://www.onshape.com/en/features/branch-merge-cad
- Aras Change Management：https://www.aras.com/community/documentationlibrary/Innovator/32/Content/Innovator%2024%20Docs/Aras%20PE%2014%20-%20User%27s%20Guide/Change%20Management.htm
- Sibe PDM：https://www.sibe.io/cloud-pdm-options/pdm-built-for-solidworks

## 4. 下一輪高效開發 Roadmap

### 4.0 Phase UI：找圖主視覺重構

- [x] `P0` Dashboard 首屏改成「找圖」主視覺。
  - 目標：首頁第一視覺從審核/通知改成大型搜尋入口。
  - 內容：大型搜尋框置頂，支援圖號、料號、品名、檔名、材質、版次、狀態、提交者關鍵字。
  - 驗收：進入首頁不用先選 Pending，即可直接搜尋或瀏覽圖面資料。
  - 已完成：Dashboard 首屏標題改為 `PDM 圖面資料庫`，大型搜尋框置頂；QC 見 `docs/qc-dashboard-find-first-validation-report-2026-05-27.md`。
- [x] `P0` Dashboard 預設資料視角從 `Pending` 改成 `All` 或圖面資料庫。
  - 目標：符合日常 90% 找圖/查圖流程，審核不再主導預設畫面。
  - 內容：預設顯示全部可見圖面；狀態 filter 保留但不是第一主軸。
  - 驗收：登入後可直接看到可查詢的圖面資料，而非只看到待審核清單。
  - 已完成：Dashboard 預設 status 改為 `All`，狀態 filter 保留。
- [x] `P0` 搜尋結果表格改為找圖導向欄位。
  - 欄位：圖號、料號、品名、版次、狀態、檔案狀態、最近更新、操作。
  - 檔案狀態至少顯示是否有 PDF、DWG、SolidWorks source、Release package。
  - 驗收：使用者可從列表快速判斷是否找到正確圖面與可下載資料。
  - 已完成：清單欄位已改為找圖導向，並顯示 PDF/DWG/SW/Package 可用性。
- [x] `P0` 通知摘要降級為待辦側欄或小型 badge。
  - 目標：通知只占輔助視覺，不再壓過找圖入口。
  - 內容：顯示待審核、Release 失敗、Checkout、缺 package 等數量；點擊後再展開清單。
  - 驗收：首頁主要視覺仍是搜尋與圖面資料表。
  - 已完成：通知區改為 compact notification area，最多顯示六筆，不再位於搜尋主視覺之前。
- [x] `P1` 圖面明細重排為「圖面資訊 / 檔案 / 版本 / BOM / Where-used」優先。
  - 目標：查圖時先看到圖面與檔案，不先看到審核區塊。
  - 內容：第一區顯示圖號、料號、品名、版次、狀態；第二區顯示預覽/下載；審核、問題、討論、AI 風險下移。
  - 驗收：點開搜尋結果後，三秒內可取得圖面資訊與主要檔案入口。
  - 已完成：明細標題改為 `圖面明細`，檔案、版次紀錄、BOM、BOM diff、Where-used、CAD reference 視覺排序高於 checkout/討論/issue/審核；QC 見 `docs/qc-dashboard-detail-priority-validation-report-2026-05-27.md`。
- [x] `P1` 新增找圖快速入口。
  - 內容：最近開啟、最近發布、我建立的、Checkout 中、Release 失敗、缺 PDF/DWG/Release package。
  - 驗收：常見找圖情境不需手動輸入完整搜尋字串。
  - 已完成：Dashboard 新增全部圖面、最近發布、我建立的、Checkout 中、缺交接檔、Release 失敗 quick chips；QC 見 `docs/qc-dashboard-quick-access-validation-report-2026-05-27.md`。
- [x] `P1` 搜尋結果支援最近搜尋與最近瀏覽。
  - 目標：工程師能快速回到剛查過的圖面。
  - 驗收：重新整理頁面後仍可看到最近搜尋/最近瀏覽紀錄。
  - 已完成：最近搜尋與最近瀏覽寫入 browser localStorage，各保留六筆，點擊可回填搜尋或開啟圖面。
- [x] `P2` 搜尋框支援 autocomplete / suggestion。
  - 內容：輸入部分圖號、料號或品名時提示候選項。
  - 驗收：可用鍵盤選擇建議並開啟結果。
  - 已完成：主搜尋框輸入時顯示候選圖面，點擊 suggestion 會回填圖號並開啟明細；QC 見 `docs/qc-dashboard-search-assist-validation-report-2026-05-27.md`。
- [x] `P2` 建立常用料號/圖面收藏。
  - 目標：讓高頻圖面可一鍵返回。
  - 驗收：使用者可收藏/取消收藏，首頁可快速開啟收藏圖面。
  - 已完成：搜尋結果列加入收藏星號，常用圖面保存於 browser localStorage 並顯示在 quick access。

### 4.1 Phase A：CAD 自動解析與搜尋重用

- [ ] `P0` 整合 SolidWorks Document Manager API 或等效讀取元件。
  - 進度：metadata/reference 都已有可替換外部 adapter、本機 regression、外部 command contract 驗證、extractor probe 與 schema v2 證據模板；仍待正式 Document Manager 或等效讀取器部署證據。
  - 阻塞：2026-05-27 QC path gate 已 PASS，但正式 extractor/report 尚未 ready；需取得授權元件、部署命令、sample CAD files 與簽核後才能完成整合驗收。
  - 目標：直接讀 `.sldprt/.sldasm/.slddrw` 的 custom properties。
  - 產出：`drawing_number`、`part_number`、`part_name`、`revision`、`material`、`surface_finish`、`document_type` 自動填入。
  - 驗收：沒有 sidecar 時，Web/Windows upload 仍可正確帶出屬性。
- [x] `P0` 建立 CAD reference extraction 架構。
  - 目標：讀出 assembly 使用哪些 part/sub-assembly，drawing 對應哪些 model。
  - 產出：新增 `file_references` 資料表與 `src/lib/cad-extraction.ts` adapter。
  - 現況：資料層與 UI 已完成；實際 SolidWorks 內部引用需等 Document Manager 授權元件接入。
- [x] `P0` 建立全站快速搜尋。
  - 搜尋範圍：圖號、料號、品名、版次、材質、表面處理、文件名、提交者、狀態。
  - 目標：讓工程師先找舊圖與相似零件，再決定是否新建。
  - 驗收：搜尋結果可直接開啟 submission、item history、檔案預覽；API regression 已覆蓋搜尋權限。
- [x] `P1` 建立「設計重用候選」提示。
  - 依料號、品名關鍵字、材質、表面處理、檔名相似度推薦既有設計。
  - 先用資料庫查詢，不先做複雜 AI 幾何比對。
  - 已完成：`/api/submissions/[id]/reuse-candidates`、Dashboard `Design reuse candidates`、metadata score/reasons/matched files、Engineer/Manager 權限範圍、API regression `REUSE-001` 至 `REUSE-010`，QC 報告見 `docs/qc-design-reuse-candidates-validation-report-2026-05-27.md`。

### 4.2 Phase B：輕量協作與發布包

- [x] `P0` 建立輕量 Check-out / 編輯預約。
  - 目標：不是完整 PDM vault lock，而是標記「誰正在改這個圖號/料號」。
  - 已完成：`item_locks`、checkout API、Dashboard 預約卡、衝突回應、逾期自動釋放、audit log、API regression。
  - 限制：目前是 Web item-level reservation，尚未做到 SolidWorks Add-in 送審前攔截或作業系統檔案鎖。
- [x] `P0` 建立自動 Release package。
  - 已完成：核准後產生 ZIP，內含送審檔案、`manifest.json`、檔案 SHA256、approval log、release result。
  - 目標：讓製造/採購拿到一包完整正式資料，不用人工找檔。
  - 驗收：Released submission 明細頁可下載 release package；API regression 已覆蓋 metadata、權限、ZIP signature、manifest。
- [x] `P1` 建立製造交接頁。
  - 已完成：`/handoff` 唯讀頁、`/api/handoff`、CSV 匯出與列印模式，顯示每個料號最新 Released 版本、package、變更原因、檔案清單、hash、發布時間、核准者。
  - 限制：尚未做供應商入口與外部分享權限。
- [x] `P1` 建立通知摘要。
  - 事件：送審、核准、駁回、ReleaseFailed、Check-out 衝突。
  - 已完成：`/api/notifications`、Dashboard 通知摘要、角色範圍控管、ReleaseFailed / 待審 / 等待審核 / Google Drive 上傳失敗 / Released 缺 package / active checkout lock 提醒、API regression。
  - 初版先做 Web UI notification，不急著串 Email/LINE/Teams。

### 4.2.1 Phase B2：進版與舊版廢止

- [x] `P0` DEV-REV-001：建立 Obsolete lifecycle 資料模型。
  - 決策：revision 維持手動輸入，不做自動產生或版次大小判斷。
  - 內容：`SubmissionStatus` 新增 `Obsolete`；SQLite schema、Postgres schema、DB 初始化相容邏輯與 TypeScript 型別同步。
  - 欄位：新增 `superseded_by_submission_id`、`obsolete_at`、`obsolete_by`，用來追溯舊版由哪個新版廢止。
  - 驗收：舊資料可啟動；新資料可保存 `Obsolete`；revision history 可讀到取代關係。
- [x] `P0` DEV-REV-002：修正目前有效版次更新規則。
  - 目標：`items.current_revision` 只代表目前有效 Released 版，不代表最新 Pending 送審。
  - 內容：建立送審時不得提前覆寫 `current_revision`；新版成功 Released 後才更新 item current revision。
  - 驗收：Rev B Pending / Rejected / ReleaseFailed 時，Rev A 仍是目前有效版；Rev B Released 後才改為 B。
- [x] `P0` DEV-REV-003：發布成功後自動廢止舊版。
  - 觸發：只在 release package 與 release move 都成功、submission 狀態準備轉 `Released` 時執行。
  - 內容：同一 `item_id` 下其他 `Released` submission 轉為 `Obsolete`，寫入 superseded 欄位並建立 audit log。
  - 保護：新版 `Rejected`、`ReleaseFailed`、仍在 `Pending/Releasing` 時不廢止舊版。
  - 驗收：同一 item 同時間只有一筆有效 `Released`；舊版保留檔案、hash、package 與審核紀錄。
- [x] `P0` DEV-REV-004：定義 Obsolete 版使用邊界。
  - 內部：Dashboard、revision history、檔案下載、release package 下載仍可查詢與追溯。
  - 外部：新增 readonly share、supplier portal、procurement sync 不允許使用 `Obsolete`。
  - 交接：`/handoff`、handoff export、procurement releases API 只輸出有效 `Released`。
  - 驗收：製造/採購預設只看到最新版；內部仍可下載舊版 package 做稽核。
- [x] `P1` DEV-REV-005：Dashboard 與搜尋呈現 Obsolete。
  - 內容：狀態 filter、badge、明細頁、revision history 加入 `Obsolete/已廢止` 顯示。
  - 找圖整合：搜尋結果可看見舊版狀態，但預設操作引導使用有效 Released 版。
  - 驗收：使用者搜尋到舊圖時能清楚知道「已廢止」及被哪個新版取代。
- [x] `P1` DEV-REV-006：政策文件、AI 摘要與 QC regression 更新。
  - 內容：更新 PDM 管理辦法、system design、AI policy RAG 中的版次/廢止規則。
  - QC：新增 release A/B lifecycle regression、handoff/procurement/share 邊界測試、UI status smoke。
  - 驗收：`npm run lint`、`npm run build`、`npm run qc:api`、`npm run qc:ui` 通過或產出明確阻擋報告。

### 4.3 Phase C：BOM 與 Where-used

- [x] `P1` 建立 BOM 資料模型。
  - 建議資料表：`bom_headers`、`bom_lines`。
  - 欄位：parent item、child part number、child revision、quantity、source file、created from submission。
  - 已完成：`bom_headers`、`bom_lines`、`/api/submissions/[id]/bom`、由 assembly reference materialize BOM draft、Dashboard detail 顯示已建立 BOM、API regression `BOM-001` 到 `BOM-009`。
  - 初版先從 assembly reference 計算，不要求完整製造 BOM。
- [x] `P1` 建立 BOM 自動產生。
  - 已完成：送審 API 接收 `cad_references_json`、寫入 `file_references`、assembly component reference 會自動建立 Engineering BOM draft，submission detail 與 `/api/submissions/[id]/bom` 可讀。
  - 驗收：API regression `BOM-010` 到 `BOM-013` 通過；submission 明細可看到已產生的單階 BOM。
- [x] `P1` 建立 BOM diff。
  - 比較同一料號/圖號不同 revision 的新增、刪除、數量變化、版次變化。
  - 驗收：主管審核前可看到「這版到底改了哪些零件」。
  - 已完成：`/api/submissions/[id]/bom/diff`、預設前版比較、指定 `baseSubmissionId` 比較、Dashboard BOM diff 摘要、API regression `BOMDIFF-001` 到 `BOMDIFF-013`。
- [x] `P1` 建立 Where-used 反查。
  - 修改某零件前，顯示此零件被哪些組立、圖面、Released package 使用。
  - 驗收：item detail 頁可列出所有上層 assemblies 與狀態。
  - 已完成：`/api/items/[partNumber]/where-used`、Dashboard Where-used 區塊、Engineer 權限範圍、Manager 可視範圍、unused empty result、API regression `WHEREUSED-001` 到 `WHEREUSED-011`。
- [x] `P2` BOM 匯出 Excel / CSV。
  - 先支援採購與製造可讀格式，不直接做 ERP 整合。
  - 已完成：`/api/submissions/[id]/bom/export?format=csv|xls`、Dashboard BOM CSV/Excel 下載、Engineer/Manager 權限範圍、missing BOM 404、UTF-8 BOM CSV、Excel-compatible XML，API regression `BOMEXPORT-001` 至 `BOMEXPORT-010`。

### 4.4 Phase D：審核討論、Markup 與 AI 摘要

- [x] `P1` 建立 submission/file 討論串。
  - 目標：把審核意見綁在正確 submission、file、revision 上，不散落在 LINE/Email。
  - 初版只做文字留言與解決狀態。
  - 已完成：`discussion_comments`、submission/file comment、resolved 狀態、Dashboard Discussion 區塊、API regression `DISCUSS-001` 到 `DISCUSS-014`。
- [x] `P1` 建立審核問題清單。
  - 欄位：問題描述、對應檔案、提出者、負責者、狀態、解決說明。
  - 目標：讓駁回與修正有追蹤，不需要完整 ECO。
  - 已完成：`review_issues`、submission/file issue、assignee、resolved 狀態與 resolution、Dashboard Review issues 區塊、API regression `ISSUE-001` 到 `ISSUE-013`。
- [x] `P1` 建立 AI 送審摘要。
  - 自動摘要：變更原因、檔案清單、歷史 revision、BOM diff、Where-used 影響、缺漏檔案。
  - 驗收：主管打開 submission 時先看到一段可追溯來源的 AI 摘要。
  - 已完成：`/api/submissions/[id]/ai-summary`、Dashboard AI review summary、來源追溯、缺漏 PDF/DWG 提示、API regression `SUMMARY-001` 到 `SUMMARY-012`。
- [x] `P1` 建立 AI 風險提示。
  - 提醒：缺 PDF/DWG、同料號已有新 revision、修改零件被多個組立使用、Released filename 可能衝突。
  - AI 僅提示，不可自動核准或改資料。
  - 已完成：`/api/submissions/[id]/ai-risks`、Dashboard AI risk hints、缺 PDF/DWG、較新版次、多上層 Where-used、Released 同名檔衝突提示、API regression `RISK-001` 到 `RISK-011`。
- [x] `P2` PDF Markup。
  - 初版可先做外部 PDF 預覽 + 文字留言；真正畫線/框選留到後續。
  - 已完成：`pdf_markups` schema、`/api/submissions/[id]/pdf-markups`、`/api/submissions/[id]/pdf-markups/[markupId]`、Dashboard PDF markups、PDF-only/page/coordinate validation、resolved evidence、Engineer/Manager 權限範圍，API regression `MARKUP-001` 至 `MARKUP-012`。

### 4.5 Phase E：後續擴充但暫不優先

- [x] `P2` 供應商/採購唯讀分享。
  - 前提：Release package 與製造交接頁穩定後再做。
- [x] `P2` ERP / 採購系統 API 預留。
  - 前提：BOM schema 穩定後再做，不先綁死。
- [x] `P2` Duplicate geometry search。
  - 可參考 Autodesk Vault duplicate search，但 SolidWorks 幾何相似度成本較高，先用 metadata/filename/material 搜尋替代。
- [x] `P2` Sandbox / 試作分支。
  - 取代 Onshape branch/merge 的輕量做法：允許複製 submission 做試作，不影響 Released 主線。
- [x] `P2` 完整 ECR/ECO/ECN。
  - 目前不優先，避免流程過重。若未來久方生技法規追溯需求提高，再升級。

## 5. 不建議現階段投入的功能

- [x] `P2` 大型 PLM phase-gate 流程。
  - 原因：對目前目標太重，會拖慢工程師。
- [x] `P2` 複雜多層簽核矩陣。
  - 原因：目前 two-reviewer 已足夠，下一步應先補 BOM/Where-used。
- [x] `P2` 完整供應商入口。
  - 原因：Release package 與唯讀分享穩定後再做。
- [x] `P2` 完整 ERP / 庫存 / 採購閉環。
  - 原因：先做 BOM 匯出，等資料品質穩定後再串。
- [x] `P2` CAD branch / merge。
  - 原因：SolidWorks 檔案型架構實作成本高，先用 sandbox submission 與版本追蹤替代。

## 6. 建議下一個 Sprint 排程

### Sprint 1：進版/廢止 + 找圖主視覺

- [x] `P0` DEV-REV-001 建立 Obsolete lifecycle 資料模型。
- [x] `P0` DEV-REV-002 修正 `items.current_revision` 只代表有效 Released 版。
- [x] `P0` DEV-REV-003 新版 Released 成功後自動廢止舊 Released 版。
- [x] `P0` DEV-REV-004 Obsolete 版內部可追溯、外部分享/交接/採購預設排除。
- [x] `P1` DEV-REV-005 Dashboard/Search 顯示 Obsolete 與取代關係。
- [x] `P1` DEV-REV-006 更新政策文件、AI RAG 與 QC regression。
- [ ] `P0` 確認 SolidWorks Document Manager 授權與可部署方式。
  - 進度：已建立 `document-manager:report:new` / `document-manager:report:upgrade` / `document-manager:extractor:probe` / `qc:document-manager-probe-path-gate` / `qc:document-manager-report` / `qa:dev-task:sync` 證據門檻，且 production readiness 已納入 Document Manager/field-test blocker；待正式授權元件與現場回填報告。
  - 阻塞：2026-05-27 QC 確認授權/部署欄位仍未填，Document Manager report 不可視為 ready；保留未勾選。
- [x] `P0` 建立 metadata extraction adapter。
- [x] `P0` 建立 reference extraction adapter。
- [x] `P0` 新增 reference 資料表與 migration。
- [x] `P0` Web/Windows upload 改成優先使用 CAD 內部屬性。
- [x] `P1` 建立全站搜尋 UI 與 API。
- [x] `P0` Dashboard 改為找圖主視覺：大型搜尋框、圖面資料庫預設視角、找圖導向表格。
  - 已完成：`src/components/dashboard.tsx`、`src/app/globals.css`、`scripts/qc-dashboard-find-first-test.mjs`；QC `npm.cmd run qc:dashboard-find-first` 23/23 PASS。
- [x] `P0` 通知摘要降級為待辦側欄或小型 badge。
  - 已完成：通知摘要 compact 化並限制顯示六筆，保留點擊開啟通知目標。
- [x] `P1` 圖面明細重排，檔案、版本、BOM、Where-used 優先於審核。
  - 已完成：`src/app/globals.css` detail order、`src/components/dashboard.tsx` 明細文案與檔案區 label、`scripts/qc-dashboard-detail-priority-test.mjs`；QC 12/12 PASS。
- [x] `P1` 新增最近開啟、最近發布、我建立的、Checkout 中、缺檔等快速入口。
  - 已完成：`src/components/dashboard.tsx` quick access/recent localStorage、`src/lib/db.ts` summary `has_active_lock`、`scripts/qc-dashboard-quick-access-test.mjs`；QC 16/16 PASS，API regression 391/391 PASS。
- [x] `P2` 搜尋 autocomplete 與常用圖面收藏。
  - 已完成：`src/components/dashboard.tsx` search suggestions/favorites、`src/app/globals.css` suggestion/favorite styling、`scripts/qc-dashboard-search-assist-test.mjs`；QC 10/10 PASS。

### Sprint 2：Check-out + Release package

- [x] `P0` 建立 light checkout lock schema/API/UI。
  - [x] `P0` Add-in 送審前查詢圖號/料號是否被預約。
  - [x] `P0` 核准後產生 release package ZIP。
  - [x] `P1` Released 明細頁加入 package download。
  - [x] `P1` 製造交接頁初版。
  - [x] `P1` Dashboard 通知摘要與 `/api/notifications`。

### Sprint 3：BOM + Where-used

- [x] `P1` 建立 BOM schema。
- [x] `P1` 由 assembly references 產生 BOM 草稿。
- [x] `P1` BOM diff API/UI。
- [x] `P1` Where-used API/UI。
- [x] `P1` AI 摘要串接 BOM diff 與 Where-used。
  - 已完成：AI `get_submission_detail` 摘要串接 Engineering BOM、BOM diff、Where-used 影響與缺 PDF/DWG 提示，並回傳 BOM/Where-used 可追溯來源；API regression `AI-022` 到 `AI-026` 通過。

## 7. 操作頓挫感效能優化待辦

### 現況量測基準

- 首頁初載到 network idle 約 `17.3s`。
- `/api/submissions` 一次回傳約 `1.49MB`。
- 首頁一次渲染約 `1927` 筆表格列，DOM 約 `35,223` 個節點。
- 初載自動選第一筆後，明細連續觸發 `18+` 個 API。
- 搜尋 `QC-REL-A-023067` 過程產生約 `35` 個 API 請求。
- 搜尋輸入時會重抓 `/api/notifications`，且舊明細 API 未取消，會造成畫面閃動與回寫競態。

### P0：立即降低頓挫感

- [ ] `P0` DEV-PERF-001：搜尋輸入 debounce 與短字元保護。
  - RD：搜尋框輸入延遲 `250-300ms` 後才觸發查詢；少於 2 字不重載完整 `/api/submissions`。
  - QA：驗證快速輸入圖號時 API 數量明顯下降，且搜尋結果仍正確。
  - QC：以瀏覽器實測輸入完整圖號，確認搜尋期間不產生每字一次的 `/api/search` 暴增。

- [ ] `P0` DEV-PERF-002：拆離通知請求與搜尋/狀態查詢。
  - RD：`loadNotifications()` 不再跟著 `searchQuery/status` 每次變更執行；改為登入後、手動重新整理、打開通知或固定低頻輪詢才更新。
  - QA：驗證搜尋、狀態切換、漏斗篩選時不會重複打 `/api/notifications`。
  - QC：瀏覽器 network log 確認搜尋一輪期間通知 API 不被重複觸發。

- [ ] `P0` DEV-PERF-003：明細載入加入取消與競態保護。
  - RD：`loadDetail()` 使用 `AbortController` 或 request id guard；切換圖面、搜尋、篩選時舊請求不得回寫新畫面。
  - QA：驗證快速連點不同圖面時，右側明細最後只顯示最後一次選取的圖面。
  - QC：用快速連點與搜尋切換測試，確認無舊明細覆蓋、無 console error。

- [ ] `P0` DEV-PERF-004：明細載入分層。
  - RD：第一層只載入 `/api/submissions/:id` 並立即顯示圖面明細；AI 摘要、風險、reuse、討論、issue、phase gate、分享、採購同步等改為平行載入或展開區塊時 lazy load。
  - QA：驗證點選圖面後主明細可快速出現，次要區塊可顯示 loading 狀態且不阻塞主明細。
  - QC：量測點選圖面到主明細出現時間，並確認次要 API 不再序列化等待。

- [ ] `P0` DEV-PERF-005：合併明細 state 更新，降低重渲染。
  - RD：將明細相關多個 `setXxx()` 改為 reducer 或集中更新；避免每個子 API 回來都造成整個 Dashboard 重渲染。
  - QA：驗證明細、BOM、Where-used、討論、issue、AI 區塊資料仍正確。
  - QC：用 React Profiler 或瀏覽器 performance 量測，確認點選圖面時 commit 次數下降。

### P1：資料量與清單渲染優化

- [ ] `P1` DEV-PERF-006：圖面清單分頁或 cursor 載入。
  - RD：`/api/submissions` 預設 `limit=100`，支援下一頁或 infinite scroll；保留 status/search 權限範圍。
  - QA：驗證全部圖面、狀態切換、搜尋、權限範圍、空結果與下一頁載入。
  - QC：確認首頁不再一次回傳全部 1900+ 筆資料，payload 明顯下降。

- [ ] `P1` DEV-PERF-007：表格列虛擬化或可視範圍渲染。
  - RD：清單只渲染可視範圍列，滾動時補渲染；避免一次建立數萬 DOM 節點。
  - QA：驗證滾動、選取、收藏、狀態 badge、檔案狀態、最近瀏覽仍正常。
  - QC：確認首頁 DOM 節點數大幅下降，滾動無明顯卡頓。

- [ ] `P1` DEV-PERF-008：搜尋與清單查詢索引化。
  - RD：補上 `submissions(status, created_at)`、`submissions(created_at)`、`submissions(submitted_by, created_at)` 等索引；評估 SQLite FTS 或搜尋專用表。
  - QA：驗證 migration 可重複套用，既有資料查詢結果不變。
  - QC：以同一組搜尋關鍵字比對查詢耗時與結果一致性。

- [ ] `P1` DEV-PERF-009：清單 API 只回傳摘要欄位。
  - RD：找圖清單只回傳表格必要欄位；BOM、AI、討論、issue、release package detail 留給明細 API。
  - QA：驗證清單 UI 所需欄位完整，明細資料不受影響。
  - QC：確認 `/api/submissions` response size 降低且 UI 無缺欄。

### P2：互動手感與結構整理

- [ ] `P2` DEV-PERF-010：點選圖面立即回饋與 skeleton。
  - RD：點選 row 後立即更新選取狀態，右側保留前一筆或顯示 skeleton，不整塊空白閃爍。
  - QA：驗證慢速網路下使用者仍看得出目前選取與載入狀態。
  - QC：用 network throttling 或人工延遲確認無空白頓挫。

- [ ] `P2` DEV-PERF-011：搜尋/篩選清單更新導入 `useTransition`。
  - RD：大量清單更新使用 transition，保持輸入框與按鈕回饋優先。
  - QA：驗證快速打字、刪字、狀態切換、漏斗 checkbox 操作不卡住。
  - QC：瀏覽器實測連續輸入與快速切換篩選，確認互動回饋穩定。

- [ ] `P2` DEV-PERF-012：拆分 Dashboard 巨型元件。
  - RD：將 `src/components/dashboard.tsx` 拆成 `FinderToolbar`、`SubmissionTable`、`SubmissionDetailPanel`、`NotificationDropdown`、`AssistantPanel` 等元件。
  - QA：驗證拆分後行為與資料流不變。
  - QC：跑 lint、tsc、既有 dashboard QC scripts，並做主要路徑瀏覽器驗證。

- [ ] `P2` DEV-PERF-013：表格列 memo 化。
  - RD：抽出 `SubmissionRow` 並使用 `React.memo`；避免通知、右側明細、聊天區更新時重畫整張表。
  - QA：驗證 row 選取、收藏、點擊開明細、狀態樣式都正常。
  - QC：Profiler 或互動量測確認非清單狀態更新時 row rerender 減少。

## 8. 驗收原則

- 每個新功能都要優先回答「是否減少工程師時間浪費」。
- 不新增工程師每天都不想填的欄位。
- 不讓 AI 或自動化流程擁有核准、刪除、覆蓋 Released 的權限。
- 每個 Released 結果必須可追溯：誰送審、誰核准、哪些檔案、哪個 hash、哪個 package。
- 每個 Obsolete 結果必須可追溯：由哪個新版取代、何時廢止、誰觸發發布、舊檔案與 package 不刪除。
- 每個 P0/P1 都要有最低限度 regression test 或實機驗證紀錄。
