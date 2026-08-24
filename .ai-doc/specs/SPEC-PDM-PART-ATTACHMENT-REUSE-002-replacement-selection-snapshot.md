# SPEC-PDM-PART-ATTACHMENT-REUSE-002：替代料號附件人工沿用與安靜選擇

Status: `Local RD Implemented / Focused QA-QC PASS / Human Intent Preserved / Production Migration & Release Gated`
Date: 2026-08-22
Owner: Dev PM
DEV: `DEV-088` / `DEV-PDM-REPLACEMENT-PART-ATTACHMENT-REUSE-002`
Risk: Medium / P1
ADR: `.ai-doc/decisions/ADR-PDM-PART-ATTACHMENT-REUSE-002-file-asset-snapshot.md`
QA: `.ai-doc/qa/qa-dev-088-replacement-part-attachment-selection-2026-08-22.md`

## 1. 目標

建立替代料號時，將來源料號目前有效、直接歸屬料號的附件顯示為平面 checkbox 清單並預設全選。使用者可取消任一或全部，也可在同一次送出加入新檔；系統只提供選擇工具，不判定附件是否適用。圖號、Drawing Revision、2D／3D 與其他受控檔案不得進入候選。

沿用是一次性快照：目標建立自己的 `file_assets` rows，但沿用來源相同 storage pointer，不複製 physical bytes、不搬移來源 owner，也不建立後續同步。目標草稿核准建立正式料號時，這批 target rows 在同一 release transaction 由 `part_number_draft` owner promotion 到新 `part_number` owner。

## 2. Spec Impact 與縮編決策

本 SPEC 有意取代歷史 DEV-084 大包的執行方向，只保留其核心產品意圖：

- 採用：來源附件預設全選、可取消／新增、source stale fail closed、一次性 snapshot、同 bytes 不重存、目標後續獨立、安靜 UI。
- 不採用：五表 content/binding/version 平台、附件權限取消、全生命週期附件重寫、metadata version/history/restore 中心、whole-part lease、feature flag 與 legacy 全量 backfill。
- 保留：DEV-087 的現行 Part attachment authority、`numbering.attachments.manage`、same-company／visibility、Part 附件獨立即時生效且不進 Part work/review snapshot。
- 不改：Part Number identity、Drawing/BOM revision、FFF 判定、review action、Drawing file authority、BOM、release permission、physical GC。

歷史 `SPEC-PDM-PART-ATTACHMENT-REUSE-001`、其 ADR 與 QA-084 只作風險來源，不是實作 authority。

## 3. 人類 UI

替代料號區內增加一個扁平「料號附件」區：

- loading、error、空清單只各一個最小訊息。
- 每個來源附件一個 checkbox，預設勾選；顯示名稱／檔名與文件類別即可。
- 新檔使用同一區的原生多檔選擇入口，選到後顯示在同一平面清單，可移除。
- 不顯示沿用／排除／新增件數、來源 badge、風險卡、hash、token、DEV ID、第二個提交按鈕或第二層 wizard。
- 只有 FFF 結果為確認影響且來源料號唯一時顯示；來源改變時重新載入並再次預設全選。
- source stale 時保留畫面選擇與 File objects，提示重新整理附件後再送；不得靜默少帶附件。

## 4. Data Contract

### 4.1 `part_attachment_reuse_snapshots`

每個 replacement draft 最多一列：

- `id` PK、`company_id`、`part_number_draft_id UNIQUE`、`source_part_number_id`
- `source_token`、`selection_fingerprint UNIQUE(company_id, part_number_draft_id, selection_fingerprint)`
- `candidate_count`、`selected_count`、`new_count` 皆 `>=0`
- `created_by`、`created_at`
- FK company／draft／source part／user

### 4.2 `part_attachment_reuse_origins`

每個 target draft `file_assets` row 的來源映射：

