# ADR-PDM-NUMBERING-IDENTITY-VOCABULARY-001：穩定編號身份與儲存文字改寫

狀態：Accepted / Local Implementation Complete / QA-QC Passed；production、正式資料與 release 另行 gate
日期：2026-08-11
來源：`DEV-063`、使用者引導決策 `1C / 2C / 3B / 4A / 5C`

## Decision

使用者可見的物件身份固定使用「編號／主根號／料號／圖號」。移除「保留號」、「候選」與
`預覽／已保留／正式／已釋出` 號碼效力分類；流程只保留「編輯中／申請中／送審中／審核中／已發布／已取消」，
必要限制以白話說明與 disabled CTA 呈現。

本 phase 尚無稽核要求，因此 5C 直接納入歷史與可變資料中的人類可讀 label、description、title 與 reason；
append-only audit 與 hash-bound snapshot 以顯示投影呈現改寫，不覆寫 raw value。不得改寫 ID、enum、machine code、hash、
timestamp、狀態值、權限、API payload key 或任何流程 authority。

## Context

既有 UI 把生命週期、號碼效力與物件身份混在名稱中；同一編號在不同頁面被稱為保留號、候選圖號或正式圖號。
使用者已明確選擇移除這些詞，且目前產品階段尚未建立稽核保存要求。

## Options considered

- `5A`：只改顯示投影，保留原始儲存文字。
- `5B`：改寫使用者文字並保存 before/after archive。
- `5C`：改寫儲存的人類可讀文字；不可變 audit／snapshot 保留 raw value，另建顯示投影。本 phase 選用此方案。

## Consequences

- local RD 需要可重跑、可計數、transaction-bound 的文字改寫 runner；成功後不提供舊詞彙還原承諾。
- machine identifiers 與流程 authority 不受影響，舊 URL 仍 zero-write 相容。
- 若未來出現稽核、法規、品質追溯或 immutable evidence 要求，必須重開 DEV/ADR；不得沿用本 ADR 擴大資料改寫。

## Implementation boundary

- 本 ADR 不授權 production data migration、正式環境執行、deploy、release 或刪除資料。
- RD 必須先做 exact field inventory 與 dry-run，遇到 machine token 命中、欄位語意不明或 count mismatch 即停止。
