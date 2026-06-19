# AI_PDM 檔案儲存成本控管開發計畫 - 2026-06-10

關聯建議任務：`DEV-STORAGE-COST-001`  
文件類型：PM-dev 開發計畫 / Storage follow-up  
狀態：`In Progress`，Phase 0A 本機 storage inventory / cost report、Phase 1A local `FileStorageService`、Phase 1B 下載/預覽/發行包來源檔讀取 boundary、Phase 1C release package zip / master attachment boundary、Phase 2A metadata normalization model、Phase 2B duplicate / orphan / hash mismatch audit、Phase 3A migration dry-run、Phase 3B provider registry / Supabase adapter contract、Phase 3C download access / signed URL policy contract、Phase 3D authenticated route storage access audit、Phase 3E public share package access audit、Phase 4A egress analytics report、Phase 4B monthly PM/QC evidence generator、Phase 4C scheduled evidence runner、Phase 4D dashboard / notification evidence source、Phase 4E dashboard storage evidence panel、Phase 4F archive restore drill、Phase 4G migration runbook package、Phase 4H controlled migration execution gate、Phase 4I S3-compatible dry-run / adapter contract、Phase 4J lifecycle policy dry-run、Phase 4K metadata model blueprint / QC、Phase 4L dedup reference dry-run、Phase 4M runtime upload policy gate、Phase 4N large-file decision gate、Phase 4O controlled Admin upload override gate、Phase 4P alternate large-file intake package、Phase 4Q external large-file registration contract、Phase 4R schema migration proposal package、Phase 4S disposable schema apply gate、Phase 4T read-only schema verify gate、Phase 4U schema promotion evidence gate、Phase 4V Supabase advisor evidence normalizer、Phase 4W known Supabase target denylist、Phase 4X Supabase target readiness gate、Phase 4Y target readiness handoff package、Phase 4Z target cost confirmation package、Phase 5A formal migration review package、Phase 5B actual target provisioning evidence、Phase 5C user cost confirmation evidence gate、Phase 5D actual blocked confirmation evidence folder、Phase 5E Supabase target create request gate、Phase 5F target create result evidence gate、Phase 5G connector receipt evidence gate、Phase 5H formal review provisioning-result integration、Phase 5I target provisioning execution package、Phase 5J forced RLS hardening 已啟動  
制定日期：2026-06-10  
適用範圍：AI_PDM 檔案本體、附件、預覽檔、發行包與未來 Supabase Storage / S3-compatible storage / NAS gateway 的可替換架構

## 1. PM 結論

AI_PDM 檔案儲存策略採用「資料庫管 metadata，檔案本體走可替換 storage provider」。

初期仍可使用 Supabase Storage 加速上線，但程式架構不可把 Supabase bucket / path 寫死在各處。系統必須把檔案儲存抽成 server-side storage service，讓未來在檔案量或 egress 費用過高時，可以把檔案搬到 Cloudflare R2、AWS S3、Backblaze B2、Wasabi、公司 NAS gateway 或其他 S3-compatible provider，而不重寫 PDM 的送審、預覽、下載、發行與稽核流程。

本計畫不併入 `DEV-SUPABASE-DB-001`。資料庫 runtime 仍先完成；Storage follow-up 只在 DB runtime 穩定後進入實作，避免 DB cutover 與檔案搬遷風險互相干擾。

## 2. 成本基準與觸發條件

截至 2026-06-10，Supabase 官方文件顯示 Pro / Team 的 Storage quota 都是 100 GB，超出後以每 GB/月計費；Pro / Team 的 egress quota 都是 250 GB，超出後以每 GB 計費。實際單價會變，實作前必須重新查 Supabase 官方 pricing。

主要成本來源分成兩種：

| 成本類型 | PDM 風險 | 控制方向 |
|---|---|---|
| Storage size | CAD、PDF、DWG、發行包、舊版檔案長期累積 | 去重、版次保留規則、熱/溫/冷分層、封存 |
| Egress | 多人重複下載原始 CAD、大型發行包、供應商公開分享 | 預覽優先、CDN cache、signed URL TTL、下載審計、內網快取 |

建議觸發條件：

- Storage 超過 100 GB 前完成 provider abstraction。
- 月 egress 連續兩個月超過 150 GB 時啟用下載與預覽治理。
- Storage 超過 500 GB 或月 egress 超過 250 GB 時評估 R2 / S3 / B2 / Wasabi / NAS 分層。
- 單一專案發行包超過 5 GB 或單檔超過 500 MB 時啟用大檔流程，不走一般附件流程。

## 3. 現有系統基準

目前 codebase 已有幾個可利用的基礎：

- `src/lib/file-store.ts` 使用 `PDM_REPOSITORY_DIR` 儲存本機上傳檔，並已計算 SHA-256 與 file size。
- `submission_files` 已保存 `local_path`、`sha256`、`file_size`、`gdrive_status`。
- `file_assets` 已有 `storage_provider`、`original_path`、`storage_key`、`content_hash`、`sync_status` 等欄位。
- 現有 schema 的 `file_assets.storage_provider` 只有 `j_drive`、`supabase_storage`、`external`，若未來要明確區分 `r2`、`s3`、`b2`、`wasabi`、`nas_gateway`，需透過新 provider table 或 migration 擴充 constraint。
- 目前發行包與下載仍偏向 local repository path，因此 Storage follow-up 的第一步不是搬檔，而是抽象與 metadata 正規化。

## 4. 目標架構

```text
Browser / SolidWorks Add-in
  -> Next.js Server API
  -> File domain service
  -> FileStorageService interface
  -> provider adapter:
       local_repository
       supabase_storage
       s3_compatible
       nas_gateway
  -> metadata in Postgres:
       submission_files
       file_assets
       file_object_versions
       storage_objects
       storage_access_logs
```

核心原則：

- Browser 不直接持有 storage secret。
- 所有 upload / download / preview / public share 都走 server API。
- 所有敏感 PDM 檔案預設 private。
- 下載使用短效 signed URL 或 server-streaming，由權限與 audit gate 控制。
- DB 只保存 metadata、hash、provider、object key、版本、生命週期狀態。
- 檔案 provider 可以搬遷，PDM business ID、submission ID、part number、drawing number 不跟 provider 綁死。

## 5. 開發分期

### Phase 0 - Storage Baseline and Cost Dashboard

目標：先知道檔案量、流量、重複率與成長速度。

交付：

- 建立 storage inventory report：依 provider、bucket/path、檔案類型、版本狀態、專案、年月統計。
- 建立 duplicate hash report：用 SHA-256 找出可去重候選。
- 建立 egress risk report：列出大檔下載、public share、發行包下載、預覽命中率。
- 在 PM 文件中定義成本門檻與升級策略。

Gate：

- 可以輸出目前 Storage size、file count、duplicate candidate size、top 20 large files。
- 報告不包含 secret、不輸出 signed URL。
- report 可在 local provider 與未來 Supabase provider 下使用。

### Phase 1 - FileStorageService Interface

目標：讓檔案儲存從 `local_path` 寫死模式改為 provider-neutral service。

交付：

- 新增 `FileStorageService` interface：
  - `putObject`
  - `getObjectMetadata`
  - `createDownloadUrl`
  - `createPreviewUrl`
  - `streamObject`
  - `deleteObject`
  - `moveObject`
  - `copyObject`
  - `verifyObjectHash`
- 建立 `LocalRepositoryStorageAdapter`，包住現有 `PDM_REPOSITORY_DIR` 行為。
- 建立 provider registry，透過 server-side config 選擇 provider。
- 不改前端行為，不改既有 API response shape。

Gate：

- 現有上傳、預覽、下載、發行包流程仍可用。
- 沒有 route 直接依賴 storage secret。
- static QC 會阻擋新增 route 直接讀寫任意 filesystem path。

### Phase 2 - Metadata Normalization and Deduplication

目標：讓檔案 metadata 足以支持搬遷、去重、版本保留與封存。

交付：

- 正規化檔案 metadata：provider、bucket、object key、content hash、size、mime、version、lifecycle tier。
- 設計 `storage_objects` 或等效表，讓多個 business records 可以引用同一個 physical object。
- 將 `submission_files` 與 `file_assets` 的 metadata 對齊。
- 新增 duplicate hash lookup，上傳相同檔案時建立 reference，不重複存 blob。
- 保留「同檔案不同業務關聯」的 audit trail。

Gate：

- 相同 SHA-256 的檔案不會重複寫入 physical storage，除非設定明確要求保留副本。
- 發行版、草稿版、預覽衍生檔可被分別標示。
- 缺檔、hash mismatch、orphan metadata 都會被 QC report 找出。

### Phase 3 - Supabase Storage Adapter

目標：在 DB runtime 穩定後，建立 Supabase Storage 的正式 private bucket flow。

交付：

- private bucket design：`pdm-hot`、`pdm-preview`、`pdm-release` 或等效分區。
- server-side upload flow。
- signed download URL 與 content-disposition 控制。
- preview file policy：PDF / image preview 優先，原始 CAD 不自動下載。
- bucket upload size limit。
- Supabase Storage usage report。

Gate：

- Engineer / Manager / Manufacturing / Procurement / supplier share 的下載權限與現有流程一致。
- signed URL TTL 有預設上限。
- 大檔下載會寫入 audit。
- public bucket 不存放機密 PDM 原始檔。

### Phase 4 - Cost Controls and Lifecycle Rules

目標：讓成本不靠人工記憶，而是由系統規則限制。

交付：

- 檔案大小限制與 role-based override。
- 熱/溫/冷生命週期規則：
  - hot：目前版本、最近 6-12 個月、常用預覽。
  - warm：舊版但仍可能查閱。
  - cold：結案、稽核留存、低頻下載。
- 草稿保留規則：只保留最近 N 版或 N 個月，正式發行版永久或依法規保留。
- 衍生檔重建策略：縮圖、預覽 PDF、轉檔產物可以刪除後重建。
- 成本警示：到 70%、90%、100% 門檻時通知 Admin / PM。

Gate：

- 不會自動刪除 Released official files。
- 草稿刪除或封存前有可審計紀錄。
- 成本警示不阻塞一般作業，但會阻擋超大檔上傳或要求 Admin override。

### Phase 5 - External S3-Compatible Provider Adapter

目標：讓未來可以搬離或分流 Supabase Storage，降低容量或 egress 成本。

候選 provider：

- Cloudflare R2：適合大量下載或供應商分享場景。
- AWS S3：適合成熟 lifecycle、Glacier 封存與企業治理。
- Backblaze B2 / Wasabi：適合低成本容量與封存。
- NAS gateway：適合廠內高頻 CAD 讀取與內網快取。

交付：

- `S3CompatibleStorageAdapter`。
- provider config 不進 frontend bundle。
- migration dry-run：列出要搬的 object、hash、size、target key，不直接搬。
- migration execute：搬遷後 verify hash，再切 metadata pointer。
- rollback：metadata pointer 可切回原 provider。

Gate：

- 同一份業務檔案可從 Supabase Storage 搬到外部 provider 而不改 submission ID。
- 搬遷過程中不產生 orphan metadata。
- 搬遷失敗不會刪除原始檔。

### Phase 6 - Archive and Restore Drill

目標：證明封存後仍能在需要時找回、驗證與下載。

交付：

- cold archive policy。
- restore request workflow。
- restore drill runbook。
- checksum verification。
- archived object access audit。

Gate：

- 從 cold storage restore 後 SHA-256 一致。
- restore 後能重新產生 signed URL 或 server-streaming download。
- restore action 有 requester、approver、reason、timestamp、object id。

## 6. RD 任務拆解

| 順序 | 開發點 | 產出 | 父交付點 |
|---|---|---|---|
| 1 | Storage inventory report | 統計容量、重複率、top large files、egress risk | DEV-STORAGE-COST-001 |
| 2 | FileStorageService interface | provider-neutral service 與 local adapter | DEV-STORAGE-COST-001 |
| 3 | Metadata normalization | `storage_objects` 或等效 metadata model | DEV-STORAGE-COST-001 |
| 4 | Deduplication | SHA-256 duplicate reference flow | DEV-STORAGE-COST-001 |
| 5 | Supabase adapter | private bucket、signed URL、server API | DEV-STORAGE-COST-001 |
| 6 | Cost controls | upload limit、retention、lifecycle、alert | DEV-STORAGE-COST-001 |
| 7 | S3-compatible adapter | R2/S3/B2/Wasabi/NAS gateway 抽象 | DEV-STORAGE-COST-001 |
| 8 | Migration tooling | dry-run、execute、verify、rollback | DEV-STORAGE-COST-001 |
| 9 | Archive drill | cold restore、checksum、audit evidence | DEV-STORAGE-COST-001 |

## 7. QA 驗證計畫

QA 要驗證使用者流程與風險，不只驗證 adapter 存在。

必測情境：

- Engineer 上傳 CAD / PDF / DWG 後，submission detail 可正常顯示 metadata。
- PDF 預覽不下載原始 CAD。
- Manufacturing / Procurement 只能下載已授權的 released files。
- supplier share 只能存取被分享的 release package 或指定檔案。
- 大檔超過門檻時被阻擋或要求 Admin override；目前已完成 runtime upload-size gate、large-file decision gate、controlled Admin upload override gate、alternate large-file intake package、external large-file registration contract 與 schema migration proposal package，正式 alternate large-file executor 仍待後續。
- 重複檔案上傳時不重複存 physical object，但兩個業務關聯都保留。
- 檔案搬遷 provider 後，原有 submission / drawing / part / BOM 連結不變。
- hash mismatch 時 UI 不顯示為正常可下載。
- cold archive restore 後可驗證 hash 並下載。

## 8. QC 驗收標準

QC 必須留下事實證據。

最低 gate：

- TypeScript pass。
- lint pass。
- build pass。
- file storage static QC pass。
- API regression pass。
- provider contract tests pass。
- metadata orphan / missing file / hash mismatch report pass。
- migration dry-run 不執行刪除。
- migration execute 在測試 provider 上完成 hash verification。

建議新增 scripts：

- `npm.cmd run qc:file-storage-contract`
- `npm.cmd run qc:file-storage-metadata`
- `npm.cmd run qc:file-storage-dedup-reference`
- `npm.cmd run qc:file-storage-upload-policy`
- `npm.cmd run qc:file-storage-cost-report`
- `npm.cmd run qc:file-storage-migration-dry-run`
- `npm.cmd run qc:file-storage-archive-restore`

## 9. 風險與控制

| 風險 | 影響 | 控制方式 |
|---|---|---|
| Storage provider 寫死 | 未來無法降成本 | 先做 `FileStorageService`，route 不直接碰 provider SDK |
| 大檔下載造成 egress 爆量 | 月費不可控 | preview 優先、signed URL TTL、download audit、內網快取 |
| 重複檔案堆積 | storage size 增長過快 | SHA-256 去重與 duplicate report |
| 草稿永久保存 | 歷史垃圾檔累積 | 草稿保留規則與 released file 保護 |
| 外部 provider 搬遷失敗 | 缺檔或 metadata 指錯 | dry-run、hash verify、metadata pointer rollback |
| public bucket 誤放機密圖檔 | 資安事故 | private bucket only，public share 走受控 token |
| 刪除衍生檔後無法重建 | 預覽失效 | 衍生檔必須有 source object 與生成規則 |
| NAS gateway 與雲端不同步 | 現場看到舊檔 | checksum、sync status、最後驗證時間與衝突報告 |

## 10. 不在本計畫第一版範圍

