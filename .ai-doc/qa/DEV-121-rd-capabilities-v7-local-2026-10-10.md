# DEV-121 RD capability v7：本機驗證（2026-10-10）

範圍：AI-PDM／DEV-121#rd-capabilities。Base `71df57ff2ffc05a8a8cb18d1956758f360d3e138`；branch `codex/dev121-rd-capabilities-v7`，沿用root既有worktree、開始時tracked clean，私人未追蹤證據保留。完整AGENTS已讀；Platform/OrgMaster未修改。

## 已證實根因與修正

有效identity與RD published grant存在時，正常drawing workbench先要求 `page:numbering.drawings.view`；v6 RD沒有，因此先回`permission_not_granted`。圖/料edit與submit action原有，不能把此拒絕誤判為應用帳戶未開通。v7只補該page，RD其餘31項與八角色完全不變；approval.request.decide及其他核准／發行能力仍未授予。所有Principal、scope、owner/reviewer、CAS、撤銷及authEpoch規則保持。

核心diff：新immutable catalog／deterministic builder／forward085；兩個current consumer pin與相應測試/合成native fixture版本；owner profile追加order35、source-proof精確raw/compiled pins、085維護窗口fence。舊v6/081不改。B35只更正historical test fixture與增加35拒絕案，產品34/readonly33 policy不改。Public來源只含generic/synthetic資料；Production資料與既有歷史清理證據未放入repo。

## 本機證據

- Synthetic RED：v6有效RD grant的drawing allow案失敗 `permission_not_granted`；其他既有能力PASS。GREEN：10 focused files／110 tests PASS，包含圖/料editor actor投影、正常route的exact code、HTTP approval403及零writer/receipt、八角色相等、scope/kind/unknown/identity/expiry、既有Principal request revocation。
- Deterministic builder：3 tests PASS；v6/hash/template tamper拒絕，v7與085 exact生成檢查PASS。
- 原生 disposable PostgreSQL：7 groups PASS；使用實際owner compiler的085 applied bytes，v6 readback拒絕、baseline漂移rollback、parallel出版只有九筆完整新roles、exact replay只有一筆active publication／18 historical+new entries、RD edit/submit保持與approval deny、publication metadata／role tamper拒絕。不是Production DB或實際OrgMaster producer驗收。四次harness過程中的setup view順序／SQL NULL fixture修正有原FAIL紀錄；最終正確raw與compiled驗證PASS，未放寬產品guard。
- `typecheck:app` PASS。
- `check:db-boundary` PASS（22 governed files）。
- 原precommit `test:dev-117:continuous`：240/240 PASS（當時HEAD34）；CI補修後以已提交v7目錄Git HEAD重跑241/241 PASS；source-proof 定向回歸152/152 PASS（與continuous分母部分重疊，不相加）。最初source-proof正向fixture錯把raw SHA當applied SHA，修正成實際owner compiler的80e…後PASS；拒絕guard未放寬。
- 原precommit `qc:dev-117:continuous`：279/279 PASS（當時HEAD34）；CI補修後重跑相同17檔owner regression集合280/280 PASS；Sharp canonical preview 7案／image-only 8案、abort 6/6、v7 builder 3/3、DB boundary、app typecheck及isolated build均PASS。原筆數fixture失敗紀錄保留，僅更新測試的current35／historic33或34分支；B24及B35產品policy仍拒絕35。既有B35 program-only的測試仍為LOCAL_TEST／MODELED，不變成正式證據。
- owner LOCAL_CONTRACT receipt：`output/dev-117/s1b/DEV117-S1B-20261010T134811849Z-3003BDC5/owner-report.json`；本輪紀錄回填只改文件，不改其不可變收據。build證明artifact=true／primary=true／cleanup=true；該worktree沒有primary SQLite（database-absent），不是對正式資料庫的內容驗證。沿用的Next依賴有Edge Runtime warning，build exit0；沒有改依賴或忽略error。
- 獨立gpt-6-luna xhigh唯讀來源review：RD單項新增、八角色／原31項完全不变、edit/submit與approval HTTP403零副作用及保留撤銷檢查，未发现權限slice明確功能缺陷。review未執行測試或Production，與Root的RD驗證分開。

所有PG cluster及port（最終54726）已停止/釋放，task temp已清除；隔離build自有runtime temp已移除，Root在交付前移除本輪dependency junction並讀回自有程序退出，不動其他人的runtime。Primary DB未作seed/cleanup。

已提交來源的真實 Git archive source-proof補驗152/152 PASS；受影響 TypeScript ESLint PASS。新RD policy regression已接入既有Production Slice QC，官方CI結果仍待讀回，不能以本地PASS代替。

## 官方CI補修（沿用有效建置證據）

[CI38057541266](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/38057541266)／HEAD13aa7a0b：Isolated PostgreSQL Cutover SUCCESS，Production Slice QC FAILURE（212/213；worker artifact test module top-level失敗）。第一失敗是歷史B35 test從Git HEAD取得current35 profile後呼叫closed34政策，`PROGRAM_ONLY_BASELINE_INVALID:profile`；先前precommit本機測試的Git HEAD仍34，漏了此execution binding。原FAIL log保存於私有output，沒有重送相同source。

