# QC-DEV-086：雙 lane rendered browser completion receipt

狀態：`PASS / Local Only / Production Release Gated`  
日期：2026-08-21  
Evidence class：`local-rendered-browser-qc`  
Manifest：`output/qa/dev-086/dev-086-2026-08-21T00-59-40-660Z/manifest.json`

## Scope

- Isolated disposable SQLite/repository copy；不連接、不寫入正式資料。
- On-path flags：`PDM_WORKBENCH_PRODUCTION_RD_LANES_V1=true`，並確認 Drawing／Part-Relation／Lifecycle dependencies `requested=true / enabled=true`。
- Route：圖號 `/numbering/drawings?query=A0002-M01&view=all`、料號 `/parts?query=A0002&view=all`、圖料根號 `/numbering/search?query=A0002&view=all`。
- Viewport：1440×900、1024×768、390×844；每一 route 保存 screenshot、accessibility snapshot、network ledger。

## Result

`npm.cmd run qc:dev-086` aggregate PASS：contract 5/5、repository 4/4、api 4/4、query-budget 6/6、transition 3/3、classifier 2/2、rendered browser 76/76。

A0002-M01 圖號 rendered rowgroup：

1. `量產最新版` — `版次 1`，狀態投影為量產版可使用。
2. `研發最新版` — `版次 1.1`，狀態依 active R&D revision 顯示，不會覆蓋量產列。

A0002 料號與圖料根號均各自回傳同群組兩列，且 desktop 版別篩選可寫入 `lane=production`、只顯示量產列，再清除篩選恢復兩列。三 route 無 visible alert、水平 overflow、console error、page error 或 HTTP failure。

## Cleanup

Runner `finally` 已關閉瀏覽器、停止 task-owned isolated Next runtime、恢復環境變數並移除 disposable fixture root；production/staging deploy、merge、PR、release 未執行。