- 不做完整 PLM / CAD vault lock-in。
- 不做 CAD 原生 diff。
- 不做大規模歷史檔案搬遷，除非先完成 inventory 與 dry-run。
- 不把 browser 直接接到 S3 / Supabase secret。
- 不把 Supabase Storage 當唯一永久架構。
- 不在 `DEV-SUPABASE-DB-001` 未完成前強行 production storage cutover。

## 11. 完成定義

`DEV-STORAGE-COST-001` 完成條件：

- 現有 local repository provider 透過 `FileStorageService` 運作。
- Supabase Storage adapter 可在 staging private bucket 完成 upload / preview / download。
- 至少一個 S3-compatible external provider adapter 完成測試或 dry-run。
- metadata 支援 provider、bucket/key、hash、size、lifecycle tier、dedup reference。
- storage inventory、cost report、duplicate report 可執行。
- lifecycle / retention / upload size policy 有 Admin 可治理的設定或文件。
- migration dry-run、execute、verify、rollback path 有 QC 證據。
- released files 不會被草稿清理規則誤刪。
- PM / RD / QA / QC evidence 已更新。

## 12. 2026-06-10 Phase 0A 開發證據

本輪已完成 Storage follow-up 的安全前置切片，沒有搬檔、沒有刪檔、沒有建立 Supabase bucket、沒有切換 provider。

交付：

- 新增 `scripts/generate-file-storage-cost-report.mjs`。
- 新增 `scripts/qc-file-storage-cost-report.mjs`。
- 新增 `npm.cmd run storage:cost-report`。
- 新增 `npm.cmd run qc:file-storage-cost-report`。

報表能力：

- 讀取 `submission_files`、`release_packages`、`file_assets` metadata。
- 掃描 `PDM_REPOSITORY_DIR` 或預設 `data/repository`。
- 統計 provider、source、extension、business status、top large objects。
- 依 SHA-256 / content hash 找 duplicate candidate 與 estimated recoverable bytes。
- 偵測 local repository metadata 缺檔與 out-of-repository path。
- 輸出 configured quota 使用率，預設以 100 GB storage included、250 GB egress included 作為估算門檻；實作前仍需重新確認 Supabase 官方 pricing。

本機實際結果：

- `node scripts/generate-file-storage-cost-report.mjs` 通過。
- 目前 `data/ai-pdm.sqlite` 存在，`data/repository` 存在。
- 目前 metadata file count 為 0，repository scanned file count 為 0。
- 報表建議：目前沒有檔案 inventory，Storage follow-up 可維持 Backlog / In Progress 前置狀態，等真實 PDM 上傳資料存在後再推進 provider cutover。

驗證：

- `npm.cmd run qc:file-storage-cost-report`：12/12 pass。
- `node --check scripts/generate-file-storage-cost-report.mjs`：pass。
- `node --check scripts/qc-file-storage-cost-report.mjs`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run lint -- --quiet`：pass。

## 13. 2026-06-10 Phase 1A 開發證據

本輪已建立第一版 provider boundary，但仍維持 local repository 行為不變。

交付：

- 新增 `src/lib/file-storage.ts`。
- 建立 `FileStorageService` interface。
- 建立 `LocalRepositoryStorageAdapter`。
- 建立 `buildStorageKey`、`sha256` 與 repository root boundary guard。
- 更新 `src/lib/file-store.ts`，讓 `saveUploadedFiles` 透過 `createFileStorageService().putObject(...)` 寫入檔案。
- 新增 `scripts/qc-file-storage-contract.mjs`。
- 新增 `npm.cmd run qc:file-storage-contract`。

保留行為：

- 預設 provider 仍是 `local_repository`。
- 上傳檔案仍寫入 `PDM_REPOSITORY_DIR` 或預設 `data/repository`。
- `submission_files.local_path`、`sha256`、`file_size` 回填格式維持既有流程可用。
- 未建立 Supabase bucket、未導入外部 provider、未搬檔、未刪檔。

驗證：

- `npm.cmd run qc:file-storage-contract`：12/12 pass。
- `npm.cmd run qc:file-storage-cost-report`：12/12 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，保留既有 Turbopack NFT warning；最新 trace 以 Phase 1C 驗證結果為準。
- `npm.cmd run storage:cost-report`：pass，目前 metadata file count 0，repository scanned file count 0。

## 14. 2026-06-10 Phase 1B 開發證據

本輪將既有讀取路徑接到 local storage service，仍未啟動任何雲端 storage provider。

交付：

- `src/lib/file-storage.ts` 新增 `storageKeyFromLocalPath(...)`，作為舊 `local_path` metadata 到 provider key 的過渡橋接。
- `src/lib/file-response.ts` 改為用 `createFileStorageService().readObject(storageKey)` 讀取下載 / PDF 預覽檔案，不再直接 import `fs/promises`。
- `src/lib/release-package-async.ts` 改為用 `FileStorageService` 讀取 submission source files，並用 shared `sha256(...)` 驗證 hash。
- `src/lib/release-package.ts` 同步改為用 `FileStorageService` 讀取 submission source files，避免 legacy sync release package 路徑語意分叉。
- `scripts/qc-file-storage-contract.mjs` 擴充至 19 項，覆蓋 file-response 與 release package 讀取路徑。

保留行為：

- 下載與 PDF 預覽的 response header 行為不變。
- `release_packages.local_path` 與 zip 輸出仍在 `data/release-packages`，本切片只抽象 release package 建立時的來源檔讀取。
- default provider 仍是 `local_repository`。
- 沒有 Supabase bucket、沒有外部 provider、沒有搬檔、沒有刪檔。

驗證：

- `npm.cmd run qc:file-storage-contract`：19/19 pass。
- `npm.cmd run qc:file-storage-cost-report`：12/12 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，保留既有 Turbopack NFT warning；最新 trace 以 Phase 1C 驗證結果為準。
- `npm.cmd run storage:cost-report`：pass，目前 metadata file count 0，repository scanned file count 0。

## 15. 2026-06-10 Phase 1C 開發證據

本輪補齊 release package zip 本體與 master attachment 的 local storage service 邊界，仍未啟動任何雲端 storage provider。

交付：

- `src/lib/file-storage.ts` 新增 `createReleasePackageStorageService(...)` 與 `getReleasePackageRoot(...)`，讓 release package zip 使用獨立 root 的 local adapter。
- `src/lib/release-package.ts` 與 `src/lib/release-package-async.ts` 改為用 `packageStorage.putObject(...)` 寫入 release package zip，保留 `release_packages.local_path` 欄位相容性。
- `src/lib/release-package-file.ts` 改為用 `createReleasePackageStorageService().readObject(storageKey)` 讀取 release package zip。
- `src/lib/repositories/master-attachment-repository.ts` 改為用 `createFileStorageService().putObject(...)` / `readObject(...)` 處理 master attachment，並改用 shared `sha256(...)`；`original_path` 保留給既有 Google Drive sync。
- `scripts/qc-file-storage-contract.mjs` 擴充至 29 項，覆蓋 upload、file response、release package source reads、release package zip body reads/writes、master attachment reads/writes。

保留行為：

- default provider 仍是 `local_repository`。
- release package zip 仍落在 `data/release-packages`。
- master attachment 仍落在 `PDM_REPOSITORY_DIR` / `data/repository`。
- Google Drive sync 仍使用既有 `original_path` 相容路徑。
- 沒有 Supabase bucket、沒有外部 provider、沒有搬檔、沒有刪檔、沒有 production cutover。

驗證：

- `npm.cmd run qc:file-storage-contract`：29/29 pass。
- `npm.cmd run qc:file-storage-cost-report`：12/12 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，目前 import trace 指向 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。
- `npm.cmd run storage:cost-report`：pass，目前 metadata file count 0，repository scanned file count 0。

## 16. 2026-06-10 Phase 2A 開發證據

本輪先建立 read-only metadata normalization model，不直接改 DB schema，避免和 `DEV-SUPABASE-DB-001` 的 runtime migration 混線。

交付：

- `scripts/storage-metadata-normalizer.mjs` 新增共用 normalizer，將 `submission_files`、`release_packages`、`file_assets` 正規化為同一種 storage object descriptor。
- descriptor 目前包含 `source`、`provider`、`lifecycleTier`、`linkedEntityType`、`linkedEntityId`、`filename`、`extension`、`bytes`、`hash`、`hashAlgorithm`、`storageKey`、`localPath`、`localRoot`。
- `scripts/generate-file-storage-cost-report.mjs` 改用 normalizer，並新增 `metadata.byLifecycleTier`。
- `scripts/qc-file-storage-cost-report.mjs` fixture 改為將 release package zip 放在 `data/release-packages`，並驗證 release package storage key 是以 release package root 正規化。

保留行為：

- 尚未建立 `storage_objects` table。
- 尚未修改 `submission_files`、`release_packages`、`file_assets` schema。
- 沒有 DB row mutation、沒有搬檔、沒有刪檔、沒有 provider pointer 改寫。

驗證：

- `npm.cmd run qc:file-storage-cost-report`：14/14 pass。
- `npm.cmd run qc:file-storage-contract`：29/29 pass。
- `node --check scripts/storage-metadata-normalizer.mjs`：pass。
- `node --check scripts/generate-file-storage-cost-report.mjs`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，目前 import trace 指向 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。
- `npm.cmd run storage:cost-report`：pass，目前 metadata file count 0，repository scanned file count 0。

## 17. 2026-06-10 Phase 2B 開發證據

本輪補齊 migration 前必須有的 read-only local object audit，不修資料、不搬檔、不清檔。

交付：

- `scripts/generate-file-storage-cost-report.mjs` 新增 `localObjectAudit`。
- audit 同時掃描 `data/repository` 與 `data/release-packages`。
- audit 會列出：
  - metadata 指到不存在或 root 外的本機物件。
  - metadata SHA-256 與實體檔案 SHA-256 不一致。
  - 本機 root 中沒有 metadata 引用的 orphan files。
  - repository / release package root 的掃描摘要。
- `thresholdUsage` 新增 `scannedLocalRootsIncludedPct`，避免只看 repository 而低估 release package zip 容量。
- recommendations 會在 hash mismatch 或 orphan files 存在時，提示 migration / lifecycle cleanup 前必須處理。

保留行為：

- 不刪 orphan file。
- 不修 hash mismatch。
- 不修改 DB metadata。
- 不執行 provider migration。
- 不改 provider pointer。

驗證：

- `npm.cmd run qc:file-storage-cost-report`：18/18 pass。
- `npm.cmd run qc:file-storage-contract`：29/29 pass。
- `node --check scripts/generate-file-storage-cost-report.mjs`：pass。
- `node --check scripts/qc-file-storage-cost-report.mjs`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，目前 import trace 指向 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。
- `npm.cmd run storage:cost-report`：pass，目前 metadata file count 0，repository scanned file count 0，release package root 尚不存在。

## 18. 2026-06-10 Phase 3A 開發證據

本輪建立 migration dry-run 第一版，只輸出計畫，不搬檔、不更新 pointer。

交付：

- `scripts/generate-file-storage-migration-dry-run.mjs` 新增 read-only migration plan generator。
- `package.json` 新增 `storage:migration-dry-run`。
- dry-run 會將 metadata objects 分成：
  - `planned`：本機 provider、檔案存在、路徑在 root 內、SHA-256 一致，可列入搬遷計畫。
  - `blocked`：缺檔、路徑越界、缺 hash、SHA-256 mismatch，不能搬。
  - `skipped`：已不是 `local_repository` 的 provider，不重複搬。
- `planned` 每筆包含 source provider/key、target provider/bucket/key、bytes、sha256、lifecycle tier、action 與 pointer preview。
- target 預設為 `supabase_storage` / `pdm-hot` / `ai-pdm`，可用 `PDM_STORAGE_DRY_RUN_TARGET_PROVIDER`、`PDM_STORAGE_DRY_RUN_TARGET_BUCKET`、`PDM_STORAGE_DRY_RUN_TARGET_PREFIX` 覆寫。
- `scripts/qc-file-storage-migration-dry-run.mjs` 新增 fixture QC，覆蓋 planned / blocked / skipped、target key、pointer preview、guardrail 與 no-secret output。
- `package.json` 新增 `qc:file-storage-migration-dry-run`。

保留行為：

- 不需要 target credentials。
- 不呼叫 Supabase 或 S3 SDK。
- 不 copy file。
- 不 delete file。
- 不 update metadata pointer。
- 不建立正式 `storage_objects` schema。

驗證：

- `npm.cmd run qc:file-storage-migration-dry-run`：14/14 pass。
- `npm.cmd run qc:file-storage-cost-report`：18/18 pass。
- `npm.cmd run qc:file-storage-contract`：29/29 pass。
- `node --check scripts/generate-file-storage-migration-dry-run.mjs`：pass。
- `node --check scripts/qc-file-storage-migration-dry-run.mjs`：pass。
- `npm.cmd run storage:migration-dry-run`：pass，目前 total metadata objects 0，planned 0，blocked 0，skipped 0。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，目前 import trace 指向 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 19. 2026-06-10 Phase 3B 開發證據

本輪建立 provider registry 與 Supabase Storage adapter contract，但不連正式 bucket、不搬檔、不切 production provider。

交付：

- `src/lib/file-storage.ts` 將 `FileStorageProvider` 擴充為 `local_repository | supabase_storage`。
- 保留 `createFileStorageService()` 預設回傳 `LocalRepositoryStorageAdapter`，避免既有上傳、下載、預覽與 release package 流程突然切到雲端。
- 新增 `createConfiguredFileStorageService(...)` 與 `resolveFileStorageProvider(...)`，讓後續 staging 可用 env 顯式選 provider。
- 新增 `resolveSupabaseStorageConfig(...)`，使用 server-only `PDM_SUPABASE_URL`、`PDM_SUPABASE_SERVICE_ROLE_KEY`、`PDM_SUPABASE_STORAGE_BUCKET`，並拒絕 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`。
- 新增 `SupabaseStorageAdapter` contract，支援 private authenticated object read、non-upsert object write、provider-scoped pointer 與 hash verification。
- Supabase live IO 預設 fail-closed，必須設定 `PDM_SUPABASE_STORAGE_LIVE_ENABLED=1` 才會執行；delete 在 lifecycle / rollback gate 完成前維持 disabled。
- `scripts/qc-file-storage-contract.mjs` 擴充至 42 項，驗證 provider registry、預設 local、server-only secret guard、authenticated object path、non-upsert writes、provider pointer 與 fail-closed delete。

保留行為：

- 沒有建立 Supabase bucket。
- 沒有使用任何 Supabase credential。
- 沒有搬檔、copy、delete、metadata pointer update。
- production storage provider 仍是 local repository。

驗證：

