# ADR PDM ROLE POLICY 001：內部自用角色權限，單一原子套用

建立：2026-10-12；修訂：2026-10-26。狀態：`Accepted / Implemented / Production Released / Current-source Regression PASS / Whole Acceptance Partial`。先前Org consumer 401與PDM writer暫緩已由後續正式release關閉：AI-PDM main `ad74f179…`與OrgMaster相容reader皆承接100%正式流量，兩端protected workflow、candidate／canonical smoke及terminal receipt均PASS。此結果確認既定架構可發布，不新增state/readiness/generation、第二人核准或獨立啟用層；52 QA／17 AC／CG仍依實際證據逐項認列，不因release成功自動全數PASS。此ADR只記取捨，唯一行為／資料/API契約見[SPEC](../specs/DEV-123-role-permission-editor-contract.md)，案例與唯一結果入口見[QA §6](../qa/qa-dev-123-role-permission-editor-validation-plan-2026-10-12.md#6-2026-10-23-本機-implementation-evidence)。

## 問題與選擇

目標是管理者能在JF-FMS式矩陣與角色工作台調整七角色／五作業及自訂角色，OrgMaster仍指派人員。必要損失防護是未授權、錯誤覆寫、歷史／身份破壞與無法判斷套用結果；不把內部設定功能做成獨立治理平台。

| 決策 | 理由與代價 |
|---|---|
| 新immutable publication＋一次原子apply | 草稿／確認／異動可追查，沒有先發布再啟用的真實需求；不保留待啟用版本或第二人簽核 |
| 使用既有active版本與草稿revision | version/hash及revision已唯一綁內容，且retired不重新啟用；移除owner state/mode/generation與私有draft/confirmation hash，避免同一事實多份同步 |
| create用draft ID、save用revision CAS，只有成功apply入命令ledger | 前兩者可直接讀草稿恢復；真正改授權才需不可變防重／異動紀錄。少一套save/create命令及失敗狀態機，unknown仍先讀回 |
| 相容在首次／外部契約變更上線驗，日常不查readiness | 同一語意契約內增停／勾選不是重新部署consumer；刪額外compatibility projection/enablement binding，保留真實兩端驗證與先consumer後writer的發布相依 |
| 單一權威契約與成果負責人 | SPEC定行為，QA列驗證，ADR記取捨，任務／索引導覽；同切片RD收斂全部caller，不新增COO或固定跨角色簽核 |

只改UI label或OR舊能力會誤授審核／跨作業；另建permission override或改用OrgMaster HTTP判權會增加authority或同步依賴，均不採用。

## 必須保留與已接受的限制

七profile、九legacy身份／hash、採購／生管固定alias、system_admin受保護、direct global管理資格、原scope/期間/代理/priority/no-self及explicit-deny均依SPEC。20業務action含獨立view/download；原檔、Range、export/share與長任務重驗，external只受控project分享；不能以精簡放寬實際資料授權。

apply後新請求採新policy，已判權短請求可完成；browser暫存可失效，server保存與CAS負責正確性。OrgMaster人員任用／published-grant、DB及IdP依賴仍存在，這不是改成各系統配人或宣稱離線可用。

52目的／17AC／CG與真實consumer驗證保留，可參數化／共用旅程及有效證據；既有required CI、forward-only DB boundary與release執行器未改。現行contract pair以producer manifest的34欄為欄位基準，資料責任仍為三資料集，無state/readiness/generation。OrgMaster相容範圍維持[SPEC§9](../specs/DEV-123-role-permission-editor-contract.md#dev-123-orgmaster-compatibility)：其正式reader已發布，但人員指派、IAM與Secrets責任沒有移入AI-PDM。

## 替換與退出

本決策取代前版兩階段、全站policy鎖、browser硬門檻及本輪撤回的state/readiness／私有hash／三種命令ledger；它們不是未完成的待補gate。既有已發布契約不可直接刪欄或降版，breaking變更仍按版本／相容窗口處理。

本輪設計存量減少見SPEC§14，實際驗證見QA，未量測執行時間或正式成果，不宣稱效率提升。後續唯一成果負責人是承接DEV-123的RD；COO完成此次精簡後退出，日常實作、驗證與發布依既有流程。

## 2026-10-24 實作與發布現況

AI-PDM PR #474及OrgMaster相容實作已合併並通過各自required CI，兩端正式schema已套用。OrgMaster reader候選版在Platform session回401後執行既定恢復，仍由舊revision承接100%流量；因此PDM writer保持暫緩。精確來源、收據、原始失敗與剩餘驗證只在[QA §6](../qa/qa-dev-123-role-permission-editor-validation-plan-2026-10-12.md#6-2026-10-23-本機-implementation-evidence)維護。三資料集、34欄對外契約、無state/readiness/generation與DEV-035 fence的決策不變；schema成功不等於consumer上線或新矩陣啟用，未宣稱52目的／17AC／CG整體通過。OrgMaster範圍仍限已授權jenfu-platform-prod／orgmaster-prod的相容migration與reader部署，不含人員指派改寫、IAM或Secrets。

首次rollout沿既有35-prefix證據與38-entry真forward migration；保留worker runtime及sealed prepared分類，schema-only完成後才由full owner續接同capsule，詳SPEC§11及既有release spec§26.4／26.6。不新增mode、workflow、簽核或readiness狀態。

2026-10-23登入政策決策：人類選擇沿用現有公司Google管理員登入政策，移除本次實作額外加入的AAL2硬限制；不新增MFA系統，也不把AAL1冒記為AAL2。既有verified Principal/session及human_privileged、direct global exact-Principal system_admin資格保持，post-lock assurance須與registered session一致。此決策僅限DEV-123，不修改其他DEV-121管理API或SSO信任契約。

2026-10-24發布續接修正：正式schema已完成而consumer尚未就緒，原capsule到期後須以不可變prior38證據重新封存，不重送DDL。依既有app／worker來源分工，applied-only的DB/source觀察不重播保留worker的舊build graph；runtime/ref及普通worker流程保護維持。封閉forward索引、零Job association及schema-only派生旗標見release spec§26.4；不增加產品狀態、人工簽核或任意操作入口。實際source修正／驗證及尚未發布範圍仍只記QA§6。

2026-10-26既有操作接線決策：DEV-123只把model-basis、baseline draft及baseline release接到20個合併action，不為內部自用流程新增approval request、指定reviewer或第二人核准狀態。shared-model basis須drawing/model edit AND；同請求2D-only沿用既有`confirmTwoDOnly`並加drawing/model review AND；baseline draft須transfer edit；release須transfer/model publish AND。company／owner、Draft CAS、Released model、model part-root、required-MA與排除檢查及Principal audit維持，未授任一必要action即403且同交易無寫入。這是既有domain guard的授權接線，不把矩陣publish當成新審批平台。

## 2026-10-26 正式架構讀回

- AI-PDM PR #487與required CI完成後，owner release [40231963098](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/40231963098)以既有`prepare → build → migrate → candidate → verify → activate → canonical → finalize`流程發布；current schema沿已封存forward evidence重用，未重送DDL。
- OrgMaster release [40234669430](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/40234669430)的相容reader與正常Platform SSO、governance session、managed identity read及未登入／撤銷負例均PASS；這關閉首次writer上線前的consumer相容依賴。
- 正式AI-PDM正常Google登入後，矩陣、單角色工作台、歷史版本及停用角色皆沿同一active publication讀回；active view沒有第二個enable按鈕或額外readiness狀態。這是本ADR「一次原子apply、相容只在上線驗」的實際架構驗證。
- 正式歷史可讀到custom角色新增、能力變更與停用；停用後保留角色與歷史，符合既定生命週期。完整案例分母與未覆蓋範圍仍由QA維護。

## 2026-10-26 current-source regression readback

在不改變架構或正式資料的前提下，從最新 `origin/main` 建立隔離工作樹完成 current-source regression：DEV-123 contracts 62 files／595 tests、OrgMaster exact-source bilateral 1＋1、DB boundary、typecheck、DEV-117 continuous 497/497、continuous QC（isolated build artifact／primary／cleanup=true）及 abort 6/6 均通過。這驗證既有單一原子 apply、來源鎖定、CAS／unknown／撤權與發布控制契約未因文件同步而漂移；不新增第二套啟用層、readiness view、角色指派權限或 release gate。

此回歸不改判 52 QA／17 AC／CG 的正式完整度：正式逐一的 CAS／unknown／撤權競爭、20-action caller、七角色逐一任用與窄版 viewport 仍依 QA 的分層證據與未覆蓋標記處理。架構狀態維持 `Accepted / Implemented / Production Released / Current-source Regression PASS / Whole Acceptance Partial`。
