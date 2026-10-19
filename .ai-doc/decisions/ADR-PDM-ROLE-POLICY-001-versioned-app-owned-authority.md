# ADR PDM ROLE POLICY 001 應用自有角色權限與單一原子套用

建立：2026-10-12；修訂：2026-10-19。Owner：`AIPDM/DEV-123`。架構定案：**產品、安全與相容邊界已定；RD可採等效實作**。Human Confirmed；OrgMaster既有九身份任用相容／撤權阻擋局部切片 `Local Slice Verified`，DEV-123完整editor產品 `NOT_IMPLEMENTED`、52案/L4/正式啟用 `NOT_RUN`。[唯一契約](../specs/DEV-123-role-permission-editor-contract.md)定義資料/API，[五點精簡](../specs/DEV-123-role-permission-editor-contract.md#dev-123-self-use-simplification)記替換關係。

## Context

目標是內部自用的角色設定：七日常角色、五作業分組，同格勾查看/下載/編輯/審核/發布；角色可增停恢復，OrgMaster只任用人員。使用者已於2026-10-19同意精簡發布流程、business全域鎖、browser storage硬門檻、驗證紀錄及過細架構凍結；其後另授權OrgMaster既有九身份任用相容／撤權阻擋局部切片，不代表DEV-123 editor已開始或完成。

既有唯一active publication、九角色身份/history、OrgMaster provenance及shared PG boundary仍是實際相依。圖號/料號共用舊key及view配送原bytes的風險需要後端改造；不能只改UI label。沒有先發布、再由別人/排程延後啟用的實際使用情境，不需另建一套設定發布平台或SaaS機制。

## Options

| 選項 | 判斷 |
|---|---|
| 只做UI分組/OR舊能力 | 圖號與料號不能獨立授權，review可能誤成approve，下載可繞過；不採用 |
| 舊版preview持久化＋publish inactive＋另activate | 多出兩交易之間的失敗/復原、預覽過期、重複metadata與browser硬復原；本輪取代 |
| 任意覆寫生效資料、另存override或搬到OrgMaster HTTP判權 | 破壞版本/單authority或增加跨owner依賴；不採用 |
| 原子套用新immutable版本、沿既有scope/任用契約 | 同時保留易用、衝突防護、歷史及撤權，採用 |

## Decision

1. UI沿JF-FMS矩陣/工作台，同一draft/dirty/save/cancel，日常流程為**編輯 → 確認差異 → 套用權限 → 異動紀錄**。保存與預覽不授權；預覽即時計算、不另持久化。
2. apply在一次交易建立完整publication/entries、claim新identity、舊版retired、新pointer/generation、draft APPLIED與命令/差異紀錄。全部old或new；取消獨立publish/activate、待啟用版本與其恢復分支。不新增第二人核准。
3. publication的格式/baseline/protected/profile/base/command欄併既有publication；command結果與異動共用append-only ledger、server依資格投影DTO。不另建preview/metadata sidecar/audit表。參考新增state/draft/identity/command四資料集；RD可按獨立責任/生命週期/ACL採等效schema，不以表數當驗收。
4. 七日常profile保持RD、RD主管、QA/QC、生產人員、採購／生管、外部專員、PDM管理員。九legacy身份/原hash/順序不改；presentation與identity分開，採購用procurement canonical、生管production_planning為固定legacy alias。先驗原任用/history，再取canonical權限，原scope/期限/代理/priority不合併；alias status同步、無第二份新action。
5. system_admin保留hidden-protected及既有特權任用入口，固定保護能力/active狀態，不轉給pdm_admin。管理操作仍由當前direct global human_privileged資格取得，不能從名稱/checkbox自授或停用保護身份。OrgMaster仍唯一指派人員，不新增跨app任用權。
6. 四業務group×五action共20code、原66分類仍保留，共86；admin只讀protected。編輯含建改/附件/辨識/送撤，審核含審查/核准/退回，發布獨立；QA預設不授合併審核，不OR舊review。old true不補權、mapped false保留限制。canonical resource決定group，模型需要時AND parent action，未支援業務不復活。
7. 查看只回授權metadata/安全預覽，原檔/匯出/包/CAD/Range/share配送要view+download，不能inline/URL繞過。external只有project view，沿登入後有效share token/Released資料，server-bound project_scope_key與原assignment scope精確相等；舊share NULL不回填、不擴內部工作區。資料/欄位ACL依SPEC§3.6。
8. 生效時間點採**apply commit後開始的新請求使用新policy；已通過判權的短請求可完成**。不讓一般business write取得policy全域鎖；長任務最終採用、新配送及下一Range在fresh snapshot重驗。這明確取代「所有舊write必須先commit」屏障，不承諾取消既有請求或追回bytes。
9. server仍有requestId防重、draft/base CAS、confirmation重算、command/readback及同draft唯一套用；當前session/grant在管理鎖等待後重驗，callback無不可回復外部副作用。採既有provider或等效row-lock/unique/CAS，不強迫新增SERIALIZABLE/advisory框架或固定helper數量。
10. sessionStorage只是可選requestId/draft提示，無需保存完整body；故障不擋POST。saved資料/已套用引用/ledger是恢復真值，unknown不自動重送或假報成功，跨Principal不載前人資料。未保存dirty因reload遺失可以提示，不把browser持久化當資料/安全邊界。
11. catalog/role/schema對外hash、immutable history與v2/profile契約仍驗。完整registryHash描述權限語意、留在contentHash並由PDM source validation/confirmation驗證；它不固定在OrgMaster consumer compatibility row逐版核可。實際接線由source coverage驗；只有consumer schema/source/identity/scope/protected邊界變動才需雙端協作及相容宣告更新。純內部命名/私有API/confirmation hash/鎖法調整由RD同步程式與文件，不重問；外部breaking契約仍需版本及相容窗口。
12. 52驗收目的/17AC/CG01/02保留，依層級/風險取證。共用run metadata、參數化測試及一次整合/UI旅程可覆蓋多案，重用有效evidence及既有runner，只重驗受影響部分；不強制每case整包欄位或新增五套工具。缺必要層的證據仍不能宣告whole/正式通過。
13. OrgMaster相容只在SPEC§9 OM-C1..5列範圍：current/history/profile reader、七canonical/custom新任用、legacy alias/inactive歷史、原特權入口、compatibility_v2及真實往返。首次dynamic切換要實際consumer可用，可引用有效release/CI/整合證據，不為每次勾選重辦發布；普通能力改動不需OrgMaster source/deploy/compat row更新；marker/simulator不代真實驗收。

## Consequences

管理者仍能保留草稿、確認精確差異、套用後追查與從歷史建新版恢復；減掉獨立預覽/待啟用/硬storage復原狀態，沒有把正確性責任移到前端。已判權短請求可能在新policy後完成，長任務與後續請求仍受新授權；這是已確認的生效語意，非遺漏撤權。

合併紀錄的讀取資格靠server投影/裁剪，append-only與同交易保留；不將一般公司read擴為跨公司人員資訊。角色停用保留任用/history，恢復只採仍合法指派，system保護/原scope/priority/no-self不變。

RD能選內部實作，但不能放寬以上結果、資料責任或外部契約。沒有量測前不宣稱效能/工時改善；已驗證局部切片不代表DEV-123完整editor、DB/UI/L4或正式啟用已完成，也不宣稱獨立QC PASS。

## Migration and compatibility

forward-only、只ai_pdm_core/ai_pdm_contract、runtime無owner/DDL，narrow管理寫入、history immutable。首次migration DISABLED保留原legacy bytes/hash/pointer/grants；後續真正相容及owner條件滿足才可apply。對外versioned views及profile/header語意保留，內部API規劃改workspace/command v3；舊提案未實作，不建立平行舊mutation。

前一文件階段OrgMaster只列依賴；後續使用者已授權本次OrgMaster/AI-PDM本機修復與驗證，結果見QA §7。OrgMaster來源`AIPDM/DEV-123#orgmaster-compatibility`；正式release仍按既有protected CI/DB boundary與使用者環境範圍，本文不改執行器；未操作正式DB或runtime。

## Amended sources

本版替代2026-10-12方案中的兩階段、全站write fence、hard checkpoint、固定實作/證據要求；七角色決策仍有效。唯一SPEC/QA/dev_task/documentation_map與[DEV-121 prospective入口](../specs/DEV-121-target-authorization-boundary.md)同步，不改DEV-121/122歷史驗證或其他release/gate文件。不為此再開DEV/ADR/CAPA。