- `npm.cmd run qc:file-storage-contract`：42/42 pass。
- `npm.cmd run qc:file-storage-cost-report`：18/18 pass。
- `npm.cmd run qc:file-storage-migration-dry-run`：14/14 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run storage:cost-report`：pass，目前 metadata count 0，repository scanned file count 0。
- `npm.cmd run storage:migration-dry-run`：pass，目前 total metadata objects 0，planned 0，blocked 0，skipped 0。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，目前 import trace 指向 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 20. 2026-06-10 Phase 3C 開發證據

本輪補齊下載 access / signed URL policy contract。這是成本治理與資安治理的必要前置：local provider 明確走 server-stream，Supabase private bucket 後續才可走短效 signed URL；所有下載 access policy 都要求 audit，但本輪尚未把 route audit log 寫入接上。

Supabase 文件依據：

- Private bucket assets 不可用 public URL 存取，只能透過 server 端簽短效 URL，或用 authenticated object URL 搭配 Authorization header。
- JavaScript reference 提供 `createSignedUrl(path, expiresIn)`，並支援 `download` option 觸發下載。

交付：

- `src/lib/file-storage.ts` 新增 `CreateDownloadUrlInput`、`DownloadUrl` 與 `FileStorageService.createDownloadUrl(...)`。
- `LocalRepositoryStorageAdapter.createDownloadUrl(...)` 回傳 `mode: "server_stream"`、`url: null`、`authorizationHeaderRequired: true`、`auditRequired: true`，維持既有 server API 下載/預覽方向。
- `SupabaseStorageAdapter.createDownloadUrl(...)` 建立 signed URL contract，回傳 `mode: "signed_url"`、`authorizationHeaderRequired: false`、`expiresAt` 與 absolute URL。
- Supabase signed URL TTL 預設 `PDM_SUPABASE_SIGNED_URL_TTL_SECONDS=300`，上限預設 `PDM_SUPABASE_SIGNED_URL_MAX_TTL_SECONDS=3600`，使用 `resolveDownloadUrlTtlSeconds(...)` clamp。
- signed URL 支援 `forceDownload` 與 filename，並容忍 Supabase response 的 `signedURL` / `signedUrl` casing。
- signed URL 產生仍受 `PDM_SUPABASE_STORAGE_LIVE_ENABLED=1` gate 保護；未設定時 fail closed。
- `scripts/qc-file-storage-contract.mjs` 擴充至 52 項，新增 download contract、server-stream、audit-required、signed URL、TTL env/default clamp、download flag、response casing 檢查。

保留行為：

- 沒有建立 Supabase bucket。
- 沒有使用 credential 或呼叫 live Supabase。
- 沒有搬檔、刪檔、改 metadata pointer。
- 尚未接 route-level download audit 寫入。

驗證：

- `npm.cmd run qc:file-storage-contract`：52/52 pass。
- `npm.cmd run qc:file-storage-cost-report`：18/18 pass。
- `npm.cmd run qc:file-storage-migration-dry-run`：14/14 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run storage:cost-report`：pass，目前 metadata count 0，repository scanned file count 0。
- `npm.cmd run storage:migration-dry-run`：pass，目前 total metadata objects 0，planned 0，blocked 0，skipped 0。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，目前 import trace 指向 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 21. 2026-06-10 Phase 3D 開發證據

本輪補齊 authenticated download route 的 storage access audit。這讓「未來改用 Supabase signed URL 或外部 provider」前，先把誰取用了哪個 storage object 的治理證據固定下來。

交付：

- 新增 `src/lib/storage-access-audit.ts`，以 `StorageAccessed` audit action 記錄 access kind、file id、filename、bytes、provider、bucket、storage key、access mode、TTL metadata、authorization header policy 與 route。
- `/api/submissions/[id]/files/[...filePath]` 在已登入檔案下載與 PDF 預覽前呼叫 `createFileStorageService().createDownloadUrl(...)`，並寫入 `submission_file` / `submission_file_preview` audit。
- `/api/submissions/[id]/release-package` 在 release package zip 下載前產生 release package storage key、呼叫 `createReleasePackageStorageService().createDownloadUrl(...)`，並寫入 `release_package` audit。
- `scripts/qc-file-storage-contract.mjs` 擴充至 66 項，新增 audit helper、route wiring、storage key propagation、signed URL value 不落 audit detail 等檢查。

保留行為：

- 現有 response 仍維持 server-streaming，未改成 redirect signed URL。
- production storage provider 仍預設 local repository。
- 沒有建立 Supabase bucket、沒有使用 credential、沒有 live Supabase request、沒有搬檔、沒有刪檔、沒有 metadata pointer update。
- audit detail 不保存 signed URL value，只保存 mode / TTL / policy metadata。
- public share / supplier share / staging private bucket live signed URL 驗證仍是後續切片。

驗證：

- `npm.cmd run qc:file-storage-contract`：66/66 pass。
- `npm.cmd run qc:file-storage-cost-report`：18/18 pass。
- `npm.cmd run qc:file-storage-migration-dry-run`：14/14 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，目前 import trace 指向 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 22. 2026-06-10 Phase 3E 開發證據

本輪補齊 public / supplier share 的發行包下載 audit。這是 egress 成本治理與外部分享資安治理的關鍵點：外部 token 存取不是登入使用者，因此 audit 必須能記錄 share scope，但不能保存 raw token。

交付：

- `src/lib/storage-access-audit.ts` 擴充 `public_share_package`、nullable `actorId`、`shareId` 與 `externalAccess` metadata。
- `/api/public/shares/[token]/package` 在發行包下載前產生 release package storage key、呼叫 `createReleasePackageStorageService().createDownloadUrl(...)`，並以 `purpose: "supplier_share"` 寫入 storage access contract。
- public share package audit 記錄 `shareId`、provider、bucket、storage key、access mode、TTL metadata、bytes、filename、route 與 external access flag。
- audit detail 不保存 raw share token，也不保存 token hash。
- `scripts/qc-file-storage-contract.mjs` 擴充至 75 項，新增 public share package kind、anonymous external actor、share scope、route wiring、supplier-share purpose、raw-token omission 與 storage key propagation 檢查。

保留行為：

- 現有 response 仍維持 server-streaming，未改成 redirect signed URL。
- production storage provider 仍預設 local repository。
- supplier response POST 不下載檔案，本輪不改。
- 沒有建立 Supabase bucket、沒有使用 credential、沒有 live Supabase request、沒有搬檔、沒有刪檔、沒有 metadata pointer update。

驗證：

- `npm.cmd run qc:file-storage-contract`：75/75 pass。
- `npm.cmd run qc:file-storage-cost-report`：18/18 pass。
- `npm.cmd run qc:file-storage-migration-dry-run`：14/14 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，目前 import trace 指向 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 23. 2026-06-10 Phase 4A 開發證據

本輪補齊 `StorageAccessed` audit 的 egress analytics。這讓 PDM 後續可以用實際下載行為判斷是否需要限流、快取、share expiry、S3-compatible provider 或 lifecycle migration，而不是只看 storage size。

交付：

- 新增 `scripts/generate-file-storage-egress-report.mjs`，讀取 `audit_logs` 中 action 為 `StorageAccessed` 的資料，輸出 read-only JSON 報表。
- 新增 `npm.cmd run storage:egress-report`。
- 報表彙總 audited egress：total bytes / GB、by access kind、by route、by provider、by access mode、external vs authenticated、by shareId、top provider-scoped objects。
- 新增 threshold usage：`PDM_EGRESS_WARNING_GB` 預設 150 GB，`PDM_EGRESS_INCLUDED_GB` 預設 250 GB。
- 新增 recommendations：無資料時 observation mode；public share 佔比過高、達警示門檻、達 included quota 70%、單一物件超過 5 GB、malformed audit row 都會提出治理建議。
- 新增 `scripts/qc-file-storage-egress-report.mjs` 與 `npm.cmd run qc:file-storage-egress-report`。

保留行為：

- 報表只讀 `audit_logs`，不讀檔案本體。
- 不呼叫 storage provider，不需要 Supabase credential。
- 不執行 migration、不搬檔、不刪檔、不改 metadata pointer。
- 報表使用白名單欄位，不輸出 signed URL、raw share token、token hash 或任意 audit detail 原文。
- 目前本機 `data/ai-pdm.sqlite` 尚無 `StorageAccessed` rows，`storage:egress-report` 會輸出 0 筆並建議 observation mode。

驗證：

- `npm.cmd run qc:file-storage-egress-report`：18/18 pass。
- `npm.cmd run qc:file-storage-contract`：75/75 pass。
- `npm.cmd run qc:file-storage-cost-report`：18/18 pass。
- `npm.cmd run qc:file-storage-migration-dry-run`：14/14 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，目前 import trace 指向 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 24. 2026-06-10 Phase 4B 開發證據

本輪把 storage cost inventory 與 `StorageAccessed` egress analytics 收斂成月度 PM/QC evidence。這讓 PDM 可以每月固定產生一份可留存的 JSON / Markdown 證據包，用來判斷是否已接近 Supabase Storage / egress 成本門檻，以及是否需要啟動 S3-compatible provider、NAS gateway、生命週期或供應商分享限流策略。

交付：

- 新增 `scripts/generate-file-storage-monthly-evidence.mjs`，整合 `buildStorageCostReport(...)` 與 `buildStorageEgressReport(...)`。
- 新增 `npm.cmd run storage:monthly-evidence`，支援 `--period YYYY-MM` 與 `--output`，輸出 `storage-monthly-evidence.json` 與 `storage-monthly-evidence.md`。
- 月報內容包含 metadata object count、storage bytes / GB、scanned local roots、duplicate recoverable bytes、missing / hash mismatch / orphan counts、audited egress、public share egress、threshold usage、migration readiness、blockers、warnings 與 recommendations。
- recommendations 會保留來源前綴：`[storage]` 與 `[egress]`，方便 PM/QC 區分容量問題與下載流量問題。
- 新增 `scripts/qc-file-storage-monthly-evidence.mjs` 與 `npm.cmd run qc:file-storage-monthly-evidence`。

防護邊界：

- 月報只讀取本機 DB / metadata report / audit report，不執行 provider migration。
- 不刪檔、不改 metadata pointer、不建立 bucket、不呼叫 Supabase 或外部 S3 provider。
- 不輸出 signed URL value、raw share token 或 token hash。
- 未來正式採購或升級方案前仍需重新確認 Supabase / external provider pricing。

驗證：

- `npm.cmd run qc:file-storage-monthly-evidence`：15/15 pass。
- `node --check scripts/generate-file-storage-monthly-evidence.mjs`：pass。
- `node --check scripts/qc-file-storage-monthly-evidence.mjs`：pass。
- `npm.cmd run storage:monthly-evidence -- --period 2026-06 --output <temp>`：pass，成功寫出 JSON / Markdown。
- `npm.cmd run qc:file-storage-egress-report`：18/18 pass。
- `npm.cmd run qc:file-storage-cost-report`：18/18 pass。
- `npm.cmd run qc:file-storage-contract`：75/75 pass。
- `npm.cmd run qc:file-storage-migration-dry-run`：14/14 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 25. 2026-06-10 Phase 4C 開發證據

本輪把月度 storage evidence 從「手動產報表」推進成「可排程執行」。這是成本控管閉環的必要中介層：排程不應直接讀取大量檔案或呼叫 provider，而是執行一個穩定 runner，留下 run manifest、latest manifest 與可被 CI / Task Scheduler 解讀的 exit policy。

交付：

- 新增 `scripts/run-file-storage-monthly-evidence-schedule.mjs`，包裝既有 monthly evidence generator。
- 新增 `npm.cmd run storage:monthly-evidence:scheduled`，支援 `--period`、`--output`、`--latest-output`、`--no-latest`、`--fail-on-blocker`、`--fail-on-warning`。
- scheduled runner 會產出 `storage-monthly-evidence.json`、`storage-monthly-evidence.md`、`storage-monthly-evidence-run.json`，並可寫出 latest manifest pointer。
- run manifest 記錄 `status`、`suggestedExitCode`、summary、readiness、threshold usage、PM/QC commands 與 guardrails，但不複製完整 cost / egress report payload。
- 新增 `scripts/install-storage-monthly-evidence-task.ps1` 與 `npm.cmd run storage:monthly-evidence:install-task`，可在 Windows 註冊每月 1 日執行的 Scheduled Task。
- 新增 `scripts/qc-file-storage-monthly-evidence-schedule.mjs` 與 `npm.cmd run qc:file-storage-monthly-evidence-schedule`。

防護邊界：

- 排程 runner 仍只讀取 evidence / DB / audit 資料，不做 provider migration。
- 不刪檔、不改 pointer、不建立 bucket、不呼叫 Supabase 或 S3-compatible provider。
- 不輸出 signed URL value、raw share token 或 token hash。
- `--fail-on-blocker` / `--fail-on-warning` 只改變 exit policy，不改變資料或 storage provider。

驗證：

- `npm.cmd run qc:file-storage-monthly-evidence-schedule`：13/13 pass。
- `node --check scripts/run-file-storage-monthly-evidence-schedule.mjs`：pass。
- `node --check scripts/qc-file-storage-monthly-evidence-schedule.mjs`：pass。
- `npm.cmd run storage:monthly-evidence:scheduled -- --period 2026-06 --output <temp> --latest-output <temp>`：pass，成功寫出 evidence / run / latest manifests。
- 本機 CLI 實跑狀態為 `warning`，原因是目前本機 DB 尚無真實 `StorageAccessed` rows；預設 exit code 仍為 0，避免排程因 observation mode 中斷。

## 26. 2026-06-11 Phase 4D 開發證據

本輪把 scheduled monthly evidence 的 latest manifest 接成 server-side dashboard source，並接入通知中心。這讓 dashboard / notification 不需要直接掃描檔案或讀完整 evidence payload，只消費受控 summary。

交付：

- 新增 `src/lib/storage-evidence-dashboard.ts`，讀取 `latest-storage-monthly-evidence-run.json` 或 `PDM_STORAGE_EVIDENCE_LATEST_MANIFEST` 指定路徑。
- 新增 `/api/storage/evidence`，限定 `Admin` / `R&D Manager` 讀取 storage evidence dashboard summary。
- dashboard summary 僅輸出 status、severity、summary、readiness、threshold usage、recommendation count、next actions 與 evidence file pointers；不輸出完整 `costReport` / `egressReport` payload。
- `/api/notifications` 會對 `Admin` / `R&D Manager` 加入 `storage_evidence_alert`，把 blocked / warning / missing storage evidence 轉為通知中心項目。
- `Engineer` 不接收平台級 storage cost alert，避免把成本治理訊息推給一般送審者。
- 新增 `scripts/qc-file-storage-evidence-dashboard.mjs` 與 `npm.cmd run qc:file-storage-evidence-dashboard`。

防護邊界：

- dashboard / notification source 不執行 report generation，不啟動 provider migration。
- 不刪檔、不改 pointer、不建立 bucket、不呼叫 Supabase / S3 provider。
- 不輸出 signed URL value、raw share token 或 token hash。
- latest manifest 缺失時回傳 controlled empty state，提示先跑 `storage:monthly-evidence:scheduled`。

驗證：

- `npm.cmd run qc:file-storage-evidence-dashboard`：13/13 pass。
- `node --check scripts/qc-file-storage-evidence-dashboard.mjs`：pass。
- `npx.cmd tsc --noEmit`：pass。

## 27. 2026-06-11 Phase 4E 開發證據

本輪把 storage evidence 從 API / notification source 推進到首頁管理工作台 panel。目標不是做新的 storage 掃描，而是讓 `Admin` 與 `R&D Manager` 在日常 PDM 首頁就能看到 monthly evidence 狀態、容量/egress 摘要、阻塞項與下一步。

交付：

- 在 `src/components/dashboard.tsx` 新增 `Storage Evidence` panel，透過 `/api/storage/evidence` 讀取已 redacted 的 dashboard summary。
- panel 只在 `canReview` 角色範圍顯示，也就是 `Admin` / `R&D Manager`；`Engineer` 不會看到平台級成本治理 panel。
- panel 顯示 storage GB、audited egress GB、blockers、warnings、threshold usage、duplicate recoverable bytes、object count、missing local、hash mismatch、public share egress 與 primary next action。
- 在首頁刷新動作中同步 reload storage evidence，並提供 panel 內的 refresh icon button。
- 在 `src/app/globals.css` 補上緊湊、可換行、mobile 單欄的 storage evidence panel 樣式。
- 擴充 `scripts/qc-file-storage-evidence-dashboard.mjs`，由 13 個檢查增加到 17 個檢查，覆蓋 dashboard UI wiring、manager/admin scope、完整 payload 不進前端、raw token / signed URL field 不進前端。

