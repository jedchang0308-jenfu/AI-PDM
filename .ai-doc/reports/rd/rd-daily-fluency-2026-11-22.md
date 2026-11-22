# AI-PDM 日常清單返回與文字復原

日期：2026-11-22。範圍：本機 source、必要測試與文件；未部署、未修改正式資料或雲端資源。

## 實際變更

沿用 shell 所有的清單／權限／圖片快取。清單仍在 30 秒內重用，30 秒至 5 分鐘改為先顯示 display-only snapshot 再更新；503／斷線保留未逾期資料並提示，401／403／身分失效仍清除。讀取及失敗不續期，快取不保留 commands 的 actions／token。

文字復原涵蓋建立編號、料號矩陣六個可編輯文字欄位及圖號判定備註。草稿按已驗帳號／公司／profile、record 與版本隔離；明確復原，版本不同僅供比對。料號復原沿用 800 ms autosave，其他入口沿原儲存／提交；所有正式異動仍由伺服器確認。容量／期限與使用契約見 [DEV-126 增量](../../specs/DEV-126-app-scoped-frontend-permission-projection.md#daily-fluency-text-recovery)。

## 量測與限制

基線為本任務開始時 `6e775034cb0b803222905b6028aa469651b43e8f` 的獨立 source copy。改善版本為同一工作樹的收斂 app source；八個受影響 app inputs 的 SHA-256 保留在 `output/playwright/daily-fluency/source-inputs.json`。

使用無視窗 Edge、1440×1000、隔離 Next dev、全 API 合成 fixture，主要讀取及儲存回覆加 650 ms 延遲；先暖好 route compilation，再量使用者導覽至內容可見。不是正式環境或真實 Principal 授權驗收，也不是統計上的長期效能基準。

| 行為 | 基線 | 改善後 |
|---|---:|---:|
| 首次工作台 | 2236 ms | 2413 ms |
| 首次圖號清單 | 1418 ms | 1393 ms |
| 30 秒內返回 | 343 ms／0 次 GET | 223 ms／0 次 GET |
| 超過 30 秒返回 | 948 ms | 314 ms |
| 503 後保留有效清單 | 否 | 是 |
| 建立表單可操作 | 1290 ms | 1170 ms |
| 圖號常用表單可操作 | 2722 ms | 2073 ms |
| 料號矩陣可操作 | 2898 ms | 2055 ms |
| 建立／圖號／料號文字重開復原 | 均未復原 | 均通過 |

返回過期清單的主要改善是免等讀取即可顯示舊內容（約減少 67%）。首次頁面並未改造為離線讀取；小幅首次載入差異不歸因於此切片。30 秒內免 GET 是原有機制，保留而非重建。Next dev 過期返回仍觀察到 2 次開始的 GET（含 dev effect 重播／取消），此處不宣稱 production 去重改善；總清單請求兩版本皆 6 次。改善版多一次合成 PATCH，為明確恢復料號後走既有 autosave，沒有發布、送審或正式配置命令。

## 驗證結果

- 聚焦 Vitest：11 檔 101 案通過；涵蓋快取期限／scope／撤權晚到回覆、storage/quota、重開與捨棄、不同帳號／紀錄、伺服器版本變化、另一分頁修訂、圖號儲存與送審、矩陣 800 ms autosave／If-Match 與斷線。最後跨紀錄保護修改後，受影響 3 檔 45 案再通過。
- 權限 provider／consumer 與草稿 hook 追加回歸：3 檔 35 案通過（其中 hook 11 案與前述重疊，不能直接相加）。
- 瀏覽器：建立文字重開、帳號切換隔離、捨棄、圖號重開、較新伺服器版本禁止套用、料號 PATCH 503 後重開復原及成功 autosave／重載讀回通過，page error 為 0。完整資料在 `output/playwright/daily-fluency/{baseline,improved}.json`，含實際入口等待；已視覺檢查復原與版本衝突畫面。
- app 型別檢查通過；本次 source／新增測試 lint 通過。既有 workbench `window.location.assign` warning 保留，未以此增量重做導航。
- 分類器 26 案通過：新 UI runner 明確歸 application，未知腳本仍為 FULL；未新增業務關卡或跳過 required CI。

首個有效失敗保留：本機原本缺 `fflate`，型別／圖號回歸在 import 前失敗；依既有 lock 補齊後通過。依賴補齊時禁止 install scripts，導致 SQLite native binding 未產出，第一輪隔離 build 在主資料唯讀 snapshot 前失敗；重建原套件後，隔離 build 已通過並證明 primary invariant、artifact、cleanup。第一輪來源 lint 的 ref-during-render 已改為 layout effect，測試捕捉值也移到 effect；並非忽略 lint。UI harness 的 browser sandbox、計時安裝時點、查重 POST 分類與 textarea implicit label 定位失敗屬前提／fixture修正，沒有當作產品 PASS。

最終 app build 與 affected-slice runner 的結果收斂於交付提交後的本機工具紀錄；未執行 GitHub required CI 或正式發布。
