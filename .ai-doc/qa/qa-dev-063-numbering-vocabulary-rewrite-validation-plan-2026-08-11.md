# QA Plan：DEV-063 編號身份與儲存文字改寫

Status: `Local RD Complete / QA-QC Passed / Production Release Gated`
Date: 2026-08-11
Owner: QA
Related DEV: `DEV-063`
Related SPEC: `.ai-doc/specs/SPEC-PDM-STATUS-UX-003-state-axis-vocabulary-and-header-help.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-NUMBERING-IDENTITY-VOCABULARY-001-stored-label-rewrite.md`

## 1. Objective

驗證使用者可見身份統一為「編號／主根號／料號／圖號」，移除「保留號」、「候選」與號碼效力分類，
並確認 5C local rewrite 只改人類可讀文字，不破壞 machine identity、流程狀態與權限 authority。

本 phase 尚無稽核要求；5C 仍驗證 raw audit／hash-bound snapshot 不覆寫，並驗證其人類可讀顯示投影。Production data、正式 migration、deploy 與 release 不在本計畫範圍。

## 2. Entry Criteria

- RD 完成 vocabulary mapping、exact field inventory 與 local rewrite runner。
- runner 支援 dry-run、transaction、idempotency／migration version、前後計數與 mismatch fail-closed。
- 已建立隔離 local fixture；不得使用 production 或未核准正式資料。
- active SPEC、ADR 與 DEV-063 內容一致。

## 3. Acceptance Matrix

| ID | 情境 | 預期 |
|---|---|---|
| QA-063-001 | 料號工作台入口 | 顯示「建立料號」；不出現保留號／候選／號碼效力詞 |
| QA-063-002 | 圖號工作台入口 | 顯示「建立圖號」；物件只稱圖號 |
| QA-063-003 | 圖料工作台入口 | 顯示「建立圖號與料號」 |
| QA-063-004 | 無 domain context | 顯示「建立編號」 |
| QA-063-005 | workflow status | 顯示編輯中／申請中／送審中／審核中／已發布／已取消 |
| QA-063-006 | restricted action | 以白話限制與 disabled CTA 說明，不使用號碼效力 badge |
| QA-063-007 | history/detail/help/ARIA | 不出現保留號、候選、預覽、已保留、正式、已釋出或正式圖號等詞 |
| QA-063-008 | old URL | `?tab=reserved`／`?tab=drafts` 仍 zero-write canonicalize |
| QA-063-009 | 5C rewrite | history 與可變人類文字完成改寫；audit/snapshot 以顯示投影改寫，raw value/hash、machine code、ID、state、permission invariants 不變 |
| QA-063-010 | rerun | 相同 migration version 重跑不重複改寫、不增加資料列、不改號碼值 |

## 4. Data Rewrite Gates

- D-01：dry-run 輸出 exact table/field/string/count，未知欄位或 machine token 命中即 fail。
- D-02：apply 只在隔離 local target 執行；transaction commit 前任何錯誤必須 rollback。
- D-03：前後比對 ID、號碼值、enum、state、permission、hash、timestamp、row count 與 API shape。
- D-04：5C 不要求稽核驗證，但 raw append-only audit／hash-bound snapshot 不覆寫；若產品新增稽核或法規要求，立即停止並重開 DEV/ADR。
- D-05：不得由全文字串 replace 取代欄位級 mapping；保留 machine `reserved`／`candidate`／`official` identifiers。

## 5. Functional Regression

- number-state create、submit、withdraw、cancel、approve、publish。
- parts、drawings、search、relation、dashboard、upload、approvals、handoff、transfer package。
- history/detail/drawer、API fallback、status help、ARIA、empty/error/success/confirmation。
- existing numbering lifecycle、request-equivalence、change-control、entity-detail-drawer 與 production-slice boundary QC。

## 6. Browser and Static Evidence

- Viewports：1440×900、1024×768、390×844。
- Evidence：old-term scan、visible-error scan、console/page/5xx error、horizontal overflow、focus restore、ARIA label、disabled CTA reason。
- Required commands：`npx.cmd tsc --noEmit --pretty false`、`npm.cmd run lint -- --quiet`、
  `npm.cmd run qc:dev-063-numbering-vocabulary-rewrite`、affected status/lifecycle browser QC。

## 7. Stop Conditions

- 需要修改 schema shape、API payload、state machine、permission、approval/publication authority 或 machine identifiers。
- rewrite runner 無法區分人類文字與 machine token。
- local target 以外的正式資料、production、deploy、release 或未核准 migration 被要求執行。

## 8. Executed Evidence — 2026-08-11

- `qc:dev-063-numbering-vocabulary-rewrite`: 10/10 passed；dry-run 16 fields、1031 rows、0 changes。
- `qc:pdm-number-effectiveness-ui`: 5/5 passed；browser focused QC：6/6 passed。
- number-state flow UI：8/8 passed；request equivalence：11/11 passed。
- production-slice：34/34 passed；reservation/revision timing UX：14/14 passed；status-scope coverage：83/83 passed。
- `typecheck`、`lint -- --quiet`、`qc:doc-paths` 23/23、`qc:dev-task-evidence-sync` 13/13、`qc:dev-task-completion-audit` 8/8 passed。
- Browser evidence covers the isolated shared NumberState surfaces at 1440×900 and 390×844；1024×768 remains covered by the static/layout contract but was not separately captured in this run。
- No live/local data apply、production migration、deploy、merge、PR 或 release was executed。
