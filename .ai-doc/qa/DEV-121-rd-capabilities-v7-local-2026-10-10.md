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
- `test:dev-117:continuous`：240/240 PASS；source-proof 定向回歸152/152 PASS（與continuous分母部分重疊，不相加）。最初source-proof正向fixture錯把raw SHA當applied SHA，修正成實際owner compiler的80e…後PASS；拒絕guard未放寬。
- `qc:dev-117:continuous`：279/279 PASS；Sharp canonical preview 7案／image-only 8案、abort 6/6、v7 builder 3/3、DB boundary、app typecheck及isolated build均PASS。原筆數fixture失敗紀錄保留，僅更新測試的current35／historic33或34分支；B24及B35產品policy仍拒絕35。既有B35 program-only的測試仍為LOCAL_TEST／MODELED，不變成正式證據。
- owner LOCAL_CONTRACT receipt：`output/dev-117/s1b/DEV117-S1B-20261010T134811849Z-3003BDC5/owner-report.json`；本輪紀錄回填只改文件，不改其不可變收據。build證明artifact=true／primary=true／cleanup=true；該worktree沒有primary SQLite（database-absent），不是對正式資料庫的內容驗證。沿用的Next依賴有Edge Runtime warning，build exit0；沒有改依賴或忽略error。
- 獨立gpt-6-luna xhigh唯讀來源review：RD單項新增、八角色／原31項完全不变、edit/submit與approval HTTP403零副作用及保留撤銷檢查，未发现權限slice明確功能缺陷。review未執行測試或Production，與Root的RD驗證分開。

所有PG cluster及port（最終54726）已停止/釋放，task temp已清除；隔離build自有runtime temp已移除，Root在交付前移除本輪dependency junction並讀回自有程序退出，不動其他人的runtime。Primary DB未作seed/cleanup。

## 正式與剩餘阻擋

本次v7 migration、Production部署與切流：NOT_RUN。兩fixture本次v7圖號／edit／submit／approval-negative驗證：NOT_RUN；先前使用者回報login/reload/logout只屬HUMAN_REPORTED結果，不能證明本次能力。本人驗證：UNVERIFIED。

OrgMaster現行精確只接受v5/v6；需先取得該repo相容reader+artifact+必要test及own protected release明確授權，才能safe發布v7。一般prepare缺少已證的085 maintenance fence acquisition/readiness證據；runner會在SQL前fail closed，不能paid build後才靠失敗發現缺receipt。先完成此prebuild readiness及compatibility，依既有完整維護窗口流程發布，不使用closed B35 program-only path、不帶single cleanup operationRef，也不手改正式DB。085為additive forward publication，不能down migration或路由不相容v6 binary作回復。