- `id` PK、`company_id`、`snapshot_id`、`target_file_asset_id`
- `origin_kind IN ('inherited','new')`
- `origin_key`：inherited 使用 source asset ID；new 使用 `new:{clientKey}`
- `source_file_asset_id`：inherited 必填、new 必須為 null
- `created_by`、`created_at`
- UNIQUE `(snapshot_id, origin_key)`；indexes 支援 target/source reverse lookup

Snapshot／origin 是 backend 稽核資料，不進一般 UI。

## 5. Candidate 與 Token

`GET /api/parts/{partNumber}/replacement-attachment-candidates` 只查同公司 formal Part 的 `file_assets`：

```sql
linked_entity_type = 'part_number'
AND linked_entity_id = source_part_id
AND deleted_at IS NULL
AND document_category NOT IN ('drawing_2d', 'cad_3d')
```

投影依 `file_assets.id ASC` 固定排序。token 為 canonical JSON 的 SHA-256，至少包含版本、company、source part ID，以及每列 `id/updated_at/content_hash/file_size/storage_provider/storage_bucket/storage_key/storage_generation`。任何候選新增、刪除、替換或 metadata 更新都使 token 改變。

Response 只含 `{sourcePartNumberId, sourceToken, candidates[]}`；candidate 含 `id/fileName/displayName/documentCategory/fileSize/updatedAt`，不含 raw storage pointer、hash、Drawing files或件數摘要。

## 6. Commit 與 Dedupe

1. replacement snapshot 必須和 replacement draft 建立在同一 DB transaction；source part ID 必須等於 draft source。
2. Server 重算 candidate token；不一致回 `SOURCE_ATTACHMENTS_STALE` 且 target DB mutation 為零。
3. selected IDs 必須是完整 candidate set 的子集合；重複或額外 ID 回 400。
4. new files 在 business transaction 前完成 storage put；storage adapter依現行 SHA-256 reuse相同 bytes。transaction失敗時不得留下可見 draft/file row；無 DB 引用的 object 不在本 DEV 做 physical GC。
5. target `file_assets` row 使用 `linked_entity_type='part_number_draft'`、`linked_entity_id=draft.id`。inherited row copy來源不可變 file/storage/metadata snapshot；new row使用本次上傳 metadata。
6. target dedupe key 為 `content_hash + file_size`；new file 優先於 inherited，之後以 request ordinal、stable ID決定代表 metadata。所有 selected inherited source仍各留origin。
7. `selection_fingerprint` 由 source token、sorted selected IDs及new file hash/size/metadata計算。同draft相同fingerprint重送回原結果；不同fingerprint回`REPLACEMENT_ATTACHMENT_SNAPSHOT_CONFLICT`。
8. 允許取消全部且不新增；仍建立0-count snapshot，證明是明確選擇而非系統漏資料。

## 7. Formalization 與 Lifecycle

- `approve_replacement_part_and_drawing_release` 在建立新 formal part 後、draft status/replacement link commit前，將該 draft active target `file_assets` 原子更新為 `linked_entity_type='part_number'`、`linked_entity_id=newPartId`。
- 不重讀來源、不重算選擇、不複製 bytes；origin/snapshot保留指向已released draft與target asset。
- 缺 snapshot、asset owner錯置、來源 company mismatch、target asset缺失或草稿存在snapshot外active附件時，整個 replacement release rollback；promotion只可更新origin列出的target assets。
- void/recycle遵循既有 draft controlled boundary；本 DEV 不新增 restore、delete或physical cleanup行為。

## 8. API Wire

JSON與multipart共用：

```json
{
  "attachmentSnapshot": {
    "sourcePartNumberId": "part-id",
    "sourceToken": "sha256",
    "selectedAttachmentIds": ["asset-id"],
    "newItems": [
      {
        "clientKey": "client-id",
        "ordinal": 0,
        "displayName": "檔名",
        "description": "",
        "documentCategory": "other"
      }
    ]
  }
}
```

