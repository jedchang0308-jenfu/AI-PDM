# SPEC-PDM-ASSEMBLY-LEGACY-WORKFLOW-RETIREMENT-001

狀態：RD Implementation Complete / Human Confirmed / Local QA-QC PASS / Production Migration & Release Gated

DEV：`DEV-095`

Decision：`.ai-doc/decisions/ADR-PDM-ASSEMBLY-MASTER-ENTRY-001-canonical-workbenches-only.md`

## 1. 目的

在不破壞既有單一零件、圖號、料號、檔案與通用 BOM 能力的前提下，完整退役舊的組合件專用建立工作流與資料 authority，讓後續重建不必背負第二入口、submission assembly reference 或 CAD/XLS 建立路徑。

## 2. Human Decision Brief

- 組合件同樣具有圖號及料號，不應走不同入口。
- 先拆除舊組合件工作流，再設計新的最精簡流程。
- 正式環境尚未上傳檔案，測試資料不具保留價值；但本 DEV 仍不得未經 release gate 操作正式／主要資料庫。
- 新流程不是本 DEV 的隱含範圍；不得用 placeholder、redirect 或另一個新入口冒充完成。

## 3. Current architecture impact

Spec Impact：`Intentional replacement`。

直接取代 `DEV-060` 的獨立 `/bom/new`、三路徑、組合件證據分流、CAD／XLS source step、`from-assembly` adapter 與 controlled CAD source 延伸。保留 canonical Drawing／Part identities、BOM Revision 與 generic BOM workbench/review/release。

## 4. Current-phase RD handoff contract

### 4.1 必須刪除

- UI／navigation：`/bom/new` page、`BomCreateWorkflow`、sidebar `建立 BOM`、BOM workbench 內所有導向 `/bom/new` 的 CTA／空白說明，以及 inline SolidWorks XLS intake。
- API：`GET /api/bom/create-context`、`POST /api/bom/drafts/from-assembly`、`POST /api/bom/drafts/import-xls`。
- Domain writer：assembly evidence option/query、CAD source resolver、`assembly_component` 自動 materialize BOM、from-assembly draft、SolidWorks XLS import/profile/job writer、sandbox clone 的 assembly auto-BOM。
- Active contract：canonical BOM create 只接受 `source=manual`，不得接受 submission/package CAD source；clone 只走 canonical owner + manual source。
- Fresh schema：移除 BOM 專用 `source_revision_package_id`、`bom_import_profiles`、`bom_import_jobs`、`assembly_component` reference value，以及 `cad_reference`／`solidworks_xls` active BOM source values。
- Forward migration：提供 provider-aware retirement artifact，先列印／核對刪除數量，再移除舊資料與 schema；正式套用仍受 release gate。

### 4.2 必須保留

- `.SLDASM` 作為 Drawing revision `cad_3d` 的合法上傳副檔名與既有 preview/hash/reuse/read authority。
- Drawing／Part canonical workbenches、統一建立編號、relation matrix、檔案歸屬與 recognition 基礎。
- Generic BOM draft tree、manual edit、clone、review、release、obsolete、export 與 released-read permission。
- `file_references` 的 `drawing_model`、`derived`、`unknown`；不得刪除整張共用表。
- `DEV-041` 技術移轉 package、approval platform、change control 與共用 audit。
- `bom_headers`／`bom_lines` 若仍被 change-control 或 read projection 使用，暫保留為 shared legacy read model；本 DEV 必須移除其 assembly auto-writer，且 migration 刪除 `source='cad_references'` 資料。

### 4.3 API I/O

`POST /api/bom/drafts`

Input：`ownerPartNumberId`、`bomRevision`、`source='manual'`、`draftName?`、idempotency key。

Reject：任何 `cad_reference`、`solidworks_xls`、`sourceSubmissionId` 或 `sourceRevisionPackageId`，固定 422，且零資料寫入。

Output：沿用 canonical draft receipt 與 `/bom/workbench/[draftId]` URL。

Retired endpoints：writer route不存在，不保留410 compatibility handler。頁面與fixed context route應為404；舊POST path若被generic dynamic segment吸收，可回404/405，但不得進入handler或產生write effect。

### 4.4 Data and migration

