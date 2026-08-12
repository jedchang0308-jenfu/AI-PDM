# ADR-PDM-PART-COST-RETIREMENT-001：退役料號製造成本模組

Status：Accepted / Local applied / Production Cloud SQL release gated
Date：2026-08-11
Owner：Dev PM
Decision source：使用者明確要求「成本相關功能全部刪除、後端也刪除、既有成本資料表也刪除」

## Decision

AI_PDM 不再提供料號／製造成本產品功能。退役範圍包含：

- 料號成本 UI、成本狀態、成本維護與成本審核入口。
- 料號成本 API、repository、async adapter、redaction 與 status projection。
- `part_cost_change_requests`、`part_standard_costs`、`part_cost_tiers`、`part_cost_profiles` 資料表及其索引／觸發器／RLS 清單項目。

目前保留的檔案儲存成本、雲端基礎設施預算與 AI API 成本管控，屬於平台營運治理，不是料號製造成本，不在本 ADR 退役範圍。

## Data and migration boundary

- 本機 SQLite 已移除四張料號成本表，並保留退役前備份於 `data/backups/`。
- Cloud SQL migration source 為 `db/postgres/032_remove_part_cost.sql`，由既有 Cloud SQL migration runner 以 child-first 順序刪除四張表。
- migration 不自行包 `BEGIN`／`COMMIT`，由 runner 的單一交易邊界負責原子性與 checksum history。
- 正式 apply 仍須遵守 production Cloud SQL migration approval、migration IAM user、localhost proxy、backup／rollback 與 post-migration schema query；本 ADR 不自行授權正式資料刪除。

## Verification contract

`npm.cmd run qc:pdm-part-cost-retirement` 必須確認：

1. current `src`、baseline schema、package 與直接相關 QC 無退役產品成本契約引用。
2. migration 包含四張表的明確 child-first `DROP TABLE`，且沒有內嵌交易 wrapper。
3. active local SQLite 無任何名稱含 `cost` 的資料庫物件。

## Superseded documents

本決策取代仍描述料號成本產品功能的歷史／待辦規格與驗收段落；相關文件保留作歷史追溯，但不得再作為現行 implementation 或 release acceptance。平台營運成本治理文件不受影響。