- 無 new file 時保留既有 JSON request。
- 有 new file 時用 multipart：`command` 是上述完整 JSON；file field 為 `part_attachment_file:{clientKey}`。
- 支援入口：`POST /api/numbering/part-number-drafts`、`POST /api/numbering/drawing-revisions/submissions`、`POST /api/numbering/drawing-revisions/fff-assessments`。
- 非 replacement 或沒有 source 時若帶 snapshot，固定拒絕；confirmed-impact replacement 若未帶 snapshot，固定 `REPLACEMENT_ATTACHMENT_SNAPSHOT_REQUIRED`。
- enforced lifecycle 分支若尚未建立 replacement draft，收到 snapshot 必須明確回409，不得假成功。

## 9. 權限、效能與錯誤

- candidate read 沿用 `numbering.search`；commit 沿用原本 draft/submission action。沒有新增或移除附件權限。
- 所有 source／target query 都以 company scope 驗證；cross-company 固定 404/409 且不洩漏存在性。
- candidate query固定單次；commit固定candidate re-read、snapshot、target assets、origins的bounded queries，無逐檔 N+1。
- stable errors：`SOURCE_ATTACHMENTS_STALE` 409、`REPLACEMENT_ATTACHMENT_SNAPSHOT_REQUIRED` 400、`REPLACEMENT_ATTACHMENT_SNAPSHOT_CONFLICT` 409、`REPLACEMENT_ATTACHMENT_SELECTION_INVALID` 400、`REPLACEMENT_ATTACHMENT_FILE_INVALID` 400/413。

## 10. Acceptance Criteria

1. 所有且只有來源 formal Part active direct附件出現並預設勾選；Drawing/Revision files為0。
2. 可取消任一／全部與加入新檔，只有既有「建立送審」一次提交。
3. UI沒有件數摘要、來源badge、風險卡、第二wizard或raw技術資訊。
4. source stale零target DB mutation且輸入可恢復。
5. 沿用建立target row但physical bytes不增加；來源row、owner、soft-delete與下載不變。
6. 同content target只有一row；同檔名不同content可存在；所有selected source provenance可追溯。
7. response loss／重送不建立第二snapshot、asset或draft；不同payload fail closed。
8. release原子promotion到新Part；來源之後修改不影響target。
9. anonymous/cross-company fail closed；既有attachment/draft/release permission不被放寬。
10. 1440×900、1024×768、390×844可操作，無水平overflow、雙scroll、visible/console/network error。
11. SQLite/PostgreSQL migration可重跑；fresh schema、FK/index與provider SQL通過。
12. typecheck、focused runner、affected regressions與isolated build PASS。

## 11. Release Boundary

本期只授權本機／disposable實作與驗證。Cloud SQL 041 production apply、data migration、deploy、release與physical file cleanup仍須另行 release gate。DEV-087 的 042 必須持續能在 041 不存在時獨立套用。

## 12. Local Implementation Evidence（2026-08-22）

- `db/schema.sql`、`src/lib/db.ts`與`db/postgres/041_part_attachment_reuse_snapshot.sql`已建立兩表、FK、check、unique與indexes；041未套用正式環境，DEV-087 migration 042仍可獨立執行。
- `replacement-part-attachments.ts`已完成candidate token、source stale、一次性snapshot、content dedupe、batch asset/origin insert、idempotent replay及formal Part promotion。21個來源附件建立只使用14個SQL statements，未出現逐檔N+1。
- 三個replacement入口與既有release transaction已接線；anonymous、cross-company、source mismatch、missing snapshot、stale與promotion缺件皆fail closed。
- 圖面進版頁已完成扁平checkbox清單、預設全選、取消全部、新檔加入／移除、同一提交與stale保留輸入；Drawing類檔案不進候選，沒有第二wizard或技術資訊噪音。
- `npm run qc:dev-088`聚合門檻7/7 PASS：contract 40、repository 29、HTTP 15、三viewport browser 37、change-control 64、typecheck與127-page isolated build。臨時埠與`next-env.d.ts`均恢復。
- QC報告：`.ai-doc/qc/qc-dev-088-local-implementation-2026-08-22.md`；最新browser manifest：`output/qa/dev-088/DEV088-2026-08-21T19-49-42-331Z/manifest.json`。
