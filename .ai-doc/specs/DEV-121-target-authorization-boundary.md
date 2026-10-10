# DEV-121：AI-PDM Principal-only 身分／授權整合（現行契約）

<a id="architecture-final"></a>

2026-10-03 已核准原生「候選安全中止後續發」修正：普通 Principal-only 候選的 PRE_ACTIVATION_ABORTED 不偽裝 RELEASED，也不重用 terminal capsule；已封存 PRE_ACTIVATION_ABORTED 的未過期 capsule 在正常 stage 的 provider mutation 前拒絕，rollback 收束保留。routine producer 由已封存 failed intent 唯一引用的完整 RELEASED Principal anchor，核對原生 source/build/migration/entry/rollback/control 與實際 Build／Registry；兩份 authority 凍結相同 basis。prepare（含 cached replay）以既有 own GCS／Run 權限重讀封存鏈、已過期 failed-run lease、無切流／無 tag、復原入口、100% Principal retained revision 與 fresh service UID，basis 不一致即拒絕。首次轉換的 manual-zero／maintenance recovery 路徑及正式來源、CI、CAS 規則保持有效。此修正只接受 failed intent 直接引用完整 RELEASED anchor；若後續候選再中止而其直接 baseline 也是 aborted intent，仍 fail closed，不遞迴猜選或沿用未核准 carry-forward。此修正的本機/mock PASS 不替代 Production L4。

## 唯一施工入口