修正只改fixture：依獨立Luna只讀review縮小scope，普通worker/build測試保留genuine current35 appProfile，只有B35段使用獨立b35AppProfile34；genuine current35拒絕另測；B35 modeled34 appProfile、archive與callback bytes一致，歷史RELEASED33 hash保持3faf…，真Git PAX與raw SQL/worker blobs沿用。整個historical graph仍MODELED／LOCAL_TEST，不宣稱整份current35 production archive或provider PASS。新單檔29/29、continuous241/241、owner280/280 PASS；補修過程中的缺少已收尾依賴、fixture序列化與archive版本衝突本機FAIL保留。產品guard、SQL、catalog、依賴及應用build inputs未再改，沿用既有app typecheck／isolated build，不重复無變動的應用建置。官方新來源CI待讀回。

## 正式與剩餘阻擋

本次v7 migration、Production部署與切流：NOT_RUN。兩fixture本次v7圖號／edit／submit／approval-negative驗證：NOT_RUN；先前使用者回報login/reload/logout只屬HUMAN_REPORTED結果，不能證明本次能力。本人驗證：UNVERIFIED。

OrgMaster現行精確只接受v5/v6；需先取得該repo相容reader+artifact+必要test及own protected release明確授權，才能safe發布v7。一般prepare缺少已證的085 maintenance fence acquisition/readiness證據；runner會在SQL前fail closed，不能paid build後才靠失敗發現缺receipt。先完成此prebuild readiness及compatibility，依既有完整維護窗口流程發布，不使用closed B35 program-only path、不帶single cleanup operationRef，也不手改正式DB。085為additive forward publication，不能down migration或路由不相容v6 binary作回復。


## 2026-10-11 maintenance source 續接（本地證據）

整合official main c690d30的DEV-122 provider recovery修正，P08 historical fixture維持獨立closed34 alias；初次46案42 PASS／4 FAIL因fixture引用current35，定向修正後P08 4/4 PASS，產品B3534/effective33與35拒絕保持。

新增最小own維護fence producer：clean protected source／same-source Ready recovery、create-only獨占submission、fresh-etag scaling-only mutation、真實active timeout＋30秒monotonic drain及既有consumer guard；未知POST/PATCH只读回、不重送，drift不自動恢復。Recovery保留實際服務timeout並在paid build前封存submission，未知Build提交不重複。沒有Production fence、build、migration或service mutation。

- 聚焦原28/28 PASS；最後exclusive unknown-readback分類補修新增兩種conflict案例後29/29 PASS（fence17＋recovery12，零skip）。並行claim失敗時PATCH／SQL writer皆0。
- 分類補修前continuous283/283及aggregate owner regression PASS；v7 generator、abort6、DB boundary22、app typecheck與isolated build全部PASS，artifact／primary database-absent invariant／cleanup=true。原immutable LOCAL_CONTRACT receipt：`output/dev-117/s1b/DEV117-S1B-20261011T071104870Z-E0F91191/owner-report.json`，不回填為新source證據。
- 最後分類補修只影響operator錯誤路徑；app typecheck／build inputs未再改，沿用有效證據，最新source仍須required CI。獨立Luna review及最後測試分開記錄，不宣稱Production。

OrgMaster v7 PR #128已合併，但own候選驗證在憑證v9的Platform session exchange 401／auth_token_invalid中止；正式舊版100%維持。原因更細分尚未證實。AI-PDM085 NOT_APPLIED，RD v7 NOT_DEPLOYED；新兩帳號RD驗收與Google延遲正式情境未取得證據，Dani本人DEFERRED_UNVERIFIED，歷史清理FK阻擋且引用刪除不在授權中。


## 2026-10-11 reauth 與 latest main 續接

OrgMaster own 原生重新驗證已完成相鄰 v9→v10、既有 GitHub credential 同步、正常 Platform session／兩次 me／局部 logout 後 401；不重設密碼或新建身分。Temporary runtime process／port 已確認關閉。這只證明發布憑證續接，不是 OrgMaster v7 部署或兩個 RD fixture 驗收。

Numeric-only rotation native gate 在 apply 前因既有事故訂閱缺失、計畫要求 create 而拒絕。另一份 readonly APP_INFRA_B diagnostic saved plan 經原生 gate PASS：完整75地址，僅既有訂閱 create，其他 read/no-op；NOT_APPLIED，等待明確資源範圍確認。原始失敗／計畫與 Production readback 留在未提交的私下本機 output，未改寫 sealed receipts；候選仍 pin v9、正式舊版未切流。

PR #261 已無衝突整合 official main 0d0235d 的 preview polling 修正。既有 b0fb092 required CI38120970158 兩項 SUCCESS 保留其原來源範圍；本次整合後 source 另執行 focused regression 與 app typecheck，新 exact head required CI 必須讀回。AI-PDM 085、RD v7部署與本次fixture正常 UI驗收仍 NOT_RUN。

整合後本機驗證：fence17＋recovery library4＋recovery CLI8合計29/29，零skip；merged preview兩檔25/25，零skip；app typecheck PASS。補驗CLI第一次在dependency junction已收尾後啟動，因pg套件無法解析而module-load FAIL；原始log保留，恢復task-owned junction後8/8 PASS，沒有放寬產品guard。測試只用task-owned隔離路徑，dependency junction已移除且canonical依賴保留。這些是本機source回歸，不能替代正式瀏覽器／migration／traffic結果。