防護邊界：

- 前端只消費 `/api/storage/evidence` 的 redacted summary，不匯入完整 `costReport` / `egressReport` payload。
- 不輸出 `rawToken`、`signedUrl`、raw share token、token hash 或 signed URL value。
- 不執行 report generation，不啟動 provider migration，不刪檔、不改 pointer、不建立 bucket、不呼叫 Supabase / S3 provider。

驗證：

- `npm.cmd run qc:file-storage-evidence-dashboard`：17/17 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。
- Storage regression gates：`qc:file-storage-monthly-evidence-schedule` 13/13、`qc:file-storage-monthly-evidence` 15/15、`qc:file-storage-egress-report` 18/18、`qc:file-storage-cost-report` 18/18、`qc:file-storage-contract` 75/75、`qc:file-storage-migration-dry-run` 14/14、`qc:doc-paths` 23/23。
- Playwright smoke：以 `manager@example.com` 登入，1440x1000 與 390x920 都可見 `.storage-evidence-panel`，且沒有 horizontal overflow；截圖位於 `%TEMP%\ai-pdm-storage-evidence-desktop.png` 與 `%TEMP%\ai-pdm-storage-evidence-mobile.png`。

## 28. 2026-06-11 Phase 4F 開發證據

本輪補上 archive restore drill。這不是正式 provider cutover，也不是把資料還原到 production，而是用現有 storage metadata 證明：可驗證的本機 storage object 可以被複製到隔離 restore target，並以 SHA-256 證明還原後內容一致。

交付：

- 新增 `scripts/generate-file-storage-archive-restore-drill.mjs`。
- 新增 `npm.cmd run storage:archive-restore-drill`；可用 `--output <dir>` 寫出 `storage-archive-restore-drill.json`、`storage-archive-restore-drill.md` 與 isolated restore target。
- restore drill 會讀取 normalized storage metadata，僅處理 `local_repository` 物件；remote provider 物件會列為 skipped。
- restore drill 對 missing local object、SHA-256 mismatch、out-of-root path、missing hash 會列為 blocked。
- 新增 `scripts/qc-file-storage-archive-restore.mjs` 與 `npm.cmd run qc:file-storage-archive-restore`。

防護邊界：

- 不執行 provider migration，不改 metadata pointer，不刪 source file。
- 不建立 bucket、不呼叫 Supabase / S3-compatible provider、不需要 provider credential。
- restore target 是 isolated target，不是 production repository。
- 不輸出 cloud secret marker、signed URL value、raw share token 或 service role key。

驗證：

- `npm.cmd run qc:file-storage-archive-restore`：15/15 pass。
- `npm.cmd run storage:archive-restore-drill -- --output <temp>`：pass，成功寫出 JSON / Markdown；目前本機 DB 尚無 storage metadata object，因此 live local summary restored 0 objects。
- `node --check scripts/generate-file-storage-archive-restore-drill.mjs`、`node --check scripts/qc-file-storage-archive-restore.mjs`：pass。
- Storage regression gates：`qc:file-storage-evidence-dashboard` 17/17、`qc:file-storage-monthly-evidence-schedule` 13/13、`qc:file-storage-monthly-evidence` 15/15、`qc:file-storage-egress-report` 18/18、`qc:file-storage-cost-report` 18/18、`qc:file-storage-contract` 75/75、`qc:file-storage-migration-dry-run` 14/14、`qc:doc-paths` 23/23。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 29. 2026-06-11 Phase 4G 開發證據

本輪補上 migration runbook package。這不是正式 provider migration，也不會把檔案搬到 Supabase / S3-compatible provider；它把既有 dry-run evidence 包裝成可審核的 execute / verify / rollback 套件，讓未來實際搬檔前先有批次、hash 驗證與 pointer rollback 計畫。

交付：

- 新增 `scripts/generate-file-storage-migration-runbook.mjs`。
- 新增 `npm.cmd run storage:migration-runbook`；可用 `--output <dir>` 寫出 `storage-migration-runbook.json`、`storage-migration-runbook.md` 與 `storage-migration-pointer-rollback-plan.json`。
- runbook 會嵌入 source dry-run summary、readiness gate、execute checklist、verify checklist、rollback checklist、planned batches 與 pointer rollback plan。
- 新增 `scripts/qc-file-storage-migration-runbook.mjs` 與 `npm.cmd run qc:file-storage-migration-runbook`。

防護邊界：

- 不執行 provider migration，不複製檔案，不刪檔，不改 metadata pointer。
- 不建立 bucket、不呼叫 Supabase / S3-compatible provider、不需要 provider credential。
- runbook 只宣告 live execution 需要 server-only credential 與明確 approval；credential 不會寫入輸出。
- pointer 只有 rollback plan 與 proposed target key，不做實際切換。

驗證：

- `node --check scripts/generate-file-storage-migration-runbook.mjs`、`node --check scripts/qc-file-storage-migration-runbook.mjs`：pass。
- `npm.cmd run qc:file-storage-migration-runbook`：24/24 pass。
- `npm.cmd run storage:migration-runbook -- --output <temp>`：pass，成功寫出 JSON / Markdown / pointer rollback plan；目前本機 DB 尚無 storage metadata object，因此 live local summary planned 0 / blocked 0 / skipped 0，且 `readyToExecute=false`。
- Storage regression gates：`qc:file-storage-archive-restore` 15/15、`qc:file-storage-migration-dry-run` 14/14、`qc:file-storage-contract` 75/75、`qc:file-storage-cost-report` 18/18、`qc:file-storage-evidence-dashboard` 17/17、`qc:file-storage-egress-report` 18/18、`qc:file-storage-monthly-evidence` 15/15、`qc:file-storage-monthly-evidence-schedule` 13/13、`qc:doc-paths` 23/23。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 30. 2026-06-11 Phase 4H 開發證據

本輪補上 controlled migration execution gate。這不是 live Supabase / S3 migration executor，而是預設關閉、只能在隔離 local staging target 執行的驗證 gate，用來證明 execute / verify / rollback-first 流程的行為與 guardrail。

交付：

- 新增 `scripts/generate-file-storage-migration-execution-gate.mjs`。
- 新增 `npm.cmd run storage:migration-execution-gate`；可用 `--output <dir>` 寫出 `storage-migration-execution-gate.json` 與 `storage-migration-execution-gate.md`。
- execution gate 預設 disabled；必須同時設定 `PDM_STORAGE_MIGRATION_EXECUTE_ENABLED=1` 並傳入 `--confirm-staging` 才會執行。
- 目前唯一可執行 target mode 是 `local_staging_directory`，用於 staging / QC 隔離驗證；不呼叫 Supabase 或外部 S3-compatible provider。
- 新增 `scripts/qc-file-storage-migration-execution-gate.mjs` 與 `npm.cmd run qc:file-storage-migration-execution-gate`。
- `storage:migration-runbook` 的 commands 區塊補上 `storage:migration-execution-gate` 與 `qc:file-storage-migration-execution-gate`。

防護邊界：

- 不執行 live provider migration，不刪 source file，不改 metadata pointer。
- dry-run 有 blocker 時拒絕 copy。
- copy 後必須重新計算 target SHA-256，rollback source 也要重新驗 hash。
- 不輸出 cloud secret marker、signed URL value、raw share token 或 service role key。

驗證：

- `node --check scripts/generate-file-storage-migration-execution-gate.mjs`、`node --check scripts/qc-file-storage-migration-execution-gate.mjs`、`node --check scripts/generate-file-storage-migration-runbook.mjs`：pass。
- `npm.cmd run qc:file-storage-migration-execution-gate`：19/19 pass。
- `npm.cmd run storage:migration-execution-gate -- --output <temp>`：pass，預設 disabled mode；目前本機 DB 尚無 storage metadata object，因此 live local summary copied 0，且沒有 metadata pointer update。
- Storage regression gates：`qc:file-storage-migration-runbook` 24/24、`qc:file-storage-migration-dry-run` 14/14、`qc:file-storage-archive-restore` 15/15、`qc:file-storage-contract` 75/75、`qc:file-storage-cost-report` 18/18、`qc:file-storage-evidence-dashboard` 17/17、`qc:file-storage-egress-report` 18/18、`qc:file-storage-monthly-evidence` 15/15、`qc:file-storage-monthly-evidence-schedule` 13/13、`qc:doc-paths` 23/23。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 31. 2026-06-11 Phase 4I 開發證據

本輪補上 S3-compatible dry-run / adapter contract。這讓 AI_PDM 不只停留在 Supabase Storage 抽象，而是先把 Cloudflare R2 / AWS S3 / Backblaze B2 / Wasabi / NAS gateway 這類 S3-compatible provider 的 target path、server-only env、pointer scheme 與 dry-run evidence 固定下來。

交付：

- `src/lib/file-storage.ts` 新增 `s3_compatible` provider、`S3CompatibleStorageConfig`、`S3CompatibleStorageAdapter`、server-only credential guard、provider profile validation 與 fail-closed live IO。
- 新增 `scripts/generate-file-storage-s3-compatible-dry-run.mjs`。
- 新增 `npm.cmd run storage:s3-compatible-dry-run`；可用 `--profile cloudflare_r2|aws_s3|backblaze_b2|wasabi|nas_gateway` 與 `--output <dir>` 寫出 `storage-s3-compatible-dry-run.json` / `.md`。
- 新增 `scripts/qc-file-storage-s3-compatible-dry-run.mjs` 與 `npm.cmd run qc:file-storage-s3-compatible-dry-run`。
- 擴充 `npm.cmd run qc:file-storage-contract`，加入 S3-compatible provider registration、adapter contract、server-only env guard、live IO disablement 與 provider-scoped pointer scheme。

防護邊界：

- 不呼叫 Cloudflare R2 / AWS S3 / B2 / Wasabi / NAS gateway。
- dry-run 不需要 access key / secret key，不複製檔案、不刪檔、不改 metadata pointer。
- 若未來設定 `PDM_STORAGE_PROVIDER=s3_compatible`，live IO 仍預設 fail-closed，需另行通過 signed request staging gate。
- `NEXT_PUBLIC_S3_COMPATIBLE_*` credential 會被拒絕，避免 secret 進 frontend。

驗證：

- `node --check scripts/generate-file-storage-s3-compatible-dry-run.mjs`、`node --check scripts/qc-file-storage-s3-compatible-dry-run.mjs`：pass。
- `npm.cmd run qc:file-storage-s3-compatible-dry-run`：19/19 pass。
- `npm.cmd run storage:s3-compatible-dry-run -- --profile cloudflare_r2 --output <temp>`：pass，成功寫出 JSON / Markdown；目前本機 DB 尚無 storage metadata object，因此 live local summary planned 0 / blocked 0 / skipped 0。
- Storage regression gates：`qc:file-storage-contract` 81/81、`qc:file-storage-migration-execution-gate` 19/19、`qc:file-storage-migration-runbook` 24/24、`qc:file-storage-migration-dry-run` 14/14、`qc:file-storage-cost-report` 18/18、`qc:file-storage-archive-restore` 15/15、`qc:file-storage-evidence-dashboard` 17/17、`qc:file-storage-egress-report` 18/18、`qc:file-storage-monthly-evidence` 15/15、`qc:file-storage-monthly-evidence-schedule` 13/13、`qc:doc-paths` 23/23。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 32. 2026-06-11 Phase 4J 開發證據

本輪補上 lifecycle / retention / upload-size policy dry-run。這是成本控管閉環的治理層：系統先用 metadata 與 hash audit 判斷哪些檔案需要保留、哪些舊草稿要 review、哪些檔案超過上傳門檻、哪些物件可進入 warm / cold 候選，而不是直接刪檔或套 lifecycle rule。

交付：

- 新增 `scripts/generate-file-storage-lifecycle-policy-dry-run.mjs`。
- 新增 `npm.cmd run storage:lifecycle-policy-dry-run`；可用 `--output <dir>` 寫出 `storage-lifecycle-policy-dry-run.json` / `.md`。
- 新增 `scripts/qc-file-storage-lifecycle-policy-dry-run.mjs` 與 `npm.cmd run qc:file-storage-lifecycle-policy`。
- policy 覆蓋 `PDM_STORAGE_DRAFT_RETENTION_DAYS`、`PDM_STORAGE_WARM_AFTER_DAYS`、`PDM_STORAGE_COLD_AFTER_DAYS`、`PDM_STORAGE_MAX_UPLOAD_MB`、`PDM_STORAGE_WARN_PCT`、`PDM_STORAGE_CRITICAL_PCT`。

防護邊界：

- 只讀 dry-run，不刪檔、不改 metadata pointer、不套 provider lifecycle rule。
- released official files / release package 一律標記為 protected，不進 draft cleanup。
- missing object、out-of-root path、missing hash、hash mismatch 會阻擋 lifecycle cleanup。
- 不呼叫 Supabase / S3-compatible provider，不需要 credential。

驗證：

- `node --check scripts/generate-file-storage-lifecycle-policy-dry-run.mjs`、`node --check scripts/qc-file-storage-lifecycle-policy-dry-run.mjs`：pass。
- `npm.cmd run qc:file-storage-lifecycle-policy`：16/16 pass。
- `npm.cmd run storage:lifecycle-policy-dry-run -- --output <temp>`：pass，成功寫出 JSON / Markdown；目前本機 DB 尚無 storage metadata object，因此 live local summary 無 action candidates，保留 controlled empty-state evidence。
- Storage regression gates：`qc:file-storage-contract` 81/81、`qc:file-storage-s3-compatible-dry-run` 19/19、`qc:file-storage-migration-execution-gate` 19/19、`qc:file-storage-migration-runbook` 24/24、`qc:file-storage-migration-dry-run` 14/14、`qc:file-storage-cost-report` 18/18、`qc:file-storage-archive-restore` 15/15、`qc:file-storage-evidence-dashboard` 17/17、`qc:file-storage-egress-report` 18/18、`qc:file-storage-monthly-evidence` 15/15、`qc:file-storage-monthly-evidence-schedule` 13/13、`qc:doc-paths` 23/23。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 33. 2026-06-11 Phase 4K 開發證據

本輪補上 provider-neutral storage metadata model blueprint 與 QC。這不是正式 DB migration，而是先把未來 `storage_objects` / reference schema 的合約固定，避免繼續依賴舊 `file_assets.storage_provider CHECK ('j_drive', 'supabase_storage', 'external')` 這種會卡住 R2 / S3 / B2 / Wasabi / NAS gateway 的 enum constraint。

交付：

- 新增 `scripts/storage-metadata-model.mjs`，定義未套用的 `storage_providers`、`storage_objects`、`storage_object_references` blueprint。
- 新增 descriptor validation、object reference preview、SHA-256 deduplication preview helper。
- 新增 `scripts/qc-file-storage-metadata.mjs` 與 `npm.cmd run qc:file-storage-metadata`。
- 更新 `scripts/storage-metadata-normalizer.mjs`，將 legacy `j_drive` / `local` 正規化為 `local_repository`，同時保留未來 provider id passthrough。

防護邊界：

- 不套用 DB migration，不建立 runtime `storage_objects` table。
- 不搬檔、不刪檔、不改 metadata pointer。
- 不呼叫 Supabase / S3-compatible provider。
- 正式 schema migration 仍等 `DEV-SUPABASE-DB-001` DB runtime gate 後再執行。

驗證：

