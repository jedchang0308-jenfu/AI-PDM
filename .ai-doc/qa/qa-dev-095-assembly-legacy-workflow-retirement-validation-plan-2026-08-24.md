# QA DEV-095：舊組合件工作流退役驗證計畫

狀態：Executed / Local QA-QC PASS / Production Migration & Release Gated

Authority：`SPEC-PDM-ASSEMBLY-LEGACY-WORKFLOW-RETIREMENT-001`

## Risk

High。這是跨 UI、API、domain writer 與 schema 的 intentional replacement；主要風險是誤刪 `.SLDASM` 通用能力、留下隱藏 writer／dead link、migration 刪到 canonical manual BOM，或測試／build 誤寫主要 SQLite。

## Preconditions

- Git checkpoint branch與commit可解析，current branch/index未被checkpoint流程改寫。
- 每個 runtime宣告 project、purpose、port、process tree、cleanup condition、`PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`。
- primary SQLite 記錄 SHA-256、schema hash、roots/parts/drawings counts、migration residue、`PRAGMA foreign_key_check`。
- 所有 mutation 使用 task-owned isolated data/repository；不得 seed/clean primary。

## Cases

- `QA-095-001`：sidebar、BOM清單、empty state、全專案active UI不含 `/bom/new` 或組合件／CAD／XLS建立 CTA。
- `QA-095-002`：`/bom/new`與`/api/bom/create-context`為404；舊POST writer path即使被dynamic draft segment吸收，也只能回404/405且不得有write effect。
- `QA-095-003`：manual canonical BOM create成功且idempotency/readback不變。
- `QA-095-004`：generic create送 `cad_reference`、`solidworks_xls` 或source submission/package欄位固定422、effect count=0。
- `QA-095-005`：manual canonical create、tree save、review、release snapshot targeted regression通過；generic export／released-only route仍可編譯且未被retirement刪除。
- `QA-095-006`：submission/sandbox含舊 assembly-shaped reference不能自動建立 BOM header/draft。
- `QA-095-007`：fresh schema無import tables、BOM source package columns與舊source/check value。
- `QA-095-008`：isolated legacy fixture migration只移除old assembly/CAD/XLS rows並保留unrelated manual BOM；primary canonical root/part/drawing logical identity不變。
- `QA-095-009`：migration第二次no-op，SQLite FK=0；PostgreSQL artifact static/provider rehearsal可證明同一邊界。
- `QA-095-010`：`.SLDASM`仍通過 Drawing revision `cad_3d` extension、preview/hash/reuse contract。
- `QA-095-011`：retirement scan對任一舊route/caller/writer字串採fail-fast assertion；historical docs與DEV-095 migration/QC只可經allowlist存在。
- `QA-095-012`：1440×900、1024×768、390×844 hard reload與empty workbench無visible error、dead CTA、水平overflow或unexpected 5xx；負向404/405/422需與測項一致。
- `QA-095-013`：primary SQLite的schema、canonical identity、master/BOM counts、migration residue與FK前後完全相同；productionConnected=false、productionWrites=false。raw SQLite file SHA不是有既有runtime/WAL checkpoint時的有效logical invariant，僅記錄、不作本案成敗依據。

## QC evidence

- Static retirement manifest與negative injection結果。
- TypeScript、affected lint、targeted BOM regression。
- Fresh schema與isolated migration before/apply/rerun manifest。
- 三viewport browser screenshots、console/network/overflow/keyboard結果。
- Primary invariant before/after receipt與task-owned runtime cleanup receipt。

## Failure return

任一舊writer/caller仍存在、`.SLDASM`通用能力退化、manual BOM受損、migration非no-op/FK非0、primary invariant改變、visible error或production write，均為 Fail；回送 RD，不得用文件改寫為可接受偏差。

## Execution result — 2026-08-24

| Case | Result | Evidence |
|---|---|---|
| QA-095-001 | PASS | Sidebar與BOM workbench只有`BOM 工作台`／搜尋／狀態／重新整理；無建立／CAD／XLS CTA。 |
| QA-095-002 | PASS | `/bom/new`與create-context GET=404；from-assembly/import-xls POST=405，無對應writer、無資料變更。 |
| QA-095-003 | PASS | task-owned temporary SQLite：manual canonical create、idempotent replay、readback皆通過。 |
| QA-095-004 | PASS | browser隔離資料庫對source submission payload回422 `BOM_MANUAL_SOURCE_SUBMISSION_FORBIDDEN`；draft/effect counts維持0。 |
| QA-095-005 | PASS | repository flow完成1 line save、PendingReview、Approved、Released與1份snapshot；FK=0。 |
| QA-095-006 | PASS | active submission/sandbox repository無materialize caller；static retirement scan通過。 |
| QA-095-007 | PASS | fresh schema不含import tables、BOM source package欄位、assembly/CAD/XLS source/check值。 |
| QA-095-008 | PASS | legacy fixture首次apply只保留manual draft；primary logical identity/counts完全不變。 |
| QA-095-009 | PASS | SQLite migration首次apply、第二次replay no-op、FK=0；PostgreSQL 047 artifact邊界static PASS。 |
| QA-095-010 | PASS | fresh schema仍接受`sldasm`通用檔案角色，CAD extraction generic contract保留；typecheck/build PASS。 |
| QA-095-011 | PASS | `src/`與active `scripts/` forbidden-term scan為0；DEV-095 migration/QC明確allowlist。 |
| QA-095-012 | PASS | 1440×900、1024×768、390×844三viewport實畫面檢查通過；tablet壓縮問題已修正後重驗。 |
| QA-095-013 | PASS | schema hash、identity hash、counts、residue與FK before/after exact match；未連production、未寫production。 |

完整執行證據：`.ai-doc/qc/qc-dev-095-assembly-retirement-2026-08-24.md`。