- Fresh SQLite/PostgreSQL schema不得建立 `bom_import_profiles`／`bom_import_jobs` 或 BOM `source_revision_package_id`。
- Existing-provider migration 只刪除明確舊 authority：assembly component references、CAD/XLS BOM drafts及其依賴、CAD-reference legacy headers；不得刪 canonical manual BOM、Part、Drawing、file asset 或 physical bytes。
- Migration 前後必須記錄表／欄位 inventory、刪除筆數、canonical root/part/drawing counts、`PRAGMA foreign_key_check` 或 PostgreSQL constraint validation。
- Migration rerun 必須 no-op；任何 unmapped dependency、非舊 source 受影響、FK failure 或 primary-data fingerprint mismatch 都 fail closed。

### 4.5 Error and recovery

- Product code修改前必須有 Git checkpoint branch；復原使用該 commit，不以 reset/checkout 覆寫使用者工作樹。
- UI 移除後，不加「功能施工中」頁或 redirect 到另一個專用入口。
- Isolated migration失敗時保留原 fixture、manifest 與錯誤，不修改主要 SQLite。

## 5. UX intent

- 任務／結果：熟悉使用者在既有圖號／料號工作臺處理 identity；BOM 工作臺只續作既有 BOM。
- 主物件／主焦點：Drawing／Part identity；BOM workbench 的既有 BOM 清單。
- 預設刪除：所有 `建立 BOM` 專用入口、已偵測組合件卡、CAD/XLS來源卡、helper與空白 CTA。
- 保留舉證：BOM清單、編輯、審核與發行是既有資料續作所需；`.SLDASM` upload/preview 是 Drawing revision file capability。
- 非語言修復：刪除後維持原清單與編輯層級，不新增說明面板。
- 風險與驗證：404／405／422負向、1440×900／1024×768／390×844、visible error、overflow與dead link scan。

## 6. Acceptance

1. UI、navigation、API與runtime import對 `/bom/new`、`create-context`、`from-assembly`、`import-xls` caller 全為 0。
2. active runtime對 `assembly_component`、`cad_reference`、`solidworks_xls` 的 assembly intake writer全為0；允許 historical docs/migrations與明確 negative-test manifest。
3. `.SLDASM` accepted extension、`cad_3d`、preview/hash/reuse contract保持不變。
4. Generic manual BOM create/idempotent replay/tree edit/review/release snapshot targeted regression通過；既有diff/export/read code不得被本退役刪除。
5. Fresh isolated schema沒有已退役 tables/columns/check values；existing isolated migration apply/rerun與FK check通過。
6. 主要 SQLite 的schema hash、canonical identity hash、root/part/drawing/BOM counts、migration residue與FK check在所有build/test前後不變。既有runtime/WAL可改變raw container bytes，因此file hash只記錄，不單獨作logical data-integrity gate。
7. 三個 viewport 沒有死 CTA、visible error、非預期 4xx/5xx、水平 overflow或空白頁。
8. production connection/write/delete、deploy與release全部為 false／not run。

## 7. Stop conditions

- 需要刪除 `.SLDASM`、通用檔案／preview／hash/reuse、Drawing／Part canonical identity或 generic BOM review/release。
- 發現 production 或主要資料庫已有需保留的 CAD/XLS BOM、assembly reference或無法分類 dependency。
- migration 會碰到非舊 source、physical bytes、正式 root/part/drawing、或無法證明 idempotent／FK clean。
- 需要新增組立件專用入口或實作新的 `.SLDASM → 結構差異` workflow。

## 8. Execution boundary

本 DEV 可修改本機產品、fresh schema、forward migration artifact、測試與文件，並在 task-owned isolated data/repository 執行 QA/QC。不得操作主要 SQLite、正式 Cloud SQL、staging/production、deploy或release。

Future Phase Capsule：後續重建已立為 `DEV-096`，由既有 Drawing／Part workbench承接組立件限定的BOM action與共用BOM適用範圍；`.SLDASM`結構建議、root候選解析、同頁diff與一次套用仍是該DEV的Future Phase，尚未進入RD實作。

## 9. Local execution receipt — 2026-08-24

- Recovery checkpoint：`codex/checkpoint-pre-assembly-retirement-20260824-142931`／`d4a7c84e50d0f47d3c9167404753d03690204f66`。
- `npm run qc:dev-095`、`typecheck:app`與122-page isolated build PASS。
- manual BOM isolated regression完成create、replay、save、review、approve、Released snapshot與FK=0。
- 三viewport browser PASS；task-owned port 3195與isolated roots已清理。
- primary schema／identity／counts／residue／FK前後exact match；primary／production migration、deploy與release均未執行。
- 完整證據：`.ai-doc/qc/qc-dev-095-assembly-retirement-2026-08-24.md`。
