# QA 驗證計畫：DEV-095 BOM 模組硬刪除

對應任務：`DEV-095`
對應 ADR：`ADR-PDM-BOM-RETIREMENT-001`
狀態：Closed / Local scope complete / Production retirement out of scope
日期：2026-08-24
風險：Medium（current local scope）；High（historical production scope）

> **2026-09-22 current scope amendment**：使用者確認 DEV-095 不執行正式環境 BOM retirement；本 QA plan 的 current acceptance 只涵蓋本機產品退役、isolated data/schema rehearsal、focused regression、typecheck 與 isolated build。G5～G9 的 production backup、candidate、migration、promotion 與 post-release smoke 保留為歷史方案，不再是本 DEV 的待完成條件。

## 1. 驗收結論

本任務 current scope 在產品碼、baseline schema、本機資料與 isolated regression/build 完成後即可結案。依 2026-09-22 人類決策，Cloud SQL 正式資料與 production runtime 不在本 DEV 範圍；本 QA 不宣稱正式環境已刪除。

## 2. Gate 與 FMEA

| Gate | 主要風險 | 必要證據 |
|---|---|---|
| G0 source boundary | 從錯誤 branch 發版或混入其他 dirty work | `origin/main` 基底、exact commit、scope diff、無未追蹤必要檔 |
| G1 code removal | 隱藏入口但 API/repository 仍可用 | `src/` route/import/type/UI inventory 為零；舊 URL 404 |
| G2 schema/migration | 表刪除順序、constraint 或相容 action 破壞非 BOM 資料 | fresh SQLite、legacy fixture migration、PostgreSQL package/QC、FK/integrity/digest |
| G3 local data | 誤清 primary DB 或 canonical identity 改變 | dry-run、獨立 backup、before/after schema與identity digest、FK=0 |
| G4 application regression | submission、drawing、part、approval、procurement、share、AI 退化 | typecheck、focused QC、isolated build、API／browser smoke |
| G5 production backup | 無可驗證 restore point 即刪資料 | Cloud SQL backup/PITR、舊 revision/image、restore command與owner |
| G6 candidate | 新 image 尚查詢退役表，或舊 URL 未真正消失 | zero-traffic candidate smoke、migration package digest、404 contract |
| G7 live migration | migration 套錯 target／半完成 | exact project/instance/database、migration job logs、history checksum、schema readback |
| G8 promotion | DB 已刪但舊 revision 仍接流量 | candidate-bound Level 4、Wave 0、product-owner go、100% traffic readback |
| G9 post-release | Hosting/API/登入或非 BOM 核心流程退化 | Firebase origin smoke、auth smoke、official numbering/read-only core smoke、monitoring |

## 3. Local isolation contract

所有 build、test、browser 與 migration rehearsal 使用 task-owned `PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`、dist 與 port。不得 seed／clean primary DB；build 前後必須證明 primary SQLite schema、canonical root/part/drawing identity、migration residue 與 `PRAGMA foreign_key_check` 不變。暫存 runtime 結束時只停止 task-owned process tree並確認 port 釋放。

## 4. Required commands（current local scope）

- `npm.cmd run qc:dev-095-bom-retirement`
- `npm.cmd run typecheck:app`
- `npm.cmd run build:isolated`

既有 `qc:pdm-change-control`、lifecycle、DB boundary 與 migration rehearsal receipts 可重用；正式環境 backup、candidate、migration、promotion 與 post-release smoke 已依 scope amendment 移出本 DEV。

## 5. Stop conditions

- backup／PITR、exact target、migration authority 或 rollback owner 任一不可證明。
- primary or production non-BOM identity digest/count 發生未解釋變化。
- candidate、Cloud SQL migration history、Level 4、Wave 0 或 product-owner gate 不完整。
- 任何舊 BOM route/API 回傳成功或相容 payload，而非 404。
- 任一 P0/P1、FK error、migration partial state、production 5xx 或 unknown traffic state。