此前Principal-only身分／授權出口及歷史判定保持。2026-10-06最高管理能力／typed caller／PostgreSQL只讀角色能力批次已完成protected release與affected Production驗收，依[本批owner closure](../qa/DEV-121-admin-capabilities-v6-production-closure-2026-10-06.json)與[現行任務](../dev_task.md#dev-121-system-admin-follow-up)認列；原local checkpoint未發布／NOT_RUN保留當時狀態，不改成正式PASS。只結本批既有子項；一般業務與其他owner義務不因本批完成。

文件角色：CURRENT_CONTRACT。本地 `AIPDM/DEV-121#target-authorization`／`#principal-consumer-impact`，來源 `JENFU/DEV-015`，producer `ORGMASTER/DEV-057#identity-grants`；沿原任務。架構已定案，程式／整合／正式完成度另依本輪身分／授權證據。

2026-10-03 人類已收斂本輪為 Principal-only identity/auth integration。出口是既有用途的 verified actor、唯一 published grants、scope／撤權、reviewer／owner、command／receipt／worker provenance 與安全發布／回復一致；一般 canonical lifecycle、首次發行 UI、Drawing master lifecycle 同步及附件／工作流功能整理由 [DEV-122 集中問題列表](DEV-122-ai-pdm-internal-function-issues.md) 延後。已完成 local 修正與原 FAIL 證據保留，不回退、不算 auth 邊界 PASS；新 077 不隨本輪發布。安全／可靠發布具有直接因果的修正仍在本 DEV，不能移去延期。

[HISTORY_ONLY原文快照](DEV-121-target-authorization-boundary-history-2026-10-03.md)保留Rxx施工、舊bridge／cohort／双軌、AAL2強制與local ACL歷史，不能繼續按它實作。當前續點只維護於 [DEV-121任務](../dev_task.md#dev-121-current-contract)，跨owner流程階段及根因只在 [JENFU既有盤點](../../../Jenfu-Platform/ai-doc/qa/DEV-015-principal-only-authorization-inventory-2026-09-29.md)；不把規格頂部快照當新發布狀態。

<a id="rd-capabilities"></a>

## RD 圖號能力修正（2026-10-10，CURRENT）

人類明確確認 RD 應能查看與編輯圖號、料號及送審，不能核准。沿用 `AIPDM/DEV-121#rd-capabilities`，不新增主 DEV。AI-PDM 定義角色能力；OrgMaster 發布人員的角色指派與有效期，仍是唯一指派來源。OrgMaster 本輪目前只讀；新版本相容讀取與其受保護 Production 發布正在等待新的明確跨專案授權，不從整合需要推定。

已證實：正常圖號 workbench 的 GET/list/detail 要求 `page:numbering.drawings.view`，v6 RD 缺少此項，雖有 active typed identity 與有效 RD grant 仍拒絕。料號要求 `page:numbering.search`，RD 原有。圖／料 work 的 `numbering.workspace.create/view/update`、圖號 draft 的 `numbering.draft.update` 及送審 `numbering.candidate.review.submit` 原本已存在；核准 route 要求 `action:approval.request.decide`，RD 沒有，不能將 approval request/batch create 當成 decision 能力。

最小來源變更：保留不可變 v6，新增 `config/access-control/jenfu-role-catalog.v7.json`（`ai-pdm.role-catalog.2026-10-10.v7`，SHA `4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9`）。只有 RD 增加精確 `page:numbering.drawings.view`；其 31 個既有 permission 與其他八個角色、身分／scope／推薦／委派 metadata 均不變。核准、發行、管理、未知能力仍不能從 RD 推定。consumer 精確 pin v7；不接受 stale v6 producer，不做 page/action fallback、帳號特判或本地角色複製。

新增 forward-only `085_dev121_principal_role_catalog_v7.sql`，owner profile order35；raw SHA `308fad28b4abfe1bc2106b79c1f410fad2cf2f6c2a0b3559517362f4ba6e7cba`，既有 owner compiler 去除 BEGIN/COMMIT 後 applied SHA `80e7085085a3bf8d220917a4790224b52a54cc2af788a0775d7aaedd629ce65b`。沿用081的精確 baseline/full-row、publication CAS、single-active、原子 transaction、replay/readback guard。只在 own schema 發布 catalog，不重寫任何 OrgMaster assignment、既有 migration 或應用帳戶。來源/archive驗證精確加入085，同時保留083/084的釘選；085沿081維護窗口 writer fence，不能與單筆歷史 cleanup operationRef 捆成同一 intent。

發布先後與阻擋：OrgMaster reader 必須先支援相同 immutable v7 artifact，保留v5/v6與所有 exact metadata/hash/tamper guards，再於AI-PDM受保護 owner 流程的完整維護窗口發布085與v7 consumer。目前可證的 repository 一般 prepare 只消費 optional recovery binding，fence bytes/live quiescence 在pending migration前由runner驗證，沒有已證的085 fence producer/readiness evidence。發布操作者須在 paid build 前確認同source的既有完整 recovery/fence 取得流程；不得假造收據或等到build後才發現缺proof。v6 binary在v7 publication後會fail closed，回復目標為既有無DB maintenance revision，不能降migration或將舊binary假裝相容。B35 program-only policy保留closed34/deferred084/read-only33，明確拒絕35-entry v7 package；不以program-only receipt宣稱085已發布。

驗收：合成有效 RD grant＋v6 重現 drawing denial；v7 同assignment允許drawing/search、edit/submit，核准HTTP403且無writer/receipt副作用；其他roles不變，錯kind/unknown/scope/identity/expiry/撤權拒絕。task-owned disposable PG驗 compiled085 baseline漂移rollback、兩個並行publication、精確replay、完整九roles及tampered metadata/role拒絕，所有runtime/port收尾。正式登入與編輯結果另驗，不以本地PASS替代兩fixture或本人驗證。證據入口：[本機驗證](../qa/DEV-121-rd-capabilities-v7-local-2026-10-10.md)。
<a id="authorized-first-login"></a>

## 已授權首次登入自動建立 PDM 帳戶（2026-10-08，CURRENT）

人類已確認新的業務規則：OrgMaster 已發布且生效的 AI-PDM role／grant 就是使用 PDM 的開通授權，不再要求 PDM 管理員另行建立應用帳戶，也不要求員工提供 Principal ID。正常順序固定為：Platform 已驗證 handoff → OrgMaster active typed Principal 與 authEpoch／revokedBefore 核對 → 讀取同一 Principal／Employee 的單一有效 v4 publication 與現行 AI-PDM role catalog → 若本地 `principal_accounts` 缺少才執行 owner-private 原子建立 → 重新讀回 active account／profile → 建立 Principal session。無 grant、失效 grant、inactive identity、Employee／Principal 衝突或依賴失敗均不得寫入帳戶或 session。

`083_dev121_authorized_first_login_account.sql` 只建立 AI-PDM 自有的 `users` profile、`principal_accounts` 唯一關聯、append-only provision operation 與 one-way cutover marker；不建立或複製本地角色指派。函式固定 application／company，Principal、Employee、account type、mapping version 及 publication 必須重新符合 OrgMaster published contract，顯示用 email 只能來自已驗 Platform handoff且不寫入唯一 email 欄位。既有 suspended／expired／offboarded／`system_role_enabled=false` 帳戶只讀回，不能被本流程修改或恢復；既有 Principal 關聯不一致、已存在但無完整關聯的 cutover 或 profile 缺失均 fail closed。Email／名稱相似的歷史 profile 不作關聯、更新或刪除依據。

來源 `published_at` 必須以 PostgreSQL UTC 六位微秒文字讀取；重用既有 `canonicalPrincipalSourceTimestamp` 驗證並保留原文送入首次登入函式，不經 JavaScript Date 正規化、截斷或放寬精確比對。三位毫秒只等價六位且末三位為 000；無效日曆與已損失精度的 Date 物件拒絕。

建立、operation receipt 與 cutover 在同一交易提交；Principal 唯一鍵、transaction advisory lock 與 SERIALIZABLE retry 保證重試／並行只留下單一完整帳戶。任何後段失敗回滾全部寫入。現行 Firebase email verified、issuer／subject、authEpoch、Principal revokedBefore、account lifecycle、session barrier 與 published-grant request-time enforcement維持。

<a id="unlinked-profile-cleanup"></a>

## 未關聯歷史 profile 的 generic 清理能力（2026-10-10，RD Implementation Ready）

沿用 AIPDM/DEV-121，這是對先前清理方案的 intentional replacement。公開來源只包含可重用程式、synthetic tests 與本契約；實際 Production 目標、操作者處置、私有 input、刪除前快照及執行 readback 分開保存在 owner 私有位置，不提交 Git 或公開 CI／PR。歷史 profile 的名稱與 Email 不構成已驗證身分、關聯或歸屬依據，清理也不證明首次登入問題已修復。

`084_dev121_unlinked_legacy_profile_cleanup.sql` 只安裝 migrator-only INVOKER 函式及固定 v2 snapshot guard；不含操作目標、不自行刪資料、不改 065／083 或 OrgMaster 授權。Runtime／PUBLIC 不得執行清理函式。既有 owner workflow 保留唯一 capsule，runner 保留既有四個參數；optional `unlinkedProfileCleanupRef` 只能是本 owner 私有 migration-bundle 子 prefix 的 exact URI／generation／SHA。私有 payload 是單一 bounded profile／company、UUID operation、owner、sourceRevision 與 reviewed 084 source hash；拒絕額外 key、SQL、schema／table、列表或 command override。

Source lock 保留無操作綁定的原 migration manifest；producer 從同一 protected source／profile／SQL 重算基線並驗證私有物件，才產生帶 ref 的 bundle manifest。prepare／build／migrate 及 runner 重新核對 bytes、generation、source、migration hash 與 capsule／bundle join；依賴失敗或漂移不得送出 Job。既有 bucket prefix 權限須 provider 回讀，不新增 IAM／資源。runner 可執行的 DB 函式固定，實際參數只從驗證後私有 payload 取得，DB 失敗訊息不輸出 target 或 snapshot。

首次 084 的 operation 和 ledger insert 共用既有 migration transaction；已套用 084 的重試在原 migration advisory lane 內另開短交易。每次最多 DELETE 一筆，完整 prior-row snapshot／UTC 微秒文字／hash 與 DELETE 同交易；v2 snapshot append-only。same target replay 必須吻合公司、operation、source／input hash、snapshot shape/hash 及目標已不存在；復原資料、receipt 竄改、異公司或異操作均 fail closed。無目標且無 receipt 僅回 ABSENT，不能據此認列刪除。

執行前核對 migrator、READ COMMITTED、schema／table／column／RLS／owner／catalog、065 guard hash、所有實際 FK 及已知 scalar／JSON encoded 業務引用，並以 task-owned transaction／table locks 防並行漂移。存在 Principal 關聯、cutover、lifecycle operation、password、引用或未知 schema／guard 時拒絕；不 cascade、不刪 child、不自動建立／恢復帳戶。標準私有 migration receipt 只含 ref/hash/generation、DELETED／REPLAYED／ABSENT、audit ID 與 prior hash，完整快照仍在 native audit。snapshot 供既有 owner 人工審查恢復路徑使用，不自動復原、不執行 down migration。

固定驗收：純安裝零 DELETE；單筆完整 snapshot/delete；重試與並行一致；transaction late failure 全回滾；參數／來源／generation／hash 不符、FK／scalar／JSON／跨 schema metadata 引用、schema／guard／receipt 漂移、PUBLIC/runtime 呼叫均拒絕且零副作用；公開新增內容不含實際 Production target／人員／處置／provider payload。聚焦 PG、runner／producer／owner proof 回歸及六項 release-adapter gates 通過後，走 protected source／CI／image rotation／owner migration；私有 target readback 與本人正常登入分開驗收。

<a id="system-admin-capability-batch"></a>

## 最高管理能力及 typed caller 修正（2026-10-05／RD Implementation Ready）

本批使用者已明確決定「Jed 為最高權限，權限全開」。安全主體、角色／scope owner 與 Principal-only 不變；只修復已核實最高管理角色的應用能力完整性、caller 的 permission kind、及角色能力讀取在正式 PostgreSQL 的失效機制。AI-PDM DEV-122 的一般業務修正與既有 dirty source 保留，不移入這一批；不新增主任務、第二個授權來源、通用能力編輯器或中央業務服務。

**已確認因果與尚待讀回。** 正常 Principal SSO 後，Jed 的 `action:settings.admin_matrix` 為 true，但 `page:settings.admin_matrix` 為 false；圖號 workbench 因 `page:numbering.drawings.view` 拒絕。v5 角色目錄聯集 66 個 kind/code，system_admin 允許 60 個；缺 `action:handoff.published.view`、`action:numbering.workspace.view` 及 `page:numbering.drawings.view`／`numbering.request`／`numbering.search`／`numbering.tasks`。這六項是已確認缺口，不直接等同完整正常入口分母。角色能力 GET 的 400 已讀回為 `UNSUPPORTED_DB_PROVIDER`：display snapshot 的 get/save 用 SQLite-only `getDb()`；service 的 catch 又呼叫同一 get，使 fallback 例外逸出。真實 PostgreSQL 新增驗證另確認 INSERT 仍用 SQLite 的問號 bind；本批改為兩種 provider 都支援的命名參數，不修改共用 SQL adapter。另有 v2 snapshot validator 要求 `mutationAllowed=true`，但 Principal-only current source 實際為 false，會拒絕合法只讀 cache。正式 readback 見 root 受控輸出 `Jenfu-Platform/output/dev-012/inputs/dev121-admin-capability-readback-cause-20261005.json`；這些是目前症狀與根因，不是修正 PASS。獨立 QC 另確認 HTTP source reader 沒有 OrgMaster session，會被 producer auth middleware 拒絕；因此正常讀取改用下述現有已發布 PostgreSQL 契約，不透過補 cookie 或假冒治理來源解決。

### 固定能力與 Principal 指派

- AI-PDM 的能力身份一律是 `(permissionKind, permissionCode)`。以現行 route/method map、實際 Principal evaluator／owner command、正常 page/nav caller 與共用依賴建立受控 active capability 清單；逐項有 caller／kind／用途證據。保留但沒有正常 caller 的歷史常數、已退休／明確不支援 route 不因同名就自動增權；未知用途須查明，不能猜映射或宣告退役。分母檢查同時比較實際入口與目錄，不能只證明 catalog 聯集。
- 建立新的 immutable `config/access-control/jenfu-role-catalog.v6.json`，version `ai-pdm.role-catalog.2026-10-05.v6`。system_admin 對上述每個有效 kind/code 都明確 `allowed=true`；其餘八角色的能力、stableRoleId、code、subject、risk、scope、委派與推薦規則不變。保持九角色與既有 canonical role/catalog hashing，重新產生本批確切 hash；v5 檔案、hash、已套用 SQL 保留。不在 runtime 使用 wildcard、未知 code 自動 allow、email／UID／Jed 特判或 role bypass。
- 發布前唯讀核對 `orgmaster_contract.v_ai_pdm_principal_effective_grants_v4` 與 typed active account：Jed exact Principal `principal-firebase-b71682bf0d7cc5596b48dfad991e4096`／Employee `employee-shijie` 已有效 `role-system-admin`／`system_admin`、subject principal、targetPrincipalId 同 actor、direct、global/null、無 delegation，版本／有效期一致。settings action allow 只能證明該能力，不能替代此 formal grant readback。未核實或缺指派不得改 email 綁定或自動啟用，也不移除禁止自我指派規則。
- 全能力不取消 same-snapshot Principal／Employee／profile active、company/resource、owner/reviewer、role priority／deny、委派、撤權、session、CAS、禁止自審／自我指派及稽核條件。system_admin 不傳播至同 Employee 的另一 Principal。未知／新增能力須日後顯式納入新版本，不從已授權全開推導永久自動擴權。

### Typed caller 與已發布 PostgreSQL 顯示契約

- 重用 `numbering-permission-codes.ts`，將 nav requirement 改為 typed kind/code，讀 `/api/numbering/permissions` 對應的 pages/actions；settings nav 使用既有 `action:settings.admin_matrix`，drawing workbench 保持 `page:numbering.drawings.view`。現行 `/approvals` 的 PrincipalApprovalInbox 與 inbox badge 使用 `action:approval.inbox.view`，舊 approvals URL 仍按既有轉址契約，不為 false `page:numbering.approvals` 新造平行能力。保留實際 API 的同 kind/code guard，不把 page/action 全域互換。permission response 及清單須涵蓋正常 nav 所需 action；歷史常數的移除／保留按 caller 證據記錄。
- 正常 GET `/api/settings/access/role-capabilities` 使用只讀 `ai-pdm.role-capability-workspace.v4`。以既有 `withPrincipalCompanyRead` 驗證同一 Principal／session／company／`action:settings.admin_matrix`，在同一 PostgreSQL transaction snapshot 讀取 `ai_pdm_contract.v_application_role_catalog_v1` 及 `orgmaster_contract.v_ai_pdm_principal_effective_grants_v4`。不呼叫缺少 OrgMaster session 的 HTTP role workspace、不轉送 cookie、不偽造 draft／governance revision，也不再依賴顯示快取作正常讀取。native published catalog 的版本、hash、九角色仍精確核對；錯誤回 redacted correlated 503。
- v4 顯示九角色的已發布能力，持有人統計僅為目前公司內、active AI-PDM profile 且有有效 global／該 workspace grant 的 distinct Principal 數。workspace key 重用既有 resolveJenfuWorkspaceScopeKey，company-jenfu 的 current／company-jenfu 為同一 scope；SQL 一併篩選且 COUNT DISTINCT，不能重算另一套 scope 或雙算。只以 principal_id／employee_id 的精確領域關聯限定公司，不回傳個人識別或混入 project-only holders；project 指派仍到 OrgMaster 查看。view 明列 `holderScope=current_company_workspace`、transaction sourceDataAt、`mutationAllowed=false`；既有 role selector／刷新／錯誤重試仍可操作。API 不修改指派、能力或 database，未知角色 404。
- 原 v2/v3 HTTP workspace／056 display snapshot 只保留歷史用途、資料及回歸證據；本批已完成的 async／named bind／timestamp／只讀 cache 修正不撤回，但不能作 v4 正常入口驗收。正常頁面只顯示已發布能力與上述 scoped holder counts；職位建議／草稿採用及特權指派編輯一律由 OrgMaster 管理。AI-PDM source 管能力，不新增 code-level permission 編輯器或另一個授權來源。

### 版本升級、受控停用與回復

OrgMaster 目前精確 pin v5 artifact/version/hash；其 reader 若未先更新，v6 publication 會使治理讀取 `EXTERNAL_CATALOG_STALE`。先在 ORGMASTER/DEV-057 既有子任務加入兩份已核准 immutable v5/v6 artifact 的精確 reader 支援：只接受當前 active producer rows 對應的一份完全相同 artifact，核對所有角色／hash／值，未知 version、混合 rows、tamper 仍拒絕；不合併兩版 grant，也不以舊版作 request fallback。source 跟 active catalog 選擇一致，database 讀回是目前能力版本的事實。這項責任涵蓋 `server/aiPdmRoleCatalogRepository.ts`、`src/governance/aiPdmCatalog.ts` 與 `server/aiPdmRoleCapabilityStore.ts` 的正常 server caller：不能只放寬 registry reader 而仍回傳 bundled v5 workspace。用本次 active artifact 的純 metadata 轉換傳給既有治理／role workspace 流程，不增加 process-global mutable catalog；frontend 顯示服從當前 server readback。原 v3 及本批 v5 的歷史 assignment role snapshot，只能與當前 stableRoleId／roleCode／subject／scope 等未變角色語義核對來源合法性，不提供舊 permission list；不重寫已發布版本或以歷史artifact授權。

AI-PDM 新 SQL 使用 `db/postgres/081_dev121_principal_role_catalog_v6.sql`：remote main 已占用 079／080（DEV-122），writer 的歷史 dirty 077 不是可用號碼。081 按既有 070 的 owner publication／CAS／transaction 模式精確核對 v5 baseline、插入 v6 九角色、retire v5 並原子推進 active pointer；unexpected baseline 或 v6 replay tamper 整個 transaction rollback。精確相同 replay 不新增 publication、entries 或權限。原 v3/v4/v5 history 保留，僅本 owner schema／versioned view；056 不改、dirty 077 不納入；079／080 已在現行官方來源／既有 owner profile，DEV-122 正式 R03 證據記錄 ledger 30。發布仍須 fresh readback 核對已套用 079／080 的 exact bytes，不將本批變成 DEV-122 DDL 發布；本批只在既有受保護 profile suffix 加入已審查 081（order 31）。

OrgMaster grant v4 使用 stableRoleId＋roleCode＋active catalog 的 subject/scope/delegation 判定；assignment 的 catalogVersion 是原指派 publication provenance，不等於當前 active capability catalog。升版不重寫歷史 assignment／published policy，不因 provenance v5 就重建 grant；以 native PG producer→consumer readback 證明升版前後相同 exact direct/global holder 與其他角色scope/撤權仍有效。新 assignment 仍綁當前精確 catalog；不要為此移除 catalog 的 stale/tamper 檢查。

採已授權的短停用視窗：先完成 OrgMaster v5/v6 reader 的 protected-source owner release 並讀回 v5 治理成功，再走 AI-PDM owner `prepare→build→migrate(081)→candidate→entrypoint→verify→decision→activate→canonical→finalize`。新版 AI-PDM Principal evaluator／role workspace 精確 pin v6，依相同 SQL snapshot 的 active catalog核對；無須再新增 AI-PDM v5/v6 runtime 雙版本或一輪僅相容發布。081 生效到新版切流間，舊 v5 binary 因 hash/version mismatch 會 fail closed 503；該窗口不得宣告入口可用或以舊版成功當 v6 驗證。窗口前讀回 current traffic、無其他 owner mutation、仍可用的 DB-free Principal-only maintenance recovery 與精確 source/image/ledger，按既有停用／回復規則限制流量。候選或驗證失敗依原生 owner 流程收束至已驗 maintenance revision，不 route 舊 v5 catalog consumer、不改 DB pointer 或 down migration、不恢復 UID 路徑；v6 publication 保留供修正後重發。三系統不因本批重開身分轉換；Platform source／traffic／資料不需要變更。

### 本批 QA／QC 出口（既有 P01／P03–P09）

1. 靜態與 unit：凍結 actual active caller 分母；所有 capability 在 v6 system_admin 明確 allow、其他八角色未變；typed nav／badge／API一致；未知code、wrongkind與 retired caller 不新增allow；role/hash/canonicalJSON完整，必要 source QC／boundary/typecheck 沿既有流程。
2. 真實 disposable PG：081 v5→v6、exact replay、tampered baseline／entry rollback、歷史保留；實際 OrgMaster v4→AI-PDM evaluator 的 exact Principal grant、allow/deny、company/resource/scope、撤權／expiry及非targetPrincipal；v4 正常 native read 的 assignment／revocation／workspace-scope 四階段及合法 current alias、current-company holder counts、未知角色及 zero HTTP RPC；歷史 056 async save/load v2/v3／timestamp／tamper 另記其原層級，不替代 v4。沿用既有 PostgreSQL harness與native owner migrations，不拿 mock 或 SQLite PASS代替。
3. 正式 candidate／L4：正常 Jed Platform→AI-PDM SSO後圖號 workbench查詢 200及 settings v4 published role workspace 200 current；既有 disposable 測試 Principal 的低角色deny、跨公司／資源deny、撤權／過期與local/global logout及復原；same Principal命令／receipt／audit關聯與禁止自審回歸依既有可用caller驗證。以使用者原失敗畫面的刷新／對應 hard-reload UI證據確認錯誤已消失；API成功不替代原畫面。OrgMaster native active v6讀回／v4 grants、AI-PDM100%newrevision、0tags、owner finalized及Principal-only recovery/cleanup均可追溯，未驗不能PASS。

本批只改共同根因及上述依賴，互相依賴的產品／測試／必要文件集中一批 PR（各 owner 各一批），保留 protected branch及必需CI。既有結案與DEV-122結果保留原ID／層級／取代關係；本批正式結果另記，不以文件定案、localPASS或角色code顯示判定完成。
### 正式角色能力頁的 admission 修正（2026-10-06，現行續點）

AI-PDM R3 的 Principal API／v6 已正式正常，但正常 `/settings/workflow` 先被 production slice 導向「未開放」，設定中心自身 limited navigation 又隱藏 workflow。此 caller 可用性缺口屬 ADMIN02／ADMIN04，不能以 direct API200代替原畫面；也不是 OrgMaster grant 缺失。只允許 active official-numbering-draft 的 exact只讀 workflow頁，讓 server-state limited設定同時顯示這一頁；未知slice、integration/system及workflow其他子路徑維持原限制。只讀 RoleCapabilitySettings 仍經 action:settings.admin_matrix 的 verified Principal/company PostgreSQL API，沒有編輯或舊ACL入口；不開放retired mutation。共用 limited-area policy 收斂三處UI判斷，不修改角色／scope／Employee／schema／Secret。

先證明 middleware/clientStatus 的 exact path 與實際 limited SettingsScreen 掛載回歸；已有 API／PG／catalog及Org22e81證據保留。與必要文件同一PR，合併protected main後普通AI owner修正發布；Production畫面、snapshot及清理未通過前，ADMIN04／05仍未完成。

## 責任與唯一授權接口

`principal_id` 是唯一安全主體。Platform負責verified provider登入、SSO、session／撤銷；OrgMaster發布Principal、Employee狀態、角色、scope與委派。AI-PDM統一解析verified actor、讀grant，判斷自己的capability、company／resource、owner／reviewer及業務狀態。OrgMaster不需要逐一對接AI-PDM API或worker用途。

唯一正常角色來源為 [OrgMaster principal-effective-grants v4](../../contracts/orgmaster-ai-pdm-principal-effective-grants/v4/contract-manifest.json)，對應 [OrgMaster現行producer契約](../../../OrgMaster/ai-doc/specs/DEV-057-identity-and-grant-contract-boundary.md#architecture-final)。AI-PDM本地能力定義用 [本批 immutable role catalog v6](../../config/access-control/jenfu-role-catalog.v6.json)（發布前正式基線 v5 保留）與[route/method permission map](../../config/access-control/jenfu-route-permission-map.v2.json)，同snapshot核對正式publication version/hash及stable role定義；缺失／漂移不是「沒指派」，503拒絕。

所有登入、SSR／middleware、API、業務命令、reviewer selector、下載、背景與audit均抵達同一verified Principal／owner evaluator。沒有 `legacy_compatible`、`legacy_authority`、逐人marker、principal-keyed本機ACL或UID／email／`pdm_user_id`授權fallback；不可從sessionUser.role、display role、command參數或Platform可見性補grant。history pair是provider核實資料，PDM profile id是業務關聯，不可用它重建／覆寫principal或產生 `pdm:<id>`。

<a id="principal-implementation-contract"></a>

## 身分、profile及session

exact provider pair／Principal／Employee／account type先核對active typed producer，結果恰一筆；Employee可有多Principal、多alias屬同Principal仍須同Employee/type及一致grant集合。未知歸屬、class、source version、profile／company或多義mapping拒絕，不猜測email配對。

`principal_accounts`是application association／lifecycle，不是第二個Principal註冊處；同一company/profile/Principal唯一關聯，version/CAS受控。`pdm_user_id`、歷史users/UID與外鍵保留，舊role/membership/system-role mirror不授權。原停用、未核實者維持suspended；一次核對／轉換不等於enable。

完整核實的 account owner row 若為 `suspended`／`expired`／`offboarded` 或 `system_role_enabled=false`，屬已知不具登入資格，不是依賴不可用；typed producer 成功讀取但無 active pair 而回既有 `principal_not_active` 亦同：共享 API／命令 guard 以 401 `auth_session_invalid` 拒絕現有 session，正常 SSO 回既有 `principal_not_active` 且不建立 target session。缺少／畸形 account 或 profile association、無效版本／barrier、查詢失敗、歧義及 producer contract mismatch 仍 fail closed，不能降為已知停用；先驗整筆 metadata，再分類 account 停用，不能先用 revoked registry 短路而掩蓋依賴異常。既有 owner lifecycle command 同交易推進版本與 invalid-before 並撤銷 registry；重新啟用不復活舊 session，也不快取先前 allow。

管理員手動建立 profile 仍沿既有 account-management exact provision command，create-only輸入已發布target Principal/pair/Employee/type、expected source revision、已驗actor、server-bound company、operation id；accountEnabled省略false，初始沒有複製grant／delegation。正常 callback 的缺帳戶分支則只依本節 `authorized-first-login`：有效 published grant 是啟用授權，無需第二次管理員開通；兩條路徑都不複製 grant／delegation。停用／profile變版使現有session失效，且首次登入不得恢復。runtime只授受控函式，不直接改安全state，不用GUC/marker繞過fence。候選 publishedAt 以 UTC 六位微秒文字保留，禁止經 JavaScript Date 截斷；請求只接受有效 Gregorian UTC 日曆的三位或六位小數，原字串保留於 frozen command／input hash。三位毫秒僅等價六位且末三位為 000，不降低 native exact source CAS。新寫入與同操作重播由既有 owner 函式在目前 actor／permission 核對後先查 exact receipt，再對未成功操作驗 source；不在 receipt 前重查 target publication 阻擋已提交操作核對。

正常認證只用Platform handoff v2。token固定header／signature/keyId/type/schema／app/audience，verified pair、principalId、employeeId、sessionId、principal epoch、lifecycle/profile version、company、原authentication time、issued/expiry及assurance facts/policy hash依既有owner parser核對。target session上限為既有8小時及sourceSessionExpiresAt最小值，不取短assertion expiry；token refresh不延長來源或改寫authentication time。cookie/credential不進command/receipt。

人類及管理員使用真實AAL1；AAL2只由可辨識provider TOTP fact表達，假AAL2仍拒絕。沒有逐人pilot、MFA豁免或email/domain推導；當前resolver policy hash變更使舊session重新登入。Google／GitHub／Cloud／Workspace MFA不變。

Jed同一Principal可依OrgMaster已發布rd／rd_manager／pdm_admin及scope完成日常工作；system_admin仍exact target Principal／direct／global，不是業務bypass，不傳播至同Employee其他Principal，不可委派或自審。

<a id="principal-decision-snapshot"></a>

## 統一決策、scope與交易

固定proof／signature可在snapshot前解析；可變session row、revocation、Platform principal state、typed producer、PDM account lifecycle/profile、OrgMaster grant v4、active catalog、delegation／公司與資源資料，在同一短REPEATABLE READ READ ONLY snapshot、同client與decision time讀取。缺state不當epoch0；任何依賴失敗不開旁路global connection或fallback。業務mutation在owner pinned write transaction內再驗同一proof／current state，至少既有RR或SERIALIZABLE強度，保留鎖與row version/CAS；retry須新transaction重新驗證，不復用舊allow。

company從可信session/profile／server resource確立；workspace `current`／`company-jenfu`只以owner固定映射解析，project scope從server resource解析，URL/body不是範圍證據。既有role priority、deny優先及delegation有效期／sponsor／資源predicate保持；有入口指派仍可能缺業務grant，不能借相似permission或猜測擴權。

route清單須與實際method、typed discriminator、exact permissionCode、SSR/middleware及共用依賴一致。每個必要能力對應allow、deny及scope證據；25個歷史缺碼按現行v5用途逐項確認，必要工作不能全部封閉後宣稱完成。未知用途須釐清，明確退役入口須可觀察403/410、caller清理及無正常舊路徑。

跨owner只用明列versioned contract，無cross-core FK/DML。外部HTTP／物件I/O／streaming不在長SQL交易；讀取與物件傳輸分階段，提交前重驗current authorization、resource版本與來源fingerprint。401表示session失效；403明確缺grant/scope；409 operation/source/CAS衝突；503依賴不可用或歧義，不能將503當預期deny。

## 命令、審批、outbox及重播

verified Principal從HTTP入口貫穿factory、業務mutation、receipt、outbox、audit；profile只補業務識別，不能覆寫principal。human缺actor拒絕，不能用system/server_internal fallback。同company/profile/principal關聯由owner約束核對；歷史receipt不重寫、不補造過去身份。

命令在同一owner transaction執行當前authorization、業務CAS、Principal-bound receipt與outbox。新actor envelope含actorKind/Principal/company/version；receipt另綁command/schema、canonical input hash、idempotency/effect key。相同key異actor或payload409，不回他人result；省略idempotencyPayload須hash完整command，不略過檢查。outbox碰撞不能靜默DO NOTHING後commit；失敗同交易rollback。

成功receipt replay先驗目前actor及結果存取權，再核對原actor/input；只回保存結果，不重做mutation/enqueue。已成功操作不能因target後來停用或publication更新而重新執行；未成功operation才驗當前target/source並寫入。unknown commit outcome先readback原operation／原input；序列化retry每次重驗actor，同ID異hash拒絕。

圖／料工作使用既有canonical workbench契約及immutable review package；正式anchor存在不等於Released。null歷史part外鍵可按source snapshot契約接受，不能用缺舊UID當安全拒絕原因。選reviewer須當前active Principal＋published審批能力＋資源scope、不同Principal與server狀態；既有會實際發布 production revision／pointer 的核准，還須在同一 published evaluator 及 owner transaction 驗 `numbering.publish`，不能借審批能力擴權。這個 authorization 修正獨立於 DEV-122 的新發行 intent／master lifecycle，不讀舊users.role／membership selector授權。零適格reviewer是明確業務結果，不能改用system_admin或自審；submit/detail/decision均須可操作且持久化结果一致。

<a id="principal-transfer-action-registration"></a>

技轉審批及action registration沿既有producer/consumer contract與實際caller，在same snapshot驗能力、package/version、reviewer、scope及業務state；不得為驗證刪除／重建既有工作或人工改Released。本輪 F06/P06 驗證既有可用技轉 caller 的 Principal／scope／reviewer／receipt，不能用新生命周期發行功能填充授權測試前提；首次發行與 canonical/master 同步缺口記 DEV-122，並保留原未完成事實。

## 背景及檔案授權（AI-PDM 既有用途）

workload actor與human actor分型；僅server註冊的worker identity可帶精確purpose/capability/company，claim/lease/holder/source hash及完成均驗證。2D preview／Document Manager與其他原生用途在AI-PDM內部worker契約設定，不靠OrgMaster人類角色增權。事件保留original initiator Principal，不把machine當人類或由profile重建principal。

已提交技術job可按既有契約在人類logout後完成；結果採用仍重驗current human capability／scope／業務state。outbox只對實際存在的consumer驗證delivery／retry／idempotency，不把mock稱live或為統一新增中央publisher。指定Windows正式主機驗證已由人類取消，不據此取消實際工作／用途邊界，也不宣稱主機部署PASS。

既有檔案用途按可信 company/resource/purpose、exact generation／hash 及既有下載條件授權，無 public／release-bucket／UID fallback。Principal 與 workload actor 的邊界、initiator、scope、撤權、receipt 與 exact object access 屬本 DEV；附件持久化、UI／採用及一般生命周期功能整理記 DEV-122。已執行 storage apply 的 provider-format validator／immutable claim／effective IAM readback 具有可靠發布因果，仍由本 DEV 收束；資源 PASS 不等於 runtime 啟用或 live bytes PASS，既有 US$10/月初期目標（非硬上限）與原 data/resource 限制保持。

### Released submission 分享邊界（DEV-121，2026-10-04）

內部分享清單／建立／撤銷使用既有 published `submission.share`，在 verified Principal、company resource、command receipt、outbox 與 tenant audit 同一授權流程中核對。建立只允許同 company 的 Released submission 且已有 release package；撤銷須將 share id 綁定 URL submission id。profile id 僅作既有領域外鍵，audit 的 `securityPrincipalId`、command receipt 與 outbox 綁定 verified Principal；bearer token 原文只在首次建立的 HTTP response 返回，receipt／outbox 不保存 token。

公開 share metadata／package 的 opaque token 僅選擇 share row，不再是授權主體。兩個 GET 都要求已驗證 Principal 及 published `submission.view`，同 snapshot 核對同 company、active／expiry／revoke 狀態、Released submission 與 package；package 下載沿既有 bytes/checksum 驗證及 Principal storage audit，另記 share id。這不發布新的外部角色或能力。

供應商回覆 POST 保留 route，並在 Principal session 驗證後回 `503 supplier_reply_policy_unavailable`／`DEFERRED_DEV122_POLICY_NOT_RETIRED`；目前 role catalog／controlled contract 沒有已發布的 supplier reply capability、recipient actor 或外部身分契約，因此不接受 token-only 回覆、不寫 response／audit，也不宣告功能已退役。後續是否允許外部供應商回覆及其可回覆對象仍待既有業務 owner 明確定義與發布權限，不能借用 `submission.share` 或 `submission.review` 擴權。

### Settings Secret probe 的發起者與執行者（DEV-121／P07–P08，2026-10-04）

正常設定中心的 draft／test／activate／revoke 四個 POST 共用 `settings.secret.manage` 的既有 Principal command ingress 與 command-time grant／company 檢查，不以 legacy display Admin 或 profile 重新決定權限。Secret reference 維持既有 application-wide integration config；company 欄位保存操作者與 queue 來源，並非新設租戶 Secret 服務。資料改動、canonical receipt／outbox、lifecycle event 與 human audit 使用同一交易；provider I/O 在交易外，先驗 current Principal／permission 與 replay，再寫 provider，最後重新核對並提交。Secret value 不進 command／receipt／outbox／audit；commit 失敗的 provider version 保持未引用，不自動啟用或刪除。

新 `078_dev121_settings_probe_principal_provenance.sql` 直接保存 queue 的 `company_id`、`initiator_principal_id`、`initiator_profile_version`、固定 `settings_secret_probe` purpose；composite account FK 與 immutable trigger 保護綁定。`created_by` 保留 PDM profile 領域外鍵，不可用它或 reference creator 反查安全身分。歷史缺 typed actor 的 pending／running job 保持原狀且不 claim／heartbeat／讀 credential／complete，不猜回填；需合法新工作時由正常 human command 另提交，不靜默改寫舊 job。077 一般 canonical lifecycle 未套用、保留 DEV-122 延後，不隨這次 source bundle 發布；native owner manifest 精確 076→078，而非改動已套用 migration。

四個 probe worker caller 維持 server-verified technical workload／purpose／capability；holder 與 60 秒 lease 檢查一致，provider read 後回傳前再次驗證 lease/reference，不能把 credential 回給前任 holder。完成結果同一 transaction 保存 original queue initiator、company 與 technical executor 到 test run／lifecycle event／audit，`tested_by` 是 queue profile，不能錯用 draft creator；revoked／retired reference 不因晚到 passed callback 復活。原已提交技術工作在 human logout 後按既有契約完成，不冒充人類 session。

驗證按層標示：unit/mock、actual PostgreSQL transaction／native 078／consumer、owner CI、Production workload 都分別記錄。此修正尚未發布或完成 L4；既有 R67 Preview／Recognition 穩定鏈可按 source-byte 適用範圍沿用，不能代替新 probe 的 Production allow／deny／initiator 稽核證據。078 標示 `new-version`：nullable 欄位保留既有 Principal-only revision 的讀取與不改 actor 的歷史 UPDATE，但新 INSERT 必須由 Principal-aware writer 提供完整 typed actor；部署短窗內舊 enqueue 缺欄位會 fail closed，不能宣稱全面向後相容。回復舊版會恢復本次已知 probe actor 缺口，而且舊 enqueue 仍被新 trigger 拒絕；不能把本批證據投射回舊版，回復／停用選擇沿現有 owner 契約核對，不新增雙軌授權或發布關卡。

## 交付順序與恢復

沿既有共同根因與 F01–F10 的身分／授權觀察，先真實 disposable PG 的 OrgMaster v4 指派／撤權／scope 整鏈，隨安全修正驗證，再核對既有技轉／背景 caller 及三系統登入／登出。正常API/命令/workers/caller inventory與共用依賴需一起收束；已不必要的legacy caller刪除，不為準備退役路徑加新功能。SQLite/sync 整併、工具整併、一般美化及 DEV-122 的生命周期／附件功能留後續；不能把這些延期項計作 shared grant 整合失敗或假定已驗收。

正式前先讀回active/suspended/unverified帳號、sessions/codes、背景寫入、排程及current revisions，確證舊binary writer不可再寫。對已核實需要繼續使用者做source-bound一次性owner forward-only轉換及readback，unknown歸屬維持停用；歷史users/UID/FK/receipts保留。applied migration不改，精確ledger與新ordinal由owner profile及fresh source binding核對。

完成授權整合候選、必要 PG／跨 owner 身分與授權驗證、Principal-only recovery 後，沿 owner-native 流程發布。首次共同主體轉換或本次存在實際共享啟用依賴時，才協調同一受控停用視窗及 producer→consumer 啟用順序；共享契約已生效且未變的 AI-PDM 安全修正，以本 owner 發布、必要 consumer 回歸、Production L4／回復完成，不重開共同轉換，也不要求未变 sibling 重發。machine source/image/plan/receipt 綁定更新不是新的人類架構決策；保留正式來源保護及必需 CI。切後只能恢復 Principal-only 已驗版本或停用，不能舊 UID 授權版本。共同 grant 邊界失敗沿既有8次門檻通知重新估算，先取得新證據再修正，無因果更新不盲重試；一般業務／工具失敗不加算。

## 固定驗收（沿原P01–P09與共同F01–F10）

| ID | 現行可觀察結果 |
| --- | --- |
| P01 | Portal 可見但無業務 grant 拒絕；合法 role/scope 經既有 caller 可得到正確 allow 與保存結果，內部功能另列實際未完成狀態 |
| P02 | mapping／assignment／catalog／epoch各自來源版本核對，不跨namespace誤比 |
| P03 | OrgMaster唯一grant v4／current account／resource同snapshot；指派、撤權、scope及race整鏈 |
| P04 | 缺/歧義profile、class/company、badversion、無verifiedactor、假AAL2與偽造owner拒絕，無fallback |
| P05 | 正式缺/未知mode拒絕；可信workspace/project/resource與跨company負向一致 |
| P06 | route/method/SSR、permissioncode、rolepriority、reviewer、命令、receipt/outbox/audit及worker initiator一致 |
| P07 | 原authTime、source/target TTL、AAL1合法allow、policyhash、撤權/expiry/local/global logout及重新登入 |
| P08 | 一次轉換preflight、DBwriterfence、unknownoutcome/readback、idempotent replay、Principal-only recovery及cleanup |
| P09 | 每項既有必要能力有用途、角色 allow/deny/scope 或明確退役；正常入口、actor／receipt／object 授權按實際層級認列，DEV-122 功能延期不冒稱 PASS |

[JENFU主責驗收與F01–F10](../../../Jenfu-Platform/ai-doc/specs/DEV-015-authentication-authorization-boundary-refactor.md#architecture-final)包含登入、指派、查詢、建立、審批、下載、背景、登出與回復；DEV-118/C01/C02與DEV-014原分母保持各自結論。每項進度只按本機／整合／正式證據標記；operator讀回不是service修復，合成session不是real-provider，部分帳號成功不是三系統結案。

AI-PDM DEV-121 可依自己的 Principal consumer 正常入口安全、正式 owner release／L4／recovery 出口獨立結案；DEV-122 的一般功能延期不阻擋此出口。`JENFU/DEV-015` 彙整三 owner 的 joint 身分與授權整合結果；任何一個 owner 的 PASS 只證明自己的範圍，不推定 joint PASS，也不替其他 owner 結案。AI-PDM 結案仍須自己的實際正式證據，不能由文件收斂或本機 PASS 代替。

scripts/dev121-smoke-credential-reauth.mjs 預設只驗證；明確 --commit 才可更新 AI-PDM 自有 refresh-token Secret 與 production GitHub environment secret。操作者使用既有帳號密碼；不建立／重設帳號、不發送驗證 email、不變更綁定或 grant，且仍核對 provider email 已驗證。正式執行須明確成對提供 --previous-version N --new-version N+1；producer 確認簽章 password token 的 issuer／subject、帳號已驗證且未停用，走 Platform 正常 Firebase session、/api/auth/me 同一 Principal／Employee／AAL1、logout 後 401。email、密碼、token、cookie 只在記憶體使用，不輸出或存檔。明確版本必須是 canonical 正整數、安全整數且相鄰；provider latest 與新增後 latest 必須逐一等於綁定版本，race 或讀回不符即不寫 GitHub secret。無參數仍保留歷史 4→5 相容預設，不可當作動態正式版本選擇。成功僅寫 AI-PDM 自有 release bucket 的 receipts/credential-reauth/ 不可變證據；Platform consumer 限定 AI-PDM、此 rotation mode、同一 source、bucket/prefix 與 plan numeric version，並保留五分鐘 fresh-auth barrier。R79（2026-10-04T02:38:30.564665Z）Platform POST 回 401，02:38:38.744832Z 決策碼為 auth_token_invalid 後以 PRE_ACTIVATION_ABORTED 安全中止、traffic 保持 R78；v5 auth_time 早於或等於 Jed global logout 2026-10-04T00:19:50.680Z 是有證據支持的因果推論，current database revokedBefore 未直接讀回，根因仍未定論。R79 後本機動態 5→6 producer tests 19/19 PASS，尚未經 official required CI、clean-source owner release 或 Production smoke 驗證。既有 identity-readback v1 與其他 owner consumer 不變；本證據不宣稱全專案 user count、global auth config 或 first-principal bootstrap。

## 歷史引用入口（非施工指令）

<a id="principal-consumer-impact"></a>

歷史段落：[principal-consumer-impact](DEV-121-target-authorization-boundary-history-2026-10-03.md#principal-consumer-impact)；查明舊決策或證據時才讀取。

<a id="principal-review-20260924"></a>

歷史段落：[principal-review-20260924](DEV-121-target-authorization-boundary-history-2026-10-03.md#principal-review-20260924)；查明舊決策或證據時才讀取。

<a id="principal-owner-command-amendment"></a>

歷史段落：[principal-owner-command-amendment](DEV-121-target-authorization-boundary-history-2026-10-03.md#principal-owner-command-amendment)；查明舊決策或證據時才讀取。
