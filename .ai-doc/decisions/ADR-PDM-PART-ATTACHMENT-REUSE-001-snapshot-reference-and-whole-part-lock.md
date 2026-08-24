# ADR-PDM-PART-ATTACHMENT-REUSE-001：料號附件獨立快照參照與整料號排他鎖

Status: Historical Decision Options / Superseded by DEV-088 Planning / Not Implementation Authority
Date: 2026-08-20
Owner: Dev PM
Historical DEV: `DEV-084` / `DEV-PDM-REPLACEMENT-PART-ATTACHMENT-REUSE-001`; successor: `DEV-088` / `DEV-PDM-REPLACEMENT-PART-ATTACHMENT-REUSE-002`
Related SPEC: `.ai-doc/specs/SPEC-PDM-PART-ATTACHMENT-REUSE-001-replacement-snapshot-and-part-lock.md`

> 2026-08-22 Execution Supersession：保留「替代料號附件由使用者預設全選、可取消／新增，且不混入Drawing受控檔」的產品意圖；撤銷本ADR作為五表attachment platform、permission取消、所有生命週期自由維護與whole-part lease的現行實作authority。DEV-084成為歷史ID，後續由DEV-088在DEV-087本機RD／QA／QC完成後重新縮編；這些選項不得自動繼承或直接派工。DEV-087沿用現行附件authority，並自行定義Part附件不進work/review/rollback；不依賴本ADR。

## Context

替代料號多數會沿用舊料號文件，但系統無法可靠判斷每一份文件是否仍適用。若要求逐件重傳，會製造高頻重工與重複儲存；若自動繼承並持續同步，則會讓新料號的文件適用性被舊料號日後操作靜默改變。

現行 `file_assets` 將內容、metadata與單一 `linked_entity_type/id` owner放在同一列，適合單一owner附件，卻不能安全表示兩個料號各自刪除、替換、還原，同時引用相同immutable bytes。現行 `item_locks` 綁定submission/item、缺少renew/fencing與active unique guarantee，也不足以保護所有part field與attachment writes。

本需求另外有一項明確產品選擇：料號附件以效率優先，不設附件專屬角色、權限或審核；但所有寫入仍必須遵守既有登入、公司／租戶與資料可見性邊界。

## Options Considered

### Attachment reuse

| Option | Decision | Reason |
|---|---|---|
| 每次把檔案bytes與attachment row完整複製到新料號 | Rejected | 重複儲存、完整性與清理成本高，且相同內容無法形成單一canonical證據。 |
| 將來源attachment owner搬到新料號 | Rejected | 破壞舊料號歷史與下載，無法支援新舊料號同時保有文件。 |
| 新料號動態繼承舊料號附件並持續同步 | Rejected | 來源日後刪除／替換會靜默改變目標適用性，責任邊界不清。 |
| 系統依類別、內容或風險規則自動判定是否沿用 | Rejected | 系統沒有可靠判定依據，誤判成本高；使用者才掌握換號原因。 |
| 使用者預設全選，目標建立獨立binding/version並參照immutable canonical content | Accepted | 多數情境只需處理例外，操作最少；同時保留目標獨立生命週期與內容去重。 |

### Concurrency

| Option | Decision | Reason |
|---|---|---|
| 只做最後寫入覆蓋或樂觀版本衝突 | Rejected | 使用者可能在長表單與附件操作後才發現衝突，且part field與attachment容易互相覆寫。 |
| 只鎖attachment區塊 | Rejected | 料號欄位與附件仍可由不同使用者同時改，不能提供使用者要求的單一編輯責任。 |
| persisted part/draft的whole-owner exclusive lease，其他人唯讀 | Accepted | 對使用者最易理解，能讓所有part write共享同一concurrency boundary；expiry與fencing避免永久鎖及stale write。 |

## Historical Decision Set（2026-08-22起非執行契約）

