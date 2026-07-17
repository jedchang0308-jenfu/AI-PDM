# AI_PDM Cold Start

用途：用最低上下文成本定位本輪 DEV、權威規格與必要證據。

## Canonical Root

- Active repo：`C:\VIBE CODING\AI_PDM`
- 文件中心：`.ai-doc`
- `.ai-doc/dev_task.md` 是狀態、優先級、下一步與阻塞的唯一權威。
- `.ai-doc/documentation_map.md` 只負責 DEV 與文件定位，不維護第二份任務狀態。

## Progressive Read Order

1. 先讀本檔。
2. 讀 `.ai-doc/dev_task.md` 前段與 `## 總任務清單`，只定位候選 DEV，不整份載入。
3. 只讀選定 DEV 的索引項；需要歷史時才搜尋完成索引或 archive 的命中段落。
4. 到 `.ai-doc/documentation_map.md` 搜尋該 DEV heading，只讀命中 package。
5. 只開啟該 package 直接連結且實際存在的 SPEC、ADR、QA、QC 或 report。

## Spec Impact Preflight

修改產品程式、API、schema、狀態機、權限、主要 UI flow、驗收或 release 行為前：

1. 已知 DEV 時，只讀該 DEV 與直接連結的 active contract。
2. 未知 DEV 時，用功能名、route、API、table、status、permission 或錯誤訊息搜尋兩份核心索引。
3. 結論只能是 `No conflict`、`Compatible exception`、`Intentional replacement` 或
   `Unresolved conflict`。
4. `Unresolved conflict` 必須停止；`Intentional replacement` 必須先同步權威文件與驗收。

## Current Routing IDs

- Production release 唯一入口：`DEV-032`。
- 目前 UX workstream：`DEV-049`；下一個需明確產品指令的候選：`DEV-041`。
- Post-production 技術治理：`DEV-047`；future/re-entry：`DEV-015`、`DEV-033`、`DEV-035`、`DEV-037`。
- `DEV-030`、`DEV-031` 只由 `DEV-032` 承接；`DEV-036`、`DEV-038` 不可自動恢復。
- `DEV-046` 是保護項目；只讀原區塊與直接文件，不改寫其內容或 phase 語意。

## Guardrails

- 不遞迴載入完整 `specs/`、`qa/`、`qc/`、`reports/` 或 `archived/`。
- 文件完成、本機完成或 QC 通過都不等於 release ready。
- production、正式資料、權限、migration、deploy、rollback 與 smoke 必須走對應 gate。