- `node --check scripts/storage-metadata-model.mjs`、`node --check scripts/qc-file-storage-metadata.mjs`、`node --check scripts/storage-metadata-normalizer.mjs`：pass。
- `npm.cmd run qc:file-storage-metadata`：18/18 pass。
- `npm.cmd run storage:cost-report -- --out <temp>/storage-cost-report.json`：pass；目前本機 DB 尚無 storage metadata object，因此保留 controlled empty-state evidence。
- Storage regression gates：`qc:file-storage-contract` 81/81、`qc:file-storage-s3-compatible-dry-run` 19/19、`qc:file-storage-lifecycle-policy` 16/16、`qc:file-storage-cost-report` 18/18、`qc:file-storage-migration-execution-gate` 19/19、`qc:file-storage-migration-runbook` 24/24、`qc:file-storage-migration-dry-run` 14/14、`qc:file-storage-archive-restore` 15/15、`qc:file-storage-evidence-dashboard` 17/17、`qc:file-storage-egress-report` 18/18、`qc:file-storage-monthly-evidence` 15/15、`qc:file-storage-monthly-evidence-schedule` 13/13、`qc:doc-paths` 23/23。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 34. 2026-06-11 Phase 4L 開發證據

本輪補上 SHA-256 deduplication reference dry-run。這不是正式去重寫入，也不會刪除重複檔；它先用 normalized metadata 找出同 provider + SHA-256 的重複群組，產生 future `storage_object_references` preview，並在 missing file、outside-root、missing SHA、hash mismatch 時阻擋整組，避免未來錯誤地把不同或不可驗證檔案合併。

交付：

- 新增 `scripts/generate-file-storage-dedup-reference-dry-run.mjs`。
- 新增 `npm.cmd run storage:dedup-reference-dry-run`；可用 `--output <dir>` 寫出 `storage-dedup-reference-dry-run.json` / `.md`。
- 新增 `scripts/qc-file-storage-dedup-reference.mjs` 與 `npm.cmd run qc:file-storage-dedup-reference`。
- canonical selection 採保守規則：release package / released official 優先，再選已驗證物件。
- report 會列出 candidate groups、reference previews、estimated recoverable bytes、blocked groups、skipped no-hash objects。

防護邊界：

- 只讀 dry-run，不套用 schema migration，不建立 runtime `storage_objects`。
- 不刪檔、不合併 physical object、不改 metadata pointer。
- 不呼叫 Supabase / S3-compatible provider。
- remote provider duplicate 只標示為 metadata-only，需 provider-side hash verification 後才可 cleanup。

驗證：

- `node --check scripts/generate-file-storage-dedup-reference-dry-run.mjs`、`node --check scripts/qc-file-storage-dedup-reference.mjs`：pass。
- `npm.cmd run qc:file-storage-dedup-reference`：17/17 pass。
- `npm.cmd run storage:dedup-reference-dry-run -- --output <temp>`：pass，成功寫出 JSON / Markdown；目前本機 DB 尚無 storage metadata object，因此保留 controlled empty-state evidence。
- Storage regression gates：`qc:file-storage-contract` 81/81、`qc:file-storage-metadata` 18/18、`qc:file-storage-cost-report` 18/18、`qc:file-storage-lifecycle-policy` 16/16、`qc:file-storage-s3-compatible-dry-run` 19/19、`qc:file-storage-migration-dry-run` 14/14、`qc:file-storage-migration-runbook` 24/24、`qc:file-storage-migration-execution-gate` 19/19、`qc:file-storage-archive-restore` 15/15、`qc:file-storage-evidence-dashboard` 17/17、`qc:file-storage-egress-report` 18/18、`qc:file-storage-monthly-evidence` 15/15、`qc:file-storage-monthly-evidence-schedule` 13/13、`qc:doc-paths` 23/23。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 35. 2026-06-11 Phase 4M 開發證據

本輪補上 runtime upload-size policy gate。這是成本控管的入口治理層，將 submissions、master attachments 與全域 config 的上傳大小門檻收斂到同一個 helper，避免未來調整 Supabase / S3-compatible / NAS gateway 策略時，各入口各自解析環境變數造成漏控。

交付：

- 新增 `src/lib/storage-upload-policy.ts`。
- 支援預設 50 MiB、`PDM_MAX_UPLOAD_FILE_BYTES` byte override、`PDM_STORAGE_MAX_UPLOAD_MB` cost-policy fallback、`PDM_MASTER_ATTACHMENT_MAX_UPLOAD_FILE_BYTES` attachment scoped override。
- 更新 `src/app/api/submissions/route.ts`，送審檔案驗證改用 shared upload policy。
- 更新 `src/lib/config.ts`，`config.maxUploadFileBytes` 改用 shared upload policy。
- 更新 `src/lib/repositories/master-attachment-repository.ts`，附件大小限制改用 master attachment scoped policy。
- 新增 `scripts/qc-file-storage-upload-policy.mjs` 與 `npm.cmd run qc:file-storage-upload-policy`。

防護邊界：

- 不建立 bucket，不搬檔，不更新 provider pointer。
- 不啟用 live cleanup、Admin override workflow 或 alternate large-file upload path。
- 保留既有 50 MiB 預設，避免這個切片改變目前上傳行為。

驗證：

- `node --check scripts/qc-file-storage-upload-policy.mjs`：pass。
- `npm.cmd run qc:file-storage-upload-policy`：23/23 pass。
- Storage regression gates：`qc:file-storage-contract` 81/81、`qc:file-storage-lifecycle-policy` 16/16、`qc:file-storage-metadata` 18/18、`qc:file-storage-dedup-reference` 17/17、`qc:file-storage-cost-report` 18/18。
- Submission route adjacent gate：`qc:access-control-async-repository` 169/169。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 36. 2026-06-11 Phase 4N 開發證據

本輪補上 large-file upload decision gate。Phase 4M 只集中上傳大小門檻；Phase 4N 則把「超過門檻後要怎麼處置」變成可測試合約：一般上傳、需要 Admin override、必須改走大檔流程三種情境可被系統辨識。這仍不是正式 override 執行器，而是先讓 route 與 QC 有穩定分類，避免未來只是把大檔一律擋掉、沒有治理路徑。

交付：

- `src/lib/storage-upload-policy.ts` 新增 `DEFAULT_STORAGE_LARGE_FILE_THRESHOLD_BYTES`，預設 500 MiB。
- 新增 `PDM_STORAGE_LARGE_FILE_THRESHOLD_MB`，並在 `.env.example`、`README.md` 文件化。
- 新增 disposition：`normal_upload`、`admin_override_required`、`alternate_large_file_path_required`。
- 大檔門檻若設定低於一般上傳門檻，會 clamp 到 `maxUploadFileBytes`，避免 policy 自相矛盾。
- `src/app/api/submissions/route.ts` 在驗證失敗時追加 ASCII `storage_upload_decision=...` detail code，供前端或後續 Admin workflow 解析。
- `scripts/qc-file-storage-upload-policy.mjs` 從 14 項擴充至 23 項。

防護邊界：

- 不允許繞過目前上傳限制。
- 不啟用 Admin override execution。
- 不建立 alternate large-file upload executor。
- 不建立 bucket、不搬檔、不呼叫 Supabase / S3-compatible provider。

驗證：

- `node --check scripts/qc-file-storage-upload-policy.mjs`：pass。
- `npm.cmd run qc:file-storage-upload-policy`：23/23 pass。
- Storage regression gates：`qc:file-storage-contract` 81/81、`qc:file-storage-lifecycle-policy` 16/16、`qc:file-storage-cost-report` 18/18。
- Submission route adjacent gate：`qc:access-control-async-repository` 169/169。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，import trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 37. 2026-06-11 Phase 4O 開發證據

本輪把 Phase 4N 的「需要 Admin override」分類推進成受控執行 gate。這不是無限制放行：只有 `Admin` 可覆核，必須提供原因，且只適用於超過一般上傳門檻但未達 large-file threshold 的中型大檔；若檔案已被分類為 `alternate_large_file_path_required`，仍然被阻擋並要求走替代大檔流程。

交付內容：

- `src/lib/validation.ts` 的 `validateUploadedFiles(...)` 新增 `{ allowOversizedFiles }` 選項，預設仍 fail-closed。
- `src/app/api/submissions/route.ts` 新增 `storage_upload_override` 與 `storage_upload_override_reason` 表單欄位，並實作 Admin-only、reason 10-300 字、alternate large-file path 不可覆核的規則。
- `src/lib/repositories/submission-write-async-repository.ts` 在 `Submit` audit detail 中寫入 `storageUploadOverride`，包含 approver、reason、門檻與受影響檔案。
- `scripts/qc-file-storage-upload-policy.mjs` / `qc:file-storage-upload-policy` 從 23 項擴充到 31 項，覆蓋 controlled oversized validation、route form fields、Admin-only enforcement、reason requirement、alternate large-file blocking、audit forwarding、repository input contract 與 no-secret output。

邊界：

- 不建立 alternate large-file upload executor。
- 不建立 bucket，不呼叫 Supabase / S3-compatible providers。
- 不放寬 `alternate_large_file_path_required` 的阻擋規則。
- 不更動 live cleanup / lifecycle execution。

驗證：

- `node --check scripts/qc-file-storage-upload-policy.mjs`：pass。
- `npm.cmd run qc:file-storage-upload-policy`：31/31 pass。
- `npm.cmd run qc:file-storage-contract`：81/81 pass。
- `npm.cmd run qc:access-control-async-repository`：169/169 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 38. 2026-06-11 Phase 4P 開發證據

本輪把 `alternate_large_file_path_required` 從「只有阻擋碼」推進成可交接的 intake package 合約。超過 large-file threshold 的檔案仍不可用一般 submission endpoint 上傳，也不可用 Admin override 繞過；系統會回傳可解析的 intake detail，讓後續 NAS gateway、S3-compatible staging 或 Supabase Storage staging executor 可以依同一份 metadata contract 接手。

交付內容：

- `src/lib/storage-upload-policy.ts` 新增 `getAlternateLargeFileIntakePackage(...)`、`AlternateLargeFileIntakePackage`、必要 metadata contract、provider profile hints、next steps 與 guardrails。
- `src/app/api/submissions/route.ts` 對超過 large-file threshold 的檔案輸出 `large_file_intake_required=true` detail，包含 package version、intake action、audit action、required metadata 與 allowed provider profiles。
- `scripts/qc-file-storage-upload-policy.mjs` / `qc:file-storage-upload-policy` 從 31 項擴充到 35 項，覆蓋 threshold-only package generation、metadata contract、normal/Admin-override file empty package behavior 與 route detail emission。

邊界：

- 不上傳、不搬檔、不註冊外部 object。
- 不建立 bucket，不呼叫 Supabase / S3-compatible providers。
- 不更新 metadata pointer，不做 production cutover。
- 不放寬 `alternate_large_file_path_required` 的阻擋規則。

驗證：

- `node --check scripts/qc-file-storage-upload-policy.mjs`：pass。
- `npm.cmd run qc:file-storage-upload-policy`：35/35 pass。
- `npm.cmd run qc:file-storage-contract`：81/81 pass。
- `npm.cmd run qc:access-control-async-repository`：169/169 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 39. 2026-06-11 Phase 4Q 開發證據

本輪把 Phase 4P 的 intake package 往 server-side 登記合約推進。系統仍不執行搬檔，也不套用正式 `storage_objects` migration；但已定義外部大檔登記所需的 validation、object/reference metadata、audit redaction 與 async repository SQL contract，未來 DB runtime gate 通過後可接正式 schema。

交付內容：

- `src/lib/external-large-file-intake.ts` 新增 `external-large-file-intake/v1` contract，驗證 owner/sourcePath/provider/bucket/objectKey/SHA-256/fileSize/retentionClass/restoreOwner 等必要 metadata。
- `src/lib/repositories/external-large-file-intake-async-repository.ts` 新增 provider-neutral `storage_objects` upsert、`storage_object_references` upsert、`LargeFileIntakeRegistered` append-only audit contract。
- `src/lib/external-large-file-intake-async.ts` 提供 runtime helper，後續 API / 後台 job 可透過 async database provider 使用同一 contract。
- `scripts/qc-external-large-file-intake.mjs` 與 `qc:external-large-file-intake` 驗證 registration contract、SQLite semantic insert/upsert、audit redaction、no-secret output、PM evidence 與 no live provider IO。

邊界：

- 不套用 DB migration，不建立 runtime `storage_objects` table。
- 不上傳、不搬檔、不刪檔，不呼叫 Supabase / S3-compatible providers。
- 不建立 signed URL，不把 raw `sourcePath` 寫進 audit detail。
- 不改現有 submission upload route 的阻擋邏輯。

驗證：