1. 替代料號流程採「預設全選、使用者取消／新增」；系統不提供適用性分類、風險判斷或至少一件的限制。
2. 沿用是一次性snapshot。目標建立自己的`PartAttachmentBinding`與不可變`PartAttachmentVersion`，內容參照既有或新建的immutable canonical content；不搬移來源owner、不複製相同bytes、不建立後續同步。
3. Content與attachment lifecycle必須分離。任一料號的metadata edit、content replace、delete或restore不得修改另一料號的binding/version或歷史。
4. 同一目標owner對同一immutable content最多一個active binding；duplicate判斷以content identity/hash+integrity為準，不以檔名為準。
5. 料號附件的create/edit/replace/delete/restore不使用attachment-specific permission或approval。既有authentication、same-company/tenant與part visibility仍是不可移除的外層邊界；其他part/drawing/BOM/release actions維持各自權限。
6. Formal part與persisted part draft的所有資料／附件寫入共用stable-owner exclusive lease。每個server mutation驗證opaque token與fencing/version；讀取／下載不鎖定，其他使用者可唯讀並看見holder。
7. Save/complete/cancel主動release；server lease TTL固定5分鐘、heartbeat 60秒、client inactivity 15分鐘、無grace。close/disconnect最終由expiry回收；raw token只存sessionStorage與DB hash，fencing每次新acquire遞增。
8. Drawing與controlled revision files完全留在DEV-061 authority，不出現在replacement part attachment選擇。
9. 實體模型固定為`part_attachment_contents`、`part_attachment_bindings`、`part_attachment_versions`、`part_attachment_binding_origins`與`part_edit_leases`；legacy part asset ID保留為backfilled binding ID。`item_locks`維持submission checkout，不重用。
10. Cloud SQL migration固定為`db/postgres/041_part_attachment_reuse_and_edit_leases.sql`，SQLite由`db/schema.sql`＋`src/lib/db.ts#ensurePartAttachmentReuseSchema`維護；Supabase不是migration、staging、rollback或release target。
11. New upload以same-company SHA-256＋size及deterministic storage key進行idempotent canonical ingestion。後續business transaction失敗時，未綁定verified content可留作安全重用；不建立可見attachment/draft，也不做可能刪除共享bytes的猜測式compensation。
12. Interactive write必須持有效lease token＋fencing；review/release/obsolete等controlled write不得取得使用者token，但必須拒絕與active human lease併發。Lease是concurrency boundary，不取代各domain permission。

## Consequences

### Positive

- 高頻情境只處理少數例外，符合「大部分附件不變」的實際效用。
- 新舊料號的文件適用性與歷史獨立，不會因來源日後操作被靜默改寫。
- 相同內容只保存一份canonical bytes，attachment metadata、刪除與還原仍可各自演進。
- 使用者不需理解檔案owner或去重機制；正常UI可維持平面、安靜。
- Whole-owner lease建立單一編輯責任，避免part field與attachment跨區塊互相覆寫。

### Trade-offs

- 現行`file_assets`單一owner模型新增固定binding/content/version indirection，part route改走compat adapter；Drawing route維持現有repository。
- Attachment permission由專屬action permission改為visibility boundary，安全驗證重點轉為company/tenant isolation、server-side owner resolution與audit。
- Whole-owner lease會影響所有part mutation consumer，實作範圍大於附件面板本身；因此本ADR接受獨立`part_edit_leases`、consumer inventory gate與controlled-writer conflict guard的成本。
- 刪除不做確認以換取效率，安全性依賴relation-level soft delete、history restore與禁止physical content deletion。
- Replacement draft與正式化之間需要穩定lineage，確保snapshot不會在release時重新讀取來源。

## Historical Compatibility And Migration Impact（尚未生效）

- `SPEC-PDM-FILE-OWNERSHIP-001`的Drawing/Revision authority、canonical content與hash完整性規則維持；其料號附件「只有新增」與`numbering.attachments.manage`規則由本ADR/SPEC有意取代。
- Legacy `file_assets.linked_entity_type/id` part rows保留且不改owner；new model不得以改寫owner或複製bytes模擬共享。Backfill以legacy asset ID作binding ID，有hash duplicate映射same-company canonical content，無hash標記`legacy_unverified`。
- 既有part attachment list/download/preview/Drive/delete/restore URLs由adapter維持；新`PATCH` metadata、`PUT` replace、history及edit-lease routes為compatible extension。
- 既有soft-deleted attachment與audit不可丟失；restore migration必須能解析確切content+metadata version，無法證明者進manual review而非猜測。
- 現行`item_locks`只作歷史行為參考並保持不變；`part_edit_leases`才是formal part／replacement draft authority。

## Historical Implementation Consequence Amendment（非派工依據）

- Exact wire、schema、consumer ledger、phase與QA authority在related SPEC §5～18及`.ai-doc/qa/qa-dev-084-part-attachment-reuse-and-lock-validation-plan-2026-08-20.md`。
- Feature flag固定`PDM_PART_ATTACHMENT_REUSE_V1`、預設off。Production採additive migration＋兼容reader先行，再按company enable；啟用後不得rollback到不理解binding model的pre-DEV-084 binary。
- Metadata precedence固定為new upload高於inherited，同層request ordinal最小者優先；所有selected source provenance仍保留。
- Draft→formal owner變更是同一target lineage promotion；source old-part binding永不搬移。Formalization與既有replacement release保持同一transaction，附件不新增approval gate。

## Amended Authorities

本ADR曾提議修訂下列authority，但2026-08-22後尚未生效；現行authority繼續有效，直到未來新契約明確取代：

- `.ai-doc/decisions/ADR-PDM-FILE-OWNERSHIP-001-contextual-files-and-3d-content-reuse.md`：part attachment從single-owner asset row延伸為independent binding/version；Drawing authority不變。
- `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`：part attachment write surface、permission與lifecycle規則。
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`：replacement draft建立時增加attachment decision snapshot；原替代關聯與release approval不變。

本ADR不修訂Part Number identity、Drawing/BOM revision、FFF判定、發行審核、Where-used或Released history authority。
