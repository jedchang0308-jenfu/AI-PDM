# SPEC-PDM-RETIREMENT-RESIDUE-CLEANUP-001

DEV：`DEV-106`

狀態：`RD Implementation Ready / Production Release Gated`

日期：2026-08-30

## 1. 問題與決策

Production 資料恢復後，正式圖號／料號與關聯資料均完整，但舊 DEV-087 recovery mapper 直接重播已套用的 PostgreSQL migration 042，使 DEV-090 已退役的空 `relation_change_works` table、trigger 與 guard branch 再度出現；同一 mapper 也在57筆 `part_change_works.proposed_payload` 寫入 DEV-095 已退役的 `bomUsagePolicy` key。

本 DEV 採 forward-only cleanup，不恢復 Relation 工作臺或 BOM 功能。正式 `drawing_part_links`、Part/Drawing identities、immutable review traces與既有歷史 migration不刪除、不改寫。

## 2. 可驗收範圍

- 新增 PostgreSQL migration 052：只允許空 Relation work residue 被移除；任何 current Relation work/state/aggregate/review或未解 quarantine 非0均 fail closed。
- 移除所有 current Part work payload 的 `bomUsagePolicy`，並以 DB constraint 阻止再次寫入。
- recovery mapper 不得直接執行 migration 042；apply 前必須證明 ordered migration ledger 已套用052。
- current mapping/coverage 不再產生或期待 `bomUsagePolicy`，不再把 `relation_change_works` 當合法 target。
- SQLite fresh baseline不建立 Relation work/current projection schema；既有空 compatibility residue由 forward cleanup移除，正式 drawing-part link保留。
- production package固定為50筆 migration，最後一筆必須是052。

## 3. 非目標與紅線

- 不刪除或重建 `drawing_part_links`、`relation_approved_change_snapshots`、`pdm_review_traces`。
- 不刪除非空 Relation current data；遇到非0立即中止並回報。
- 不修改 historical migration 042/043/047 checksum。
- 不以舊 positive Relation/BOM validation 當 current acceptance；只保留負向退役與資料保存驗證。
- production source database 先備份；restore target rehearsal通過後才可套用正式 migration。

## 4. Release Profile

`database + application/recovery tooling`，風險等級 High。必須具備 exact source、immutable app/migration digest、restore rehearsal、migration第二次no-op、唯讀 reconciliation、0% candidate與 canonical post-activation smoke。Traffic activation是候選驗證後的獨立決策。

## 5. Spec Impact

`No conflict / corrective enforcement`。本 SPEC 執行既有 DEV-090 Relation retirement與 DEV-095 BOM hard retirement，不建立新產品能力；ADR=`No New ADR`。
