# DEV-121：AI-PDM Principal-only 身分／授權整合（現行契約）

<a id="architecture-final"></a>

2026-10-03 已核准原生「候選安全中止後續發」修正：普通 Principal-only 候選的 PRE_ACTIVATION_ABORTED 不偽裝 RELEASED，也不重用 terminal capsule；已封存 PRE_ACTIVATION_ABORTED 的未過期 capsule 在正常 stage 的 provider mutation 前拒絕，rollback 收束保留。routine producer 由已封存 failed intent 唯一引用的完整 RELEASED Principal anchor，核對原生 source/build/migration/entry/rollback/control 與實際 Build／Registry；兩份 authority 凍結相同 basis。prepare（含 cached replay）以既有 own GCS／Run 權限重讀封存鏈、已過期 failed-run lease、無切流／無 tag、復原入口、100% Principal retained revision 與 fresh service UID，basis 不一致即拒絕。首次轉換的 manual-zero／maintenance recovery 路徑及正式來源、CI、CAS 規則保持有效。此修正只接受 failed intent 直接引用完整 RELEASED anchor；若後續候選再中止而其直接 baseline 也是 aborted intent，仍 fail closed，不遞迴猜選或沿用未核准 carry-forward。此修正的本機/mock PASS 不替代 Production L4。

## 唯一施工入口

文件角色：CURRENT_CONTRACT。本地 `AIPDM/DEV-121#target-authorization`／`#principal-consumer-impact`，來源 `JENFU/DEV-015`，producer `ORGMASTER/DEV-057#identity-grants`；沿原任務。架構已定案，程式／整合／正式完成度另依本輪身分／授權證據。

2026-10-03 人類已收斂本輪為 Principal-only identity/auth integration。出口是既有用途的 verified actor、唯一 published grants、scope／撤權、reviewer／owner、command／receipt／worker provenance 與安全發布／回復一致；一般 canonical lifecycle、首次發行 UI、Drawing master lifecycle 同步及附件／工作流功能整理由 [DEV-122 集中問題列表](DEV-122-ai-pdm-internal-function-issues.md) 延後。已完成 local 修正與原 FAIL 證據保留，不回退、不算 auth 邊界 PASS；新 077 不隨本輪發布。安全／可靠發布具有直接因果的修正仍在本 DEV，不能移去延期。

[HISTORY_ONLY原文快照](DEV-121-target-authorization-boundary-history-2026-10-03.md)保留Rxx施工、舊bridge／cohort／双軌、AAL2強制與local ACL歷史，不能繼續按它實作。當前續點只維護於 [DEV-121任務](../dev_task.md#dev-121-current-contract)，跨owner流程階段及根因只在 [JENFU既有盤點](../../../Jenfu-Platform/ai-doc/qa/DEV-015-principal-only-authorization-inventory-2026-09-29.md)；不把規格頂部快照當新發布狀態。

## 責任與唯一授權接口

`principal_id` 是唯一安全主體。Platform負責verified provider登入、SSO、session／撤銷；OrgMaster發布Principal、Employee狀態、角色、scope與委派。AI-PDM統一解析verified actor、讀grant，判斷自己的capability、company／resource、owner／reviewer及業務狀態。OrgMaster不需要逐一對接AI-PDM API或worker用途。

唯一正常角色來源為 [OrgMaster principal-effective-grants v4](../../contracts/orgmaster-ai-pdm-principal-effective-grants/v4/contract-manifest.json)，對應 [OrgMaster現行producer契約](../../../OrgMaster/ai-doc/specs/DEV-057-identity-and-grant-contract-boundary.md#architecture-final)。AI-PDM本地能力定義用 [active role catalog v5](../../config/access-control/jenfu-role-catalog.v5.json)與[route/method permission map](../../config/access-control/jenfu-route-permission-map.v2.json)，同snapshot核對正式publication version/hash及stable role定義；缺失／漂移不是「沒指派」，503拒絕。

所有登入、SSR／middleware、API、業務命令、reviewer selector、下載、背景與audit均抵達同一verified Principal／owner evaluator。沒有 `legacy_compatible`、`legacy_authority`、逐人marker、principal-keyed本機ACL或UID／email／`pdm_user_id`授權fallback；不可從sessionUser.role、display role、command參數或Platform可見性補grant。history pair是provider核實資料，PDM profile id是業務關聯，不可用它重建／覆寫principal或產生 `pdm:<id>`。

<a id="principal-implementation-contract"></a>

## 身分、profile及session

exact provider pair／Principal／Employee／account type先核對active typed producer，結果恰一筆；Employee可有多Principal、多alias屬同Principal仍須同Employee/type及一致grant集合。未知歸屬、class、source version、profile／company或多義mapping拒絕，不猜測email配對。

`principal_accounts`是application association／lifecycle，不是第二個Principal註冊處；同一company/profile/Principal唯一關聯，version/CAS受控。`pdm_user_id`、歷史users/UID與外鍵保留，舊role/membership/system-role mirror不授權。原停用、未核實者維持suspended；一次核對／轉換不等於enable。

完整核實的 account owner row 若為 `suspended`／`expired`／`offboarded` 或 `system_role_enabled=false`，屬已知不具登入資格，不是依賴不可用；typed producer 成功讀取但無 active pair 而回既有 `principal_not_active` 亦同：共享 API／命令 guard 以 401 `auth_session_invalid` 拒絕現有 session，正常 SSO 回既有 `principal_not_active` 且不建立 target session。缺少／畸形 account 或 profile association、無效版本／barrier、查詢失敗、歧義及 producer contract mismatch 仍 fail closed，不能降為已知停用；先驗整筆 metadata，再分類 account 停用，不能先用 revoked registry 短路而掩蓋依賴異常。既有 owner lifecycle command 同交易推進版本與 invalid-before 並撤銷 registry；重新啟用不復活舊 session，也不快取先前 allow。

新profile沿既有account-management及exact provision command，create-only輸入已發布target Principal/pair/Employee/type、expected source revision、已驗actor、server-bound company、operation id；accountEnabled省略false，初始沒有複製grant／delegation。callback不auto-enroll，email只contact。enable須producer active及既有顯式命令；停用／profile變版使現有session失效。runtime只授受控函式，不直接改安全state，不用GUC/marker繞過fence。 候選 publishedAt 以 UTC 六位微秒文字保留，禁止經 JavaScript Date 截斷；請求只接受有效 Gregorian UTC 日曆的三位或六位小數，原字串保留於 frozen command／input hash。三位毫秒僅等價六位且末三位為 000，不降低 native exact source CAS。新寫入與同操作重播由既有 owner 函式在目前 actor／permission 核對後先查 exact receipt，再對未成功操作驗 source；不在 receipt 前重查 target publication 阻擋已提交操作核對。

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
