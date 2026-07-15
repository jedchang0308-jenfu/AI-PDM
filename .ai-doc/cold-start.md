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

## Current Dispatch Boundary

- 目前沒有可直接正式部署的任務；production、Cloud SQL/GCS cutover、provider pointer、migration、release、rollback 或 production smoke 必須走 release gate。
- `DEV-046` 仍是 active development package；不要搬移或重構 `.ai-doc/dev_task.md` 內的 DEV-046 phase/evidence 明細，除非使用者後續明確授權。
- `DEV-046` 目前卡在 Phase 2B live isolated staging external gates；本地 application/IaC、employee login alias、privacy acknowledgement slices 已有本機 evidence。
- `DEV-048` 圖料號 / 草稿 / 狀態 / 技轉入口整合已本機完成；不得自動續做 provider/staging/release。
- `DEV-047` bounded schema migration 只有 Phase A0 本機 inventory tooling 完成；authoritative inventory 要等 production slice 穩定與受控 target/snapshot。
- `DEV-041` Phase 3A-1、`DEV-015` Phase 2+、`DEV-033` storage rollout 都是待使用者選定或外部決策後才可續接。
- `DEV-030`、`DEV-031`、`DEV-032` 是正式環境 / release gates，不是一般 RD 任務。

## Read Guardrails

- Completed / protected context 只作歷史與 evidence，不代表可自動執行。
- `archived/` 只在追查完成任務、舊 evidence、歷史快照或一致性稽核時搜尋命中段落。
- 若只需狀態判斷，優先引用 `dev_task.md` 索引與本檔；不要把大型 spec/report 整份載入。
- `## 總任務清單` 是任務容器，不是冷啟動的全文讀取範圍；一律先定位子章節或目標 DEV。
