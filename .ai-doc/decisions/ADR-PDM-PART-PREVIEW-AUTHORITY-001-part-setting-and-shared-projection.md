# ADR-PDM-PART-PREVIEW-AUTHORITY-001：以單一料號預覽設定與共用投影治理身份圖片

Status: `Accepted / RD Implemented Locally / SQLite + Browser Evidence Passed / PostgreSQL Activation Evidence Pending / Production Release Gated`
Date: 2026-08-24
Related DEV: `DEV-065` / `DEV-PDM-WORKBENCH-PREVIEW-GALLERY-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-WORKBENCH-PREVIEW-GALLERY-001-drawing-part-3d-preview-mode.md` §0.16

## Context

料號預覽代表Part本身。多數Part可由direct primary manufacturing Drawing的3D辨識：有量產ready預覽時應代表穩定版本；尚未量產但已有研發ready預覽時，也應先提供外形辨識。少數Part需人工上傳圖片。現行系統已有Part附件、Drawing exact preview與canonical file-read，但沒有「目前這個Part選擇auto或哪一張custom image」的durable authority。

若用root-min Drawing、最近附件、檔名、localStorage或list/detail各自resolver推斷，來源會隨資料排序或surface漂移。若只在custom時建立可刪除pointer，reset後版本回0又會產生ABA concurrency缺口。若把custom塞入Drawing 3D／2D slot，則會混淆Part identity media與受控工程檔權威。

## Decision

1. 建立唯一 `part_preview_settings`。每個company＋Part最多一row，保存 `source_mode=auto|custom_image`、nullable `file_asset_id`、monotonic `row_version`、actor與timestamps。
2. row不存在等價初始auto，避免backfill；一旦發生set／replace／reset即保留row。Reset將row改為auto、清file pointer並increment version，不刪row，避免ABA。
3. auto不保存Drawing ID或RD branch preference。Read時只解析direct unique `primary_manufacturing` Drawing並重用canonical exact-3D resolver：有效custom優先；auto內production ready優先，否則選最近更新且active的RD ready；來源改變只影響auto。多個RD branch不要求人工指定，因本功能只作快速辨識。
4. custom image是Part-owned `file_assets`，category為 `part_preview_image`；setting row是唯一active selection authority。Custom不是CAD、DrawingRevisionFile、approval snapshot或engineering definition。
5. active custom asset的generic delete必須block，直到使用者先reset或replace。Reset／replace不隱式刪舊asset；舊asset回到一般Part附件生命週期。
6. list、gallery與drawer共用一個server `PartPreviewResolver` 與 `CanonicalPreviewProjection`；Drawing／Part共用gallery、media與panel mechanics，domain mutation由薄 `PartPreviewSourceControl` 負責。
7. set／replace／reset沿用canonical command receipt、append-only audit、same-company permission、review lock與single canonical file-read，不建立第二套receipt、storage URL或file-read。
8. `part_preview_image`是dedicated preview route的保留category；一般附件上傳不得用此category繞過圖片驗證。DB trigger是active asset soft-delete的final guard，service與UI不是唯一防線。
9. Phase 2 rollout使用default-off `PDM_PART_PREVIEW_V1`，並依賴既有gallery與unified Part flags。尚未實作的暫名`PDM_PART_PREVIEW_OVERRIDE_V1`退役，不建立兩個Part preview flags。

## Rejected alternatives

| Alternative | Rejection reason |
|---|---|
| root-min／最近附件推斷 | 不是明確業務選擇，會因補件、排序或資料分布漂移。 |
| custom-only override row，reset即delete row | reset後row version回0，形成ABA；並失去持久concurrency token。 |
| 在 `part_numbers` 加image欄位 | 把file ownership、source mode與Part master混在一起，難以沿用附件生命週期與canonical file-read。 |
| 把custom做成Drawing 3D／2D slot | 混淆Part identity image與受控圖面authority。 |
| list/detail各自解析或複製Part gallery | 形成雙來源與雙元件，回歸與source-quality風險更高。 |
| generic delete自動reset | 一個附件刪除動作會暗中改變Part identity image，違反明確意圖與no-silent-fallback。 |
| 多RD branch時不顯示或要求永久指定branch | 把低風險辨識輔助升格成版本治理，增加操作與資料authority；deterministic best-available已足夠。 |
| 新增Part專用RD preview resolver／元件 | 造成雙resolver與雙媒體元件；現有canonical exact-3D projection已能表達production／RD與preview state。 |

## Consequences

- 優點：零backfill預設auto；人工例外有唯一durable authority；reset concurrency安全；list/drawer一致；auto不複製Drawing bytes；現有permission、audit、receipt、file-read與附件生命週期可重用。
- 成本：需additive table／migration、image validation、兩個command route、attachment delete guard、bounded list hydration與component收斂；屬Medium-risk change。
- 可見行為：custom失效保持custom unavailable，不回auto；auto顯示`自訂圖片／量產預覽／研發預覽`來源，production ready出現後會自動取代RD preview；active custom附件刪除回409；reset／replace後舊圖片仍可在附件中管理。
- Rollback：關閉Part preview capability，保留setting、asset、audit與receipt；不做destructive down migration。Drawing Phase 1不受影響。
- Implementation：唯一forward artifact為`db/postgres/046_part_preview_settings.sql`與SQLite同名marker；image decoder是direct pinned `sharp@0.35.3`，不是Next transitive dependency。Exact file/command authority見SPEC §0.16.12～0.16.17。

## Evolution and retirement

- 若未來要從既有附件挑圖、支援多張相簿、GC、export或外部API，必須另開phase；不得偷改setting為多active pointer。
- `preview3dByRowKey` 在Phase 2 implementation中由neutral `previewByRowKey` 原子取代；current callers與tests同切片遷移，不保留雙DTO authority。
- 本ADR只治理durable source authority。Shared component的檔名與composition可在不改責任邊界下重構，不需另開ADR。

## Implementation evidence（2026-08-24）

- Decision已由`part_preview_settings`、PostgreSQL 046／SQLite marker、same-company/custom-pointer triggers、active soft-delete guard、best-available `PartPreviewResolver`與shared preview components實作；Drawing compatibility adapter保持thin，Part mutation集中於source control。Resolver沒有保存RD branch preference，也沒有新增Part專用preview元件。
- Local evidence：contract `28/28`、SQLite focused `30/30`、Chromium `112` checks、Part list query `0/1/20/50 = 2/7/7/7` statements、detail `13`，feature-off rollback通過；A0005-P01在四viewport均顯示`研發預覽 · A0005-M01 · 0.1`，P0/P1=0。
- PostgreSQL shadow未配置，provider runner依ADR fail closed為`BLOCKED`且`productionWrites=false`。這不推翻decision或本機RD完成，但阻止capability activation、PostgreSQL parity與production release宣告。
- 完整歸因、hash與regression disposition見`.ai-doc/qc/qc-dev-065-part-preview-local-execution-2026-08-24.md`。
