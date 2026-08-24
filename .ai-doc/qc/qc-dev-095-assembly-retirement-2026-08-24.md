# QC DEV-095：舊組合件工作流退役本機執行紀錄

狀態：Local QA-QC PASS / Production Migration & Release Gated

日期：2026-08-24

Authority：`SPEC-PDM-ASSEMBLY-LEGACY-WORKFLOW-RETIREMENT-001`、`ADR-PDM-ASSEMBLY-MASTER-ENTRY-001`

## 結論

舊組合件專用建立入口、CAD/XLS intake、from-assembly writer與自動materialize已從current product移除；既有Drawing／Part identity、`.SLDASM`通用檔案能力與manual BOM edit/review/release均保留。本輪沒有建立替代入口，沒有套用主要SQLite或正式Cloud SQL migration，也沒有deploy/release。

## 可恢復邊界

- 原工作分支：`持續優化2`
- 原HEAD：`c759a7bb572225b6323decc20243d535fba312ef`
- checkpoint branch：`codex/checkpoint-pre-assembly-retirement-20260824-142931`
- checkpoint commit：`d4a7c84e50d0f47d3c9167404753d03690204f66`
- checkpoint tree：`bd5be3e674a8b83e32810e0a9a183d12ec4b49c3`
- 建立方式：alternate index；沒有切換目前branch、沒有移動目前HEAD、沒有stage使用者real index。
- real index SHA-256：`F76A0FD16BB7A974FA26E3BF8D861BA0AFBF1240609FDC40A3DFF28467D65AE1`，checkpoint前後一致。

## 實作邊界

已移除：

- `/bom/new`與`bom-create-workflow`。
- `/api/bom/create-context`、`/api/bom/drafts/from-assembly`、`/api/bom/drafts/import-xls` writer。
- sidebar、BOM empty state與workbench的建立／XLS匯入CTA。
- `assembly_component`、`cad_references`、`solidworks_xls` BOM source與auto-materialization caller。
- `bom_import_profiles`、`bom_import_jobs`、BOM `source_revision_package_id`與相關repository contracts。

保留：

- Drawing／Part canonical workbench與圖號／料號identity。
- `.SLDASM`作為通用`cad_3d`檔案角色與generic CAD extraction能力。
- manual canonical BOM list、tree edit、review、release snapshot、diff/export/read。
- 技術移轉package；它不是組立件主檔入口。

## 自動驗證

| Command | Result | Coverage |
|---|---|---|
| `npm run qc:dev-095:retirement` | PASS | deleted paths、forbidden caller/writer scan、fresh schema、old payload guard、SQLite legacy fixture apply/rerun/FK、manual draft preservation、PostgreSQL 047 static boundary。 |
| `npm run qc:dev-095:manual-regression` | PASS | task-owned SQLite manual create、idempotent replay、1-line save、review、approve、release snapshot、FK=0。 |
| `npm run qc:dev-095` | PASS | aggregate retirement + manual regression + `typecheck:app`。 |
| `npm run typecheck:app` | PASS | current application TypeScript。 |
| `npm run build:isolated` | PASS | isolated build、122 pages；route manifest無舊入口／writer，build前後primary logical invariant hash相同。 |

Manual regression receipt：

- source=`manual`
- idempotentReplay=`true`
- savedLineCount=`1`
- reviewStatus=`PendingReview`
- releaseStatus=`Released`
- snapshot count=`1`
- `PRAGMA foreign_key_check=[]`
- 臨時SQLite與temp root於測試結束後移除。

## Browser / UI evidence

task-owned runtime：port `3195`，isolated `PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`與Next dist；既有port 3000 runtime未停止、未重啟、未挪用。

結果：

- Sidebar只保留`BOM 工作台`，無建立入口。
- BOM empty state只保留搜尋、狀態、重新整理。
- `/bom/new`=404；`/api/bom/create-context` GET=404。
- 舊from-assembly/import-xls POST因dynamic `[draftId]` route method boundary回405；無舊writer、無write effect。
- generic draft送source submission payload回422 `BOM_MANUAL_SOURCE_SUBMISSION_FORBIDDEN`；隔離DB `bom_drafts=0`、`bom_create_effects=0`、FK=0。
- 1440×900、1024×768、390×844無水平overflow、dead CTA或5xx；tablet初查發現toolbar壓縮，修正responsive CSS後三viewport重驗PASS。
- console/network僅有測項預期的404/405/422，無unexpected 5xx。

Screenshots：

- `output/playwright/dev-095-20260824-1515/bom-workbench-desktop.png`，SHA-256 `5ED7D2BCF0CB682CD25316D1831883855D2D9BC1350EFD5FF4CEC7AB88FEA318`
- `output/playwright/dev-095-20260824-1515/bom-workbench-tablet.png`，SHA-256 `3BE7AFF9DEA28E20D6FD6F5C73BD23E74D59F0CF03AF98601A3B6026B7CDAE57`
- `output/playwright/dev-095-20260824-1515/bom-workbench-mobile.png`，SHA-256 `914AAAAED926708C0A493E345DB71026459194D45A19EB99156DAEFD5FDA51EE`

Cleanup receipt：Playwright browser已關閉；port 3195已釋放；task-owned browser data/repository與dist roots已移除；QA screenshots保留作證據。

## Primary logical invariant

前後exact match：

- schema SHA-256：`b44df078de88ecbeef8afa67a8968a4fda283235bda66a354d54a0d6ba21b322`
- canonical identity SHA-256：`89d366ecd9f01a9ccbd40aee471f150b10d7b327d2263283c17c04131c6f7562`
- counts：companies=2、part_roots=3、part_numbers=3、drawing_numbers=3、drawings=52、bom_headers=0、bom_lines=0、bom_drafts=0、bom_lines_tree=0、bom_draft_floating_topics=0、file_references=0。
- migration residue：`pdm_local_data_migrations`、`pdm_workbench_migration_quarantine`，前後一致。
- `PRAGMA foreign_key_check=[]`。

主要SQLite raw file SHA在驗證期間有變化；當時既有AI_PDM port 3000 runtime與worker持續運作，SQLite WAL/checkpoint／runtime heartbeat可改變實體bytes。因schema、canonical identity、counts、residue與FK均exact match，本案採logical invariant作data-integrity gate，不把raw container bytes誤當業務資料變更。DEV-095的所有mutation均指向task-owned temporary SQLite。

## Migration / release gate

- SQLite runner `scripts/migrate-dev-095-legacy-assembly-bom-retirement.mjs`預設dry-run；apply必須顯式`--database`。
- 若指定primary path，還必須同時提供`--allow-primary`與exact `--expected-sha256`，apply前自動backup。
- PostgreSQL forward artifact為`db/postgres/047_retire_legacy_assembly_bom_intake.sql`。
- 本輪沒有執行primary apply、Cloud SQL migration、stage、commit、merge、PR、deploy、production smoke或release。

QC disposition：DEV-095本機拆除完成且可交付審閱；production migration與release必須另行授權並走release gate。新組立件建立流程也必須另立後續DEV，且入口只能整合進既有Drawing／Part工作台。