- `node --check scripts/qc-external-large-file-intake.mjs`：pass。
- `npm.cmd run qc:external-large-file-intake`：15/15 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run qc:file-storage-upload-policy`：35/35 pass。
- `npm.cmd run qc:file-storage-contract`：81/81 pass。
- `npm.cmd run qc:access-control-async-repository`：169/169 pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 40. 2026-06-11 Phase 4R 開發證據

本輪把 storage metadata blueprint 與 Phase 4Q registration contract 推進成可審核的 schema migration proposal package。這不是正式 DB migration；它只產出 SQL/JSON/Markdown 讓 DB runtime gate 後可以被 review、套用到 disposable/staging target，再跑 Supabase advisor 與 repository contract 驗證。

交付內容：

- `scripts/generate-file-storage-schema-migration-package.mjs` 新增 `storage-schema-migration-package/v1`，可產出 `storage-schema-migration-package.json`、`storage-schema-migration-package.md` 與 `storage-schema-migration-proposal.sql`。
- proposal SQL 定義 `storage_providers`、`storage_objects`、`storage_object_references`，欄位對齊 `AsyncExternalLargeFileIntakeRepository` 使用的 object/reference contract。
- proposal SQL 會 seed baseline provider rows：`local_repository` enabled，`supabase_storage`、`s3_compatible`、`nas_gateway` disabled。
- proposal SQL 啟用 RLS，並 `REVOKE ALL` from `anon`、`authenticated`、`PUBLIC`，避免 public schema table 被 Data API 直接暴露。
- `scripts/qc-file-storage-schema-migration-package.mjs` 與 `qc:file-storage-schema-migration-package` 驗證 table/FK/index contract、RLS/revoke、provider-neutral 設計、產物輸出、PM evidence、no-secret output 與 proposal-only guardrail。

邊界：

- 不套用 DB migration，不寫入 `db/postgres` 或 `supabase/migrations`。
- 不建立 runtime table，不修改現有 SQLite/Postgres schema。
- 不呼叫 Supabase / S3-compatible / NAS providers。
- 不 grant browser/Data API access，不新增 RLS policy。

Supabase 安全依據：

- 依 Supabase 文件，Data API 可達性由 grants 控制，RLS 控制 row visibility；兩者必須一起審核。
- public schema table 應啟用 RLS；本 proposal 預設 revoke anon/authenticated/PUBLIC，而不是建立 browser-facing policy。

驗證：

- `node --check scripts/generate-file-storage-schema-migration-package.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-migration-package.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-migration-package`：17/17 pass。
- `npm.cmd run storage:schema-migration-package -- --output <temp>`：pass，成功產出 JSON / Markdown / SQL。
- `npm.cmd run qc:external-large-file-intake`：15/15 pass。
- `npm.cmd run qc:file-storage-metadata`：18/18 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 41. 2026-06-11 Phase 4S 開發證據

本輪把 Phase 4R 的 proposal SQL 補上「拋棄式 DB 套用閘門」。這不是正式 migration，也不會預設連線；它只允許在明確 disposable/staging/shadow/test 目標、環境變數啟用、CLI 確認、database URL 皆存在時，把 proposal SQL 套用到一次性 Postgres 目標，並立即檢查 table、RLS 與 Data API grant 風險。

交付內容：

- `scripts/generate-file-storage-schema-apply-gate.mjs` 新增 `storage-schema-apply-gate/v1`，預設輸出 disabled report，不連 DB。
- `storage:schema-apply-gate` 支援 `--output`、`--target-kind`、`--target-name`、`--confirm-disposable`；正式執行仍需 `PDM_STORAGE_SCHEMA_APPLY_ENABLED=1` 與 `PDM_STORAGE_SCHEMA_APPLY_DATABASE_URL`。
- Gate 只接受 `postgres_disposable` target kind，target name 必須含 `disposable`、`staging`、`shadow` 或 `test`，且不得含 `prod`、`production`、`main`。
- 套用後會驗證 `storage_providers`、`storage_objects`、`storage_object_references` 是否存在、RLS 是否啟用、`anon` / `authenticated` / `PUBLIC` 是否仍有 table privileges。
- `scripts/qc-file-storage-schema-apply-gate.mjs` 與 `qc:file-storage-schema-apply-gate` 使用 fake client 驗證 apply/introspection 流程，避免 CI 需要 live DB。

邊界：

- 預設不連線、不套用 SQL、不建立 runtime table。
- 不寫入 `db/postgres` 或 `supabase/migrations`；正式 migration 仍需等 DB runtime gate。
- 不呼叫 Supabase Storage / S3-compatible / NAS provider。
- 不更新 storage metadata pointer，不搬檔，不刪檔。
- 不在 report 輸出 database URL。

驗證：

- `node --check scripts/generate-file-storage-schema-apply-gate.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-apply-gate.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-apply-gate`：19/19 pass。
- `npm.cmd run storage:schema-apply-gate -- --output <temp>`：pass，預設 disabled mode，成功產出 JSON / Markdown，未套用 SQL。
- `npm.cmd run qc:file-storage-schema-migration-package`：17/17 pass。
- `npm.cmd run qc:external-large-file-intake`：15/15 pass。
- `npm.cmd run qc:file-storage-metadata`：18/18 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 42. 2026-06-11 Phase 4T 開發證據

本輪補上 read-only schema verify gate。Phase 4S 可把 proposal SQL 套到 disposable 目標並順手驗證；Phase 4T 則處理另一個必要場景：schema 已由其他流程套用後，只做 catalog / seed / grant 驗證，不重跑 SQL、不搬檔、不動 provider pointer。這是未來 disposable/staging 驗證與正式 migration 前查核的獨立閘門。

交付內容：

- `scripts/generate-file-storage-schema-verify-gate.mjs` 新增 `storage-schema-verify-gate/v1`，預設 disabled，不連 DB。
- `storage:schema-verify-gate` 支援 `--output`、`--target-name`、`--confirm-target`；正式執行仍需 `PDM_STORAGE_SCHEMA_VERIFY_ENABLED=1` 與 `PDM_STORAGE_SCHEMA_VERIFY_DATABASE_URL`。
- Gate 只接受 target name 含 `disposable`、`staging`、`shadow` 或 `test` 的非 production 目標，且封鎖 `prod`、`production`、`main`。
- 驗證項目包含 `storage_providers`、`storage_objects`、`storage_object_references` table 存在、RLS 啟用、`anon` / `authenticated` / `PUBLIC` table grants、必要 index、unique constraints、baseline provider rows 與 enabled flag。
- `scripts/qc-file-storage-schema-verify-gate.mjs` 與 `qc:file-storage-schema-verify-gate` 使用 fake client 驗證 clean pass 與 findings downgrade，不需要 live DB。

邊界：

- 預設不連線；啟用後也只做 read-only catalog / seed 查詢。
- 不套用 SQL，不寫入正式 migration 目錄。
- 不呼叫 Supabase Storage / S3-compatible / NAS provider。
- 不更新 storage metadata pointer，不搬檔，不刪檔。
- 不在 report 輸出 database URL。

驗證：

- `node --check scripts/generate-file-storage-schema-verify-gate.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-verify-gate.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-verify-gate`：23/23 pass。
- `npm.cmd run storage:schema-verify-gate -- --output <temp>`：pass，預設 disabled mode，成功產出 JSON / Markdown，未連線、未套用 SQL。
- `npm.cmd run qc:file-storage-schema-apply-gate`：19/19 pass。
- `npm.cmd run qc:file-storage-schema-migration-package`：17/17 pass。
- `npm.cmd run qc:external-large-file-intake`：15/15 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 43. 2026-06-11 Phase 4U 開發證據

本輪補上 schema promotion evidence gate。Phase 4S / 4T 分別處理 apply 與 verify，但正式 migration review 前仍需要一個合流點，確認 apply report、verify report、Supabase security/performance advisor evidence 都存在且乾淨；否則容易出現只跑單一檢查就推進正式 migration 的治理缺口。

交付內容：

- `scripts/generate-file-storage-schema-promotion-gate.mjs` 新增 `storage-schema-promotion-gate/v1`，只讀取 evidence JSON，不連 DB。
- `storage:schema-promotion-gate` 支援 `--apply-report`、`--verify-report`、`--advisor-evidence`、`--output`。
- Promotion 需要 apply report status 為 `applied_to_disposable`，verify report status 為 `verified`，verify readiness 為 true，findings 為空，無 disallowed grant，provider seed 通過，且 Supabase security / performance advisor evidence 都 passed 且無 findings。
- `scripts/qc-file-storage-schema-promotion-gate.mjs` 與 `qc:file-storage-schema-promotion-gate` 驗證缺 evidence、apply 失敗、verify findings、advisor findings、clean pass、輸出檔案、PM evidence 與 no credential marker output。

邊界：

- 不連 DB、不套用 SQL、不寫入正式 migration 目錄。
- 不呼叫 Supabase Storage / S3-compatible / NAS provider。
- 不更新 storage metadata pointer，不搬檔，不刪檔。
- 不在 report 輸出 database URL；只保留 evidence 檔名與摘要狀態。

驗證：

- `node --check scripts/generate-file-storage-schema-promotion-gate.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-promotion-gate.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-promotion-gate`：18/18 pass。
- `npm.cmd run storage:schema-promotion-gate -- --output <temp>`：pass，預設缺 evidence 時輸出 `blocked_missing_evidence`，成功產出 JSON / Markdown。
- `npm.cmd run qc:file-storage-schema-verify-gate`：23/23 pass。
- `npm.cmd run qc:file-storage-schema-apply-gate`：19/19 pass。
- `npm.cmd run qc:file-storage-schema-migration-package`：17/17 pass。
- `npm.cmd run qc:external-large-file-intake`：15/15 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 44. 2026-06-11 Phase 4V 開發證據

本輪補上 Supabase advisor evidence normalizer。Phase 4U 已要求 promotion gate 必須吃 security/performance advisor evidence，但若沒有固定格式，後續容易靠手工 JSON 推進 migration review；因此先把「匯出的 advisor 結果」標準化成固定 evidence artifact。

交付內容：

- `scripts/generate-file-storage-schema-advisor-evidence.mjs` 新增 `storage-schema-advisor-evidence/v1`，只讀取已匯出的 advisor JSON，不連 DB。
- `storage:schema-advisor-evidence` 支援 `--security-report`、`--performance-report`、`--target-name`、`--output`。
- 輸出 `supabase-advisor-evidence.json` / Markdown，包含 `security.status`、`performance.status`、sanitized findings，且可直接交給 `storage:schema-promotion-gate --advisor-evidence`。
- target name 必須明確是 disposable / staging / shadow / test；production-like target 即使 advisor exports 為空也會 fail。
- `scripts/qc-file-storage-schema-advisor-evidence.mjs` 與 `qc:file-storage-schema-advisor-evidence` 驗證 missing exports、clean pass、promotion-gate compatibility、security/performance findings、unsafe target、輸出檔案、PM evidence、no official migration writes 與 credential redaction。

邊界：

- 不連 Supabase / DB、不套用 SQL、不寫入正式 migration 目錄。
- 不呼叫 Supabase Storage / S3-compatible / NAS provider。
- 不更新 storage metadata pointer，不搬檔，不刪檔。
- 不輸出 database URL / service role / cloud credential marker；只保留 sanitized findings 與 evidence 檔名。

驗證：

- `node --check scripts/generate-file-storage-schema-advisor-evidence.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-advisor-evidence.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-advisor-evidence`：18/18 pass。
- `npm.cmd run storage:schema-advisor-evidence -- --output <temp>`：pass；預設缺 advisor exports 時輸出 `blocked_missing_advisor_exports`，成功產出 JSON / Markdown。
- 回歸：`npm.cmd run qc:file-storage-schema-promotion-gate` 18/18 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-verify-gate` 23/23 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-apply-gate` 19/19 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-migration-package` 17/17 pass。
- 回歸：`npm.cmd run qc:external-large-file-intake` 15/15 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 45. 2026-06-11 Phase 4W 開發證據

本輪補上 known Supabase target denylist。實際 Supabase connector 目前只列出 `ProJED` 與 `ProJED_TEST`，而 DB migration PM evidence 已明確要求 AI_PDM 應使用 dedicated `AI_PDM_STAGING` / `AI_PDM_PROD`，不可把既有 `ProJED` / `ProJED_TEST` 當 migration target。原本 storage schema gate 只靠名稱包含 `test` / `staging` / `shadow` 判斷，存在 `ProJED_TEST` 被誤放行的風險。

交付內容：

- 新增 `scripts/file-storage-schema-target-safety.mjs`，集中管理 storage schema target safety。
- denylist 明確封鎖 `ProJED` (`knodlkxqpcqyrtgwpdst`) 與 `ProJED_TEST` (`fhisnnufoeulxqrchldf`) 的 project name / ref / Supabase DB host。
- `storage:schema-apply-gate`、`storage:schema-verify-gate`、`storage:schema-advisor-evidence` 改用同一個 safety evaluator。
- 命中 known forbidden target 時回傳 `unsafe_known_target`，且 apply / verify 在連線前就停止。
- QC 增加 `ProJED_TEST` target name 與 `db.fhisnnufoeulxqrchldf.supabase.co` ref 的 fail-closed 覆蓋。

邊界：

- 不連 `ProJED` / `ProJED_TEST`。
- 不套用 SQL、不寫入正式 migration 目錄。
- 不呼叫 Supabase Storage / S3-compatible / NAS provider。
- 不更新 storage metadata pointer，不搬檔，不刪檔。

驗證：

- `node --check scripts/file-storage-schema-target-safety.mjs`：pass。
- `node --check scripts/generate-file-storage-schema-apply-gate.mjs`：pass。
- `node --check scripts/generate-file-storage-schema-verify-gate.mjs`：pass。
- `node --check scripts/generate-file-storage-schema-advisor-evidence.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-apply-gate.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-verify-gate.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-advisor-evidence.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-apply-gate`：21/21 pass。
- `npm.cmd run qc:file-storage-schema-verify-gate`：25/25 pass。
- `npm.cmd run qc:file-storage-schema-advisor-evidence`：19/19 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-promotion-gate` 18/18 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-migration-package` 17/17 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 46. 2026-06-11 Phase 4X 開發證據

本輪補上 Supabase target readiness gate。Phase 4W 已能阻擋 `ProJED` / `ProJED_TEST`，但 PM 下一步仍需要一個可交接的判斷點：匯出目前 Supabase project inventory 後，系統能自動判定是否已有 dedicated `AI_PDM_STAGING` / disposable target 可進入 schema apply gate。

交付內容：

- 新增 `scripts/generate-file-storage-schema-target-readiness.mjs`，版本 `storage-schema-target-readiness/v1`。
- 新增 `storage:schema-target-readiness`，支援 `--projects-report`、`--expected-target-name`、`--output`。
- Gate 讀取 Supabase project inventory JSON，接受 `{ projects: [...] }`、array、`data` 或 `items` 形狀。
- Gate 需要候選 target 通過 shared target safety、名稱含 `AI_PDM`，且若指定 `--expected-target-name` 必須完全對應。
- 只有 `AI_PDM_STAGING` / disposable / shadow / test 類 target 會進入 `ready_for_storage_schema_apply_gate`；只有 `ProJED` / `ProJED_TEST` 時輸出 `blocked_no_approved_target`。
- 新增 `scripts/qc-file-storage-schema-target-readiness.mjs` 與 `qc:file-storage-schema-target-readiness`。

邊界：

- 不建立 Supabase project，不接受成本，不呼叫 `create_project` / `create_branch`。
- 不連 DB、不套用 SQL、不寫入正式 migration 目錄。
- 不呼叫 Supabase Storage / S3-compatible / NAS provider。
- 不更新 storage metadata pointer，不搬檔，不刪檔。

驗證：

- `node --check scripts/generate-file-storage-schema-target-readiness.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-readiness.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-target-readiness`：16/16 pass。
- `npm.cmd run storage:schema-target-readiness -- --output <temp>`：pass；預設缺 project inventory 時輸出 `blocked_missing_project_inventory`，成功產出 JSON / Markdown。
- 回歸：`npm.cmd run qc:file-storage-schema-apply-gate` 21/21 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-verify-gate` 25/25 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-advisor-evidence` 19/19 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-promotion-gate` 18/18 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-migration-package` 17/17 pass。
- 回歸：`npm.cmd run qc:external-large-file-intake` 15/15 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 47. 2026-06-11 Phase 4Y 開發證據

本輪補上 target readiness handoff package。Phase 4X 能判斷 inventory 是否已有 dedicated target，但 PM/RD 還需要一份可交接的 evidence package：當 inventory 仍只有 `ProJED` / `ProJED_TEST` 時，清楚列出阻擋原因；當 `AI_PDM_STAGING` 出現時，直接給 apply / verify / advisor / promotion 的下一步命令模板。

交付內容：

- 新增 `scripts/generate-file-storage-schema-target-readiness-package.mjs`，版本 `storage-schema-target-readiness-package/v1`。
- 新增 `storage:schema-target-readiness-package`，支援 `--projects-report`、`--expected-target-name`、`--output`。
- Package 會嵌入 `storage:schema-target-readiness` 結果，並同時輸出 package JSON / Markdown 與 readiness JSON / Markdown。
- Blocked handoff 會明確要求不要使用 `ProJED` / `ProJED_TEST`，並要求建立或提供 dedicated `AI_PDM_STAGING` / disposable / shadow target。
- Ready handoff 會輸出 `storage:schema-apply-gate`、`storage:schema-verify-gate`、`storage:schema-advisor-evidence`、`storage:schema-promotion-gate` 的命令模板，不包含 database URL。
- 新增 `scripts/qc-file-storage-schema-target-readiness-package.mjs` 與 `qc:file-storage-schema-target-readiness-package`。

邊界：

- 不建立 Supabase project，不接受成本，不呼叫 `create_project` / `create_branch`。
- 不連 DB、不套用 SQL、不寫入正式 migration 目錄。
- 不呼叫 Supabase Storage / S3-compatible / NAS provider。
- 不更新 storage metadata pointer，不搬檔，不刪檔。

驗證：

