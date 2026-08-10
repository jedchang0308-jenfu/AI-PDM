# AI_PDM Cold Start

用途：讓下一輪 AI 先用低 token 成本理解目前交付邊界，再依選定 DEV 讀直接相關文件。

## Active Repo

- Active repo：`C:\VIBE CODING\AI_PDM`
- 文件中心：`.ai-doc`
- 不要預設讀取整個 `.ai-doc/specs`、`.ai-doc/qa`、`.ai-doc/qc`、`.ai-doc/reports` 或 `.ai-doc/archived`。

## Progressive Read Order

1. 先讀本檔。
2. 再讀 `.ai-doc/dev_task.md` 的 `### 派工規則` 與 `### 目前派工任務清單`；不得整段載入
   `## 總任務清單`。
3. 已知 DEV ID 時，搜尋該 DEV 的索引起點，只讀到下一個同層狀態符號 DEV 項目前；未知 DEV ID 時，
   先用狀態符號與功能詞搜尋候選，不掃描所有任務明細。
4. 選定一個 DEV / package 後，才到 `.ai-doc/documentation_map.md` 搜尋該 package heading。
5. 只讀該 DEV 直接連結的 SPEC / ADR / QA / QC / report。
6. 只有文件治理、archive restructure 或 cross-package consistency audit 才讀完整 `documentation_map.md`。

## Spec Impact Preflight

修改產品程式、API、schema、狀態機、權限、主要 UI flow、驗收或 release 行為前：

1. 若已知 DEV / package，先讀該 DEV 在 `dev_task.md` 的索引與直接連結的 active SPEC / ADR / QA / QC。
2. 若未知 DEV，先用功能名、component、route、API、table、status、permission、provider 或錯誤訊息搜尋 `documentation_map.md`、`dev_task.md` 與 spec 檔名；只讀命中項。
3. 對照 active contract 的 scope / out of scope、authoritative source、accepted/rejected decisions、狀態轉換、資料/API/權限、驗收與 release gate。
4. 結論分類為 `No conflict`、`Compatible exception`、`Intentional replacement` 或 `Unresolved conflict`。
5. `Unresolved conflict` 不得直接改碼；`Intentional replacement` 必須同步更新 authoritative spec / ADR / dev_task / documentation_map 或取得使用者決策。

## Cross-Module Non-Negotiable Authority

- 任何涉及料號、圖面、BOM、ECO、技轉、匯入／匯出或 ERP 的工作，必須先遵守
  `.ai-doc/decisions/ADR-PDM-MATERIAL-IDENTITY-REVISION-001-part-number-vs-controlled-definition-revision.md`：
  Part Number 代表物料身份且本身無 Revision；Drawing 與 BOM 是各自獨立版控的受控工程定義。
- 同一物料身份下，只提升實際受影響的 Drawing/BOM Revision，不得自動同步。FFF、互換性、法規／品質管制
  或其他物料身份條件改變時，必須建立新 Part Number，並建立該新身份自己的 BOM。
- 新 schema/API/UI/export 不得建立或呈現 Part Number Revision。發現 legacy `parent_revision`、`child_revision`、
  `items.current_revision` 等語意時，先做 Spec Impact Preflight；不得把它們當成新 authority。

## Current Dispatch Boundary

- 目前沒有可直接正式部署的任務；production、Cloud SQL/GCS cutover、provider pointer、migration、release、rollback 或 production smoke 必須走 release gate。
- `DEV-032` 是第一版 production 唯一 active launch-moving package；當前子關卡為 `Gate A` production Firebase/provider config、env source、Secret Manager metadata readback與credentialled plan review，仍不得apply。
- `DEV-046` Phase 1A-1E、Phase 2A與Phase 2B staging activation已完成；Phase 3A production由`DEV-032`執行，Phase 3B+只保留future capsules或另行明確派工。
- `DEV-048` 圖料號 / 草稿 / 狀態 / 技轉入口整合已本機完成；不得自動續做 provider/staging/release。
- `DEV-047` bounded schema migration只有Phase A0本機inventory tooling完成；authoritative inventory要等production canary穩定與受控target/snapshot，不要求固定觀察天數。
- `DEV-041` Phase 3A-1是下一個可選產品切片；`DEV-015`需先選定單一切片；`DEV-033 + DEV-046 Phase 3B + DEV-037`是future GCS authority/cost/continuity package。
- `DEV-060` 已完成 Phase 1A→1D 本機 RD/QA/QC；canonical Part Number owner、獨立 BOM Rev、三來源 `/bom/new`、review/release/export/read integration 與 isolated evidence 已通過。commit、live migration、deploy、production smoke與 release仍須另走 gate。
- `DEV-061` 本機 Phase 1A～1D 已完成，狀態為 `Local RD Implemented / Focused QA-QC Passed / Production Release Gated`。圖號只放受控版次檔，料號保留精簡且不收合的文件清單；每次首版／進版必須重新上傳 `.SLDDRW` + `.SLDPRT/.SLDASM`，相同 3D bytes 才由系統在 company/owner scope 內共用 canonical asset。cleanup 僅 dry-run，production／正式 Drive 或 bucket 刪除、live migration、commit、deploy、release 均未授權。
- `DEV-062` 已達 `✓ Local RD Implemented / Fixed-3000 QA-QC Passed / Release Gated`。Isolated run `DEV062-20260810-121012-local-isolated`通過aggregate 15/15、contract 40/40、browser 33/33；使用者截圖重開QC後，fixed 3000 run `DEV062-FIX-20260810124507-fixed3000`再以10/10證明兩路由舊頁籤為0、formal/candidate同頁、legacy URL正規化且visible／console／server error為0。本機launcher會啟用DEV-062並以health gate防止Legacy誤判；production flag、deploy、release仍須明確release指令。
- `DEV-030`與`DEV-031`只保留來源ID與角色分離證據，分別併入`DEV-032 Gate B/C`，不得再作為獨立派工入口。
- `DEV-035`維持CAD 2D preview deferred；`DEV-036` SolidWorks Add-in已停止追蹤，只有新產品決策才能恢復。

## Read Guardrails

- Completed / protected context 只作歷史與 evidence，不代表可自動執行。
- `archived/` 只在追查完成任務、舊 evidence、歷史快照或一致性稽核時搜尋命中段落。
- 若只需狀態判斷，優先引用 `dev_task.md` 索引與本檔；不要把大型 spec/report 整份載入。
- `## 總任務清單` 是任務容器，不是冷啟動的全文讀取範圍；一律先定位子章節或目標 DEV。