- `node --check scripts/generate-file-storage-schema-target-readiness-package.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-readiness-package.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-target-readiness-package`：15/15 pass。
- `npm.cmd run storage:schema-target-readiness-package -- --output <temp>`：pass；預設缺 project inventory 時輸出 `blocked_target_readiness`，成功產出 JSON / Markdown。
- 回歸：`npm.cmd run qc:file-storage-schema-target-readiness` 16/16 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-apply-gate` 21/21 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-verify-gate` 25/25 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-advisor-evidence` 19/19 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-promotion-gate` 18/18 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-migration-package` 17/17 pass。
- 回歸：`npm.cmd run qc:external-large-file-intake` 15/15 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 48. 2026-06-11 Phase 4Z 開發證據

本輪補上 target cost confirmation package。Supabase connector 已查到 organization `igzdpafkvqqpsyadmage` 目前 new project cost 為 `0/monthly`，branch cost 為 `0.01344/hourly`；但即使 cost 為 0，也不能跳過使用者明確確認。本階段把成本證據、target name、region、resource type 與待確認文字封成 evidence package。

交付內容：

- 新增 `scripts/generate-file-storage-schema-target-cost-confirmation-package.mjs`，版本 `storage-schema-target-cost-confirmation-package/v1`。
- 新增 `storage:schema-target-cost-confirmation-package`，支援 `--organization-id`、`--organization-name`、`--target-name`、`--region`、`--preferred-resource`、project / branch cost amount / recurrence 與 `--output`。
- Package 在 target safe 且 cost evidence 齊全時輸出 `ready_for_user_cost_confirmation`，但 `readyForSupabaseCreateCall` 永遠是 false；必須等使用者明確確認後才可進 connector 的 cost confirmation / create flow。
- Package 會產生可直接向使用者重述的 confirmation text，例如 project `0/monthly` 或 branch `0.01344/hourly`。
- 新增 `scripts/qc-file-storage-schema-target-cost-confirmation-package.mjs` 與 `qc:file-storage-schema-target-cost-confirmation-package`。

邊界：

- 不呼叫 Supabase cost confirmation，不呼叫 project / branch creation API。
- 不連 DB、不套用 SQL、不寫入正式 migration 目錄。
- 不呼叫 Supabase Storage / S3-compatible / NAS provider。
- 不更新 storage metadata pointer，不搬檔，不刪檔。

驗證：

- `node --check scripts/generate-file-storage-schema-target-cost-confirmation-package.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-cost-confirmation-package.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-target-cost-confirmation-package`：17/17 pass。
- `npm.cmd run storage:schema-target-cost-confirmation-package -- --organization-id igzdpafkvqqpsyadmage --organization-name JED --target-name AI_PDM_STAGING --region ap-southeast-1 --preferred-resource project --project-cost-amount 0 --project-cost-recurrence monthly --branch-cost-amount 0.01344 --branch-cost-recurrence hourly --output <temp>`：pass；輸出 `ready_for_user_cost_confirmation`，但 `readyForSupabaseCreateCall=false`。
- 回歸：`npm.cmd run qc:file-storage-schema-target-readiness-package` 15/15 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-target-readiness` 16/16 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-apply-gate` 21/21 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-verify-gate` 25/25 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-advisor-evidence` 19/19 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-promotion-gate` 18/18 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-migration-package` 17/17 pass。
- 回歸：`npm.cmd run qc:external-large-file-intake` 15/15 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 49. 2026-06-11 Phase 5A 開發證據

本輪補上 formal migration review package。這一層不是取代 `storage:schema-promotion-gate`，而是把 target readiness、成本確認、使用者費用確認 evidence、promotion gate 合成一個正式 review handoff，避免只看 SQL apply/verify 卻漏掉 target 與成本治理。

交付內容：

- 新增 `scripts/generate-file-storage-schema-formal-review-package.mjs`，版本 `storage-schema-formal-review-package/v1`。
- 新增 `storage:schema-formal-review-package`，支援 `--target-readiness-package`、`--cost-confirmation-package`、`--user-cost-confirmed-evidence`、`--promotion-report` 與 `--output`。
- Package 狀態包含 `blocked_missing_evidence`、`blocked_target_readiness`、`blocked_cost_confirmation`、`blocked_schema_promotion` 與 `ready_for_formal_migration_review`。
- 新增 `scripts/qc-file-storage-schema-formal-review-package.mjs` 與 `qc:file-storage-schema-formal-review-package`。

邊界：

- 不呼叫 Supabase cost confirmation、project creation 或 branch creation。
- 不連 DB、不 apply SQL、不寫入 `db/postgres` 或 `supabase/migrations`。
- 不更新 metadata pointer、不執行 provider IO。
- 即使 package ready，也只代表可以提交 formal migration review；production migration 仍需 reviewer approval 與 rollback evidence。

驗證：

- `node --check scripts/generate-file-storage-schema-formal-review-package.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-formal-review-package.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-formal-review-package`：18/18 pass。
- `npm.cmd run storage:schema-formal-review-package -- --output <temp>`：pass；輸出 `blocked_missing_evidence`，並寫出 JSON / Markdown。
- 回歸：`npm.cmd run qc:file-storage-schema-target-cost-confirmation-package` 17/17 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-target-readiness-package` 15/15 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-target-readiness` 16/16 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-promotion-gate` 18/18 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-advisor-evidence` 19/19 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-apply-gate` 21/21 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-verify-gate` 25/25 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-migration-package` 17/17 pass。
- 回歸：`npm.cmd run qc:external-large-file-intake` 15/15 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run qc:doc-paths`：23/23 pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 50. 2026-06-11 Phase 5B 開發證據

本輪把實際 Supabase connector 狀態封成 provisioning evidence。這是正式建立 `AI_PDM_STAGING` 前的事實查核：目前 organization `igzdpafkvqqpsyadmage` 仍只有 `ProJED` 與 `ProJED_TEST`，沒有 dedicated `AI_PDM_STAGING`，所以 schema apply / verify / advisor / promotion 都不能進行。

交付內容：

- 新增 `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/project-inventory.json`，記錄 connector `list_projects` 目前只回傳 `ProJED` 與 `ProJED_TEST`。
- 以實際 inventory 產出 `storage-schema-target-readiness-package.json/md`；結果為 `blocked_target_readiness`，source status 為 `blocked_no_approved_target`。
- 以重新查得的成本產出 `storage-schema-target-cost-confirmation-package.json/md`；project cost 為 `0/monthly`，branch cost 為 `0.01344/hourly`，結果為 `ready_for_user_cost_confirmation`。
- 以實際 readiness / cost package 產出 `storage-schema-formal-review-package.json/md`；結果仍未 ready，因缺少 target readiness、user cost confirmation evidence、schema promotion evidence。
- 新增 `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` 與 `qc:file-storage-schema-target-provisioning-evidence`，固定查核這份實際 evidence folder。

邊界：

- 未呼叫 Supabase `confirm_cost`。
- 未建立 Supabase project 或 branch。
- 未連 DB、未套用 SQL、未寫入正式 migration 目錄、未做 provider IO。

驗證：

- `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-target-provisioning-evidence`：17/17 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-formal-review-package` 18/18 pass。
- 回歸：`npm.cmd run qc:doc-paths` 23/23 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 51. 2026-06-11 Phase 5C 開發證據

本輪補上 user cost confirmation evidence gate。Phase 4Z / 5B 已能產生成本 handoff，但正式呼叫 Supabase `confirm_cost` 前仍需要一個本地可驗證 evidence：使用者確認文字必須與 package 的 confirmation text 完全相符，且要有 `confirmedBy`，才會輸出 `confirmationRecorded=true`。

交付內容：

- 新增 `scripts/generate-file-storage-schema-user-cost-confirmation-evidence.mjs`，版本 `storage-schema-user-cost-confirmation-evidence/v1`。
- 新增 `storage:schema-user-cost-confirmation-evidence`，支援 `--cost-confirmation-package`、`--confirmation-text`、`--confirmed-by` 與 `--output`。
- 輸出檔為 `user-cost-confirmation-evidence.json/md`，reportType 為 `supabase-target-user-cost-confirmation-evidence`，可交給 `storage:schema-formal-review-package --user-cost-confirmed-evidence`。
- 新增 `scripts/qc-file-storage-schema-user-cost-confirmation-evidence.mjs` 與 `qc:file-storage-schema-user-cost-confirmation-evidence`。

邊界：

- 不呼叫 Supabase `confirm_cost`。
- 不建立 Supabase project 或 branch。
- 不連 DB、不套用 SQL、不寫入正式 migration 目錄。

驗證：

- `node --check scripts/generate-file-storage-schema-user-cost-confirmation-evidence.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-user-cost-confirmation-evidence.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-user-cost-confirmation-evidence`：17/17 pass。
- `npm.cmd run storage:schema-user-cost-confirmation-evidence -- --cost-confirmation-package <current-cost-package> --output <temp>`：pass；輸出 `blocked_missing_user_confirmation`，且 `confirmationRecorded=false`。
- 回歸：`npm.cmd run qc:file-storage-schema-formal-review-package` 18/18 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-target-provisioning-evidence` 17/17 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-target-cost-confirmation-package` 17/17 pass。
- 回歸：`npm.cmd run qc:doc-paths` 23/23 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 52. 2026-06-11 Phase 5D 開發證據

本輪把 Phase 5C 的 user confirmation gate 套用到實際 provisioning evidence folder。現在 `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/` 不只包含 inventory / readiness / cost / formal review，也包含一份明確 blocked 的 user cost confirmation evidence，證明目前尚未取得使用者確認，不能呼叫 Supabase `confirm_cost`。

交付內容：

- 新增 `user-cost-confirmation-evidence.json/md` 到實際 evidence folder。
- 該 evidence 狀態為 `blocked_missing_user_confirmation`，`confirmationRecorded=false`，`readyForSupabaseConfirmCost=false`。
- 重新產生 `storage-schema-formal-review-package.json/md`，讓 formal review 讀取這份 evidence；formal review 現在呈現 `userCostConfirmation.status=failed`，而不是單純 missing file。
- 更新 `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs`，要求實際 evidence folder 必須包含 blocked user confirmation evidence，並確認 formal review 看到該 blocker。

邊界：

- 未呼叫 Supabase `confirm_cost`。
- 未建立 Supabase project 或 branch。
- 未連 DB、未套用 SQL、未寫入正式 migration 目錄。

驗證：

- `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-target-provisioning-evidence`：20/20 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-user-cost-confirmation-evidence` 17/17 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-formal-review-package` 18/18 pass。
- 回歸：`npm.cmd run qc:doc-paths` 23/23 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass；仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 53. 2026-06-11 Phase 5E 開發證據

本輪補上 Supabase target create request gate。Phase 5C/5D 已能證明使用者尚未確認成本，但真正進入 Supabase connector 前還需要一個合流點：只有 cost package 與 user cost confirmation evidence 都乾淨時，才輸出 `confirm_cost` 之後接 `create_project` 或 `create_branch` 的 connector plan。

交付內容：
- 新增 `scripts/generate-file-storage-schema-target-create-request.mjs` 與 `storage:schema-target-create-request`。
- 新增 `scripts/qc-file-storage-schema-target-create-request.mjs` 與 `qc:file-storage-schema-target-create-request`。
- Request 只讀取 `storage-schema-target-cost-confirmation-package.json` 與 `user-cost-confirmation-evidence.json`，不呼叫 Supabase，不連 DB，不建立 project/branch。
- Project request 只有在 exact user confirmation evidence 已確認時才輸出 `confirm_cost` -> `create_project` connector plan；branch request 另外要求 `--source-project-id`。
- 實際 `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/` 已新增 `supabase-target-create-request.json/md`，目前狀態為 `blocked_user_cost_not_confirmed`，`readyForConnectorExecution=false`，且 `connectorPlan=[]`。
- `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` 已擴充為檢查 create request evidence，避免缺少 user confirmation 時誤放行 connector 執行。

範圍：
- 未呼叫 Supabase `confirm_cost`。
- 未建立 Supabase project 或 branch。
- 未執行 DB SQL、未寫入 official migration、未更新 storage provider pointer。

驗證：
- `npm.cmd run storage:schema-target-create-request -- --cost-confirmation-package .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\storage-schema-target-cost-confirmation-package.json --user-cost-confirmed-evidence .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\user-cost-confirmation-evidence.json --output .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11`：pass，輸出 `blocked_user_cost_not_confirmed`。
- `node --check scripts/generate-file-storage-schema-target-create-request.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-create-request.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-target-create-request`：17/17 pass。
- `npm.cmd run qc:file-storage-schema-target-provisioning-evidence`：23/23 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-user-cost-confirmation-evidence` 17/17 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-formal-review-package` 18/18 pass。
- 回歸：`npm.cmd run qc:doc-paths` 23/23 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 54. 2026-06-11 Phase 5F 開發證據

本輪補上 target create result evidence gate。Phase 5E 能判斷是否可以呼叫 Supabase connector，但建立後仍不能只靠 create call 成功就進 schema apply；必須重新匯出 Supabase project inventory，證明 `AI_PDM_STAGING` 真的存在且不是 forbidden target。

交付內容：
- 新增 `scripts/generate-file-storage-schema-target-create-result-evidence.mjs` 與 `storage:schema-target-create-result-evidence`。
- 新增 `scripts/qc-file-storage-schema-target-create-result-evidence.mjs` 與 `qc:file-storage-schema-target-create-result-evidence`。
- Result evidence 讀取 `supabase-target-create-request.json` 與 refreshed `project-inventory.json`；create request 未 ready、缺 inventory、inventory 找不到 target 都會 fail closed。
- 只有 create request ready 且 refreshed inventory 內出現安全的 `AI_PDM_STAGING` 時，才輸出 `target_created_inventory_verified` 並允許重新跑 target readiness package。
- 實際 `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/` 已新增 `supabase-target-create-result-evidence.json/md`，目前狀態為 `blocked_create_request_not_ready`，`verifiedTargetCount=0`。
- `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` 已擴充為檢查 create result evidence，確保目前不能因為有 create request 檔案就進 schema apply。

範圍：
- 未呼叫 Supabase `confirm_cost`。
- 未建立 Supabase project 或 branch。
- 未執行 DB SQL、未寫入 official migration、未更新 storage provider pointer。

驗證：
- `npm.cmd run storage:schema-target-create-result-evidence -- --target-create-request .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\supabase-target-create-request.json --projects-report .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\project-inventory.json --output .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11`：pass，輸出 `blocked_create_request_not_ready`。
- `node --check scripts/generate-file-storage-schema-target-create-result-evidence.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-create-result-evidence.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-target-create-result-evidence`：14/14 pass。
- `npm.cmd run qc:file-storage-schema-target-provisioning-evidence`：26/26 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-target-create-request` 17/17 pass。
- 回歸：`npm.cmd run qc:doc-paths` 23/23 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 55. 2026-06-11 Phase 5G 開發證據

本輪補上 connector receipt evidence gate，並把它接入 target create result evidence。後續若真的呼叫 Supabase `confirm_cost` / `create_project`，必須留下 confirm cost receipt 與 create receipt，且 create result gate 會同時要求 receipt 與 refreshed inventory，不能只靠 inventory 或口頭紀錄推進 schema apply。

交付內容：
- 新增 `scripts/generate-file-storage-schema-target-connector-receipt-evidence.mjs` 與 `storage:schema-target-connector-receipt-evidence`。
- 新增 `scripts/qc-file-storage-schema-target-connector-receipt-evidence.mjs` 與 `qc:file-storage-schema-target-connector-receipt-evidence`。
- 更新 `storage:schema-target-create-result-evidence`，在 create request ready 後必須提供 `--connector-receipt-evidence`，才會接受 refreshed inventory 作為 target created proof。
- 實際 `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/` 已新增 `supabase-target-connector-receipt-evidence.json/md`，目前狀態為 `blocked_create_request_not_ready`，`receiptRecorded=false`。
- 實際 `supabase-target-create-result-evidence.json/md` 已重新產出並引用 connector receipt，目前仍為 `blocked_create_request_not_ready`。
- `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` 已擴充為檢查 connector receipt evidence。

範圍：
- 未呼叫 Supabase `confirm_cost`。
- 未建立 Supabase project 或 branch。
- 未執行 DB SQL、未寫入 official migration、未更新 storage provider pointer。

驗證：
- `npm.cmd run storage:schema-target-connector-receipt-evidence -- --target-create-request .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\supabase-target-create-request.json --output .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11`：pass，輸出 `blocked_create_request_not_ready`。
- `npm.cmd run storage:schema-target-create-result-evidence -- --target-create-request .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\supabase-target-create-request.json --connector-receipt-evidence .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\supabase-target-connector-receipt-evidence.json --projects-report .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\project-inventory.json --output .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11`：pass，輸出 `blocked_create_request_not_ready`。
- `node --check scripts/generate-file-storage-schema-target-connector-receipt-evidence.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-connector-receipt-evidence.mjs`：pass。
- `node --check scripts/generate-file-storage-schema-target-create-result-evidence.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-target-connector-receipt-evidence`：15/15 pass。
- `npm.cmd run qc:file-storage-schema-target-create-result-evidence`：15/15 pass。
- `npm.cmd run qc:file-storage-schema-target-provisioning-evidence`：29/29 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-formal-review-package` 18/18 pass。
- 回歸：`npm.cmd run qc:doc-paths` 23/23 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning，trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 56. 2026-06-11 Phase 5H 開發證據

本輪把 Phase 5E/5F/5G 的 provisioning result chain 納入 formal migration review package。正式 review 現在不只看 target readiness、成本確認、user confirmation 與 schema promotion，也會要求 `target create result evidence`，避免跳過 connector receipt / refreshed inventory proof。

交付內容：
- 更新 `scripts/generate-file-storage-schema-formal-review-package.mjs`，新增 `--target-create-result-evidence`。
- Formal review 新增 `targetCreateResult` source evidence 與 checks，要求 `supabase-target-create-result-evidence` 的 status 必須是 `target_created_inventory_verified`，且 verified target count 必須大於 0。
- 更新 `scripts/qc-file-storage-schema-formal-review-package.mjs`，formal review QC 從 18 項擴充為 20 項，新增 missing / blocked target create result coverage。
- 重新產生實際 `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/storage-schema-formal-review-package.json/md`，目前 formal review 已記錄 `targetCreateResult.status=blocked_create_request_not_ready`。
- 更新 `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs`，實際 provisioning evidence folder 必須證明 formal review 有記錄 blocked target create result。

範圍：
- 未呼叫 Supabase `confirm_cost`。
- 未建立 Supabase project 或 branch。
- 未執行 DB SQL、未寫入 official migration、未更新 storage provider pointer。

驗證：
- `npm.cmd run storage:schema-formal-review-package -- --target-readiness-package .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\storage-schema-target-readiness-package.json --cost-confirmation-package .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\storage-schema-target-cost-confirmation-package.json --user-cost-confirmed-evidence .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\user-cost-confirmation-evidence.json --target-create-result-evidence .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\supabase-target-create-result-evidence.json --output .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11`：pass，formal review 記錄 `targetCreateResult.status=blocked_create_request_not_ready`。
- `node --check scripts/generate-file-storage-schema-formal-review-package.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-formal-review-package.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-formal-review-package`：20/20 pass。
- `npm.cmd run qc:file-storage-schema-target-provisioning-evidence`：30/30 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-target-connector-receipt-evidence` 15/15 pass。

- 回歸：`npm.cmd run qc:file-storage-schema-target-create-result-evidence` 15/15 pass。
- 回歸：`npm.cmd run qc:doc-paths` 23/23 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning；trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。
## 57. 2026-06-11 Phase 5I 開發證據

本輪補上 target provisioning execution package。這一層不是 Supabase connector executor，也不會呼叫 `confirm_cost` / `create_project` / `create_branch`；它把 target create request、connector receipt evidence、target create result evidence 合成一份執行狀態包，讓正式建立前後的 handoff 有單一可審核狀態。

開發範圍：
- 新增 `scripts/generate-file-storage-schema-target-provisioning-execution-package.mjs` 與 `storage:schema-target-provisioning-execution-package`。
- Execution package 會輸出 `blocked_create_request_not_ready`、`ready_for_connector_execution`、`waiting_for_refreshed_project_inventory` 或 `target_provisioning_verified`。
- 實際 `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/` 已新增 `supabase-target-provisioning-execution-package.json/md`，目前狀態為 `blocked_create_request_not_ready`，`readyForConnectorExecution=false`。
- 新增 `scripts/qc-file-storage-schema-target-provisioning-execution-package.mjs` 與 `qc:file-storage-schema-target-provisioning-execution-package`。
- 更新 `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs`，要求實際 provisioning evidence folder 必須包含 execution package，且 formal / execution / create result 的 blocker 彼此一致。

範圍限制：
- 沒有呼叫 Supabase `confirm_cost`。
- 沒有建立 Supabase project 或 branch。
- 沒有連線 DB、沒有套用 SQL、沒有寫入 official migration。
- 沒有更新 storage provider pointer。

驗證：
- `npm.cmd run storage:schema-target-provisioning-execution-package -- --target-create-request .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\supabase-target-create-request.json --connector-receipt-evidence .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\supabase-target-connector-receipt-evidence.json --target-create-result-evidence .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11\supabase-target-create-result-evidence.json --output .ai-doc\reports\pm\supabase-target-provisioning-evidence-2026-06-11`：pass，輸出 `blocked_create_request_not_ready`。
- `node --check scripts/generate-file-storage-schema-target-provisioning-execution-package.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-provisioning-execution-package.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-target-provisioning-execution-package`：15/15 pass。
- `npm.cmd run qc:file-storage-schema-target-provisioning-evidence`：34/34 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-formal-review-package` 20/20 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-target-connector-receipt-evidence` 15/15 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-target-create-result-evidence` 15/15 pass。
- 回歸：`npm.cmd run qc:doc-paths` 23/23 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning；trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 58. 2026-06-11 Phase 5J 開發證據

本輪補上 forced RLS hardening。Supabase Data API 是否可達由 grants 控制，row visibility 由 RLS 控制；既有 proposal 已 revoke `anon` / `authenticated` / `PUBLIC` 並 enable RLS，本輪再把 storage metadata tables 升級為 `FORCE ROW LEVEL SECURITY`，並讓 apply / verify gate 都檢查 forced RLS，對齊專案既有 Supabase RLS baseline。

開發範圍：
- 更新 `scripts/generate-file-storage-schema-migration-package.mjs`，proposal SQL 針對 `storage_providers`、`storage_objects`、`storage_object_references` 新增 `ALTER TABLE ... FORCE ROW LEVEL SECURITY`。
- 更新 `storage:schema-apply-gate`，套用後同時檢查 `relrowsecurity` 與 `relforcerowsecurity`，summary 新增 `forcedRlsVerifiedCount`。
- 更新 `storage:schema-verify-gate`，read-only verify 同時檢查 forced RLS；若 table 未 force RLS，findings 會輸出 `RLS not forced for <table>`。
- 更新 `qc:file-storage-schema-migration-package`、`qc:file-storage-schema-apply-gate`、`qc:file-storage-schema-verify-gate`，固定驗證 Phase 5J hardening。

範圍限制：
- 沒有連線 DB。
- 沒有套用 SQL。
- 沒有寫入 official migration。
- 沒有呼叫 Supabase connector。
- 沒有更新 storage provider pointer。

驗證：
- `node --check scripts/generate-file-storage-schema-migration-package.mjs`：pass。
- `node --check scripts/generate-file-storage-schema-apply-gate.mjs`：pass。
- `node --check scripts/generate-file-storage-schema-verify-gate.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-migration-package.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-apply-gate.mjs`：pass。
- `node --check scripts/qc-file-storage-schema-verify-gate.mjs`：pass。
- `npm.cmd run qc:file-storage-schema-migration-package`：18/18 pass。
- `npm.cmd run qc:file-storage-schema-apply-gate`：22/22 pass。
- `npm.cmd run qc:file-storage-schema-verify-gate`：26/26 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-promotion-gate` 18/18 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-formal-review-package` 20/20 pass。
- 回歸：`npm.cmd run qc:file-storage-schema-target-provisioning-evidence` 34/34 pass。
- 回歸：`npm.cmd run qc:doc-paths` 23/23 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，仍有既有 Turbopack NFT warning；trace 為 `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。

## 59. 2026-06-11 Phase 5K 開發證據

本階段補強 Supabase target provisioning 前的成本確認時效與來源一致性 gate。由於 `AI_PDM_STAGING` 尚未取得使用者成本確認，本階段沒有呼叫 Supabase `confirm_cost`、沒有建立 project / branch、沒有連線 DB、沒有套用 SQL，也沒有更新 storage provider pointer。

開發範圍：
- `storage:schema-user-cost-confirmation-evidence` 現在會記錄來源 cost package 的 `packageVersion`、`generatedAt`、target、resource type 與確認文字，並要求 cost package 在 24 小時內。
- `storage:schema-target-create-request` 現在會重新比對 user confirmation evidence 是否來自同一份 cost package，並要求 cost package 與 user confirmation 都仍在 24 小時 freshness window 內。
- `storage:schema-target-provisioning-execution-package` 現在要求 ready create request 必須明確帶有 `upstreamEvidenceFresh=true` 與 `userConfirmationSourceMatchesCostPackage=true`，否則不輸出 connector execution ready 狀態。
- QC 新增 stale cost package、mismatched source package、stale ready request 等 fail-closed 檢查。

風險控制：
- 避免用舊的 Supabase get_cost 結果取得使用者確認後才執行 connector。
- 避免 cost package 重新產生後，沿用舊 user confirmation evidence。
- 保持所有 generator evidence-only，不呼叫 Supabase connector、不輸出 database URL、不寫 official migration。

## 60. 2026-06-11 Phase 5L 開發證據

本階段把每月 storage evidence 轉成 management governance snapshot，讓系統能直接回答目前應該觀察、審查、啟用成本控管，或封鎖 provider migration。此階段不呼叫 Supabase connector、不建立 project / branch、不連線 DB、不套用 SQL，也不更新 storage provider pointer。

開發範圍：
- `src/lib/storage-evidence-dashboard.ts` 新增 governance 推導：依據 readiness blockers、storage / egress threshold usage、public share egress、audited egress rows 輸出 `stable` / `observe` / `review` / `control` / `blocked`。
- `GET /api/storage/evidence` 回傳 governance snapshot，包含 provider migration 是否允許、lifecycle cleanup 是否允許、是否建議 alternate provider review，以及下一次審查觸發條件。
- `src/app/api/notifications/route.ts` 的 storage evidence alert 會帶 governance label，讓 Admin / R&D Manager 在通知中心看到管理狀態。
- Dashboard Storage Evidence panel 顯示 governance label、next review trigger 與 provider review 建議。
- `scripts/qc-file-storage-evidence-dashboard.mjs` 新增 blocked / control / missing evidence governance 覆蓋。

決策規則：
- 有 hash mismatch / missing local object 等 blocker 時：`blocked`，不可 provider migration，不可 lifecycle cleanup。
- usage ratio 達 90%：`control`，允許啟動 provider / lifecycle 成本控管審查。
- usage ratio 接近門檻、egress 接近門檻或 public share egress 存在：`review`。
- 尚無真實 egress audit row：`observe`。
- 無 blocker 且低於門檻：`stable`。

## 61. 2026-06-11 Phase 5M 開發證據

本階段把 Phase 5L 的 governance snapshot 落成可審核 gate artifact。目的不是執行 migration 或 cleanup，而是把「是否允許 provider migration review、是否允許 lifecycle cleanup review、是否需要 alternate provider review」轉成 JSON / Markdown 證據，避免管理決策只停留在 dashboard 顯示。

開發範圍：
- 新增 `scripts/generate-file-storage-governance-gate.mjs` 與 `storage:governance-gate`。
- Gate 讀取 latest monthly storage evidence manifest，透過 `getStorageEvidenceDashboard` 取得 governance snapshot。
- Gate 輸出 `file-storage-governance-gate.json/md`，包含 `blocked_missing_evidence`、`blocked_storage_integrity`、`observation_required`、`cost_review_required`、`cost_controls_required`、`stable` 等狀態。
- Gate 明確輸出三個管理決策：provider migration、lifecycle cleanup、alternate provider review。
- 新增 `scripts/qc-file-storage-governance-gate.mjs` 與 `qc:file-storage-governance-gate`，覆蓋 missing / blocked / observe / review / control / stable 狀態。

風險控制：
- Gate 是 evidence-only，不呼叫 Supabase connector，不連線 DB，不發出 provider request，不刪檔，不更新 metadata pointer。
- `blocked` 狀態會封鎖 migration 與 lifecycle cleanup；`control` 狀態只允許啟動 review / approval，不代表自動切換 provider。

## 62. 立即下一步

不建議現在直接搬檔到 Supabase Storage。建議順序：

1. 先完成 `DEV-SUPABASE-DB-001` 的 DB runtime staging/prod gate。
2. 等真實 PDM 檔案進入系統後，定期執行 `npm.cmd run storage:cost-report` 建立 baseline。
3. 先匯出 Supabase project inventory 並用 `storage:schema-target-readiness-package -- --projects-report <inventory.json> --expected-target-name AI_PDM_STAGING` 確認 dedicated `AI_PDM_STAGING` 或 disposable branch / shadow target 存在，不可使用既有 `ProJED` / `ProJED_TEST`；若需建立 target，先用 `storage:schema-target-cost-confirmation-package` 形成成本 handoff 並取得使用者明確確認 evidence。
4. 通過 target / cost gate 後，再用 `storage:schema-apply-gate` 驗證 Phase 4R SQL，接著用 `storage:schema-verify-gate` 做 read-only catalog / RLS / grant / seed 複核，匯出 Supabase security/performance advisor JSON 後以 `storage:schema-advisor-evidence` 標準化，最後用 `storage:schema-promotion-gate` 合流判定。
5. 用 `storage:schema-formal-review-package -- --target-readiness-package <storage-schema-target-readiness-package.json> --cost-confirmation-package <storage-schema-target-cost-confirmation-package.json> --user-cost-confirmed-evidence <user-cost-confirmation.json> --promotion-report <storage-schema-promotion-gate.json>` 產生正式 migration review handoff；只有 `ready_for_formal_migration_review` 才能送 review。
6. 在 staging 建立 private bucket 後，以 `PDM_STORAGE_PROVIDER=supabase_storage`、server-only service role key、`PDM_SUPABASE_STORAGE_LIVE_ENABLED=1` 驗證 upload / download / signed access，不做 production cutover。
7. 在 staging provider 補 live adapter execution gate；必須沿用 dry-run evidence、runbook、controlled execution gate、hash verify、pointer rollback plan，通過後才允許 pointer update。
8. 等真實檔案用量接近門檻時，選定第一個 S3-compatible provider profile，再補 signed request staging gate。
9. 補 live migration executor 的 provider adapter 層；預設 disabled，只有在 staging approval gate 開啟後才允許 copy object 到 Supabase / S3-compatible provider。
10. 補外部 cold provider / S3-compatible restore drill，讓 archive restore 不只停留在 local isolated restore。
11. 補 lifecycle policy 的 Admin 設定 UI / API；目前只有 dry-run 與 script-level env policy。
12. 視公司檔案量成長，選定第一個 S3-compatible / NAS gateway provider 做 staging dry-run，不與 DB production cutover 同時上線。

PM 建議：`DEV-STORAGE-COST-001` 可先列入 Backlog，但不要與 DB cutover 同時進入 production gate。
