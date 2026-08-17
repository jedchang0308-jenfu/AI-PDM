# QC-DEV-074：料號／圖號全生命週期 UI 真實操作驗證報告

日期：2026-08-15  
角色：AI-QC  
對應計畫：`.ai-doc/qa/qa-dev-074-pdm-complete-lifecycle-ui-real-operation-validation-plan-2026-08-15.md`  
環境：本機隔離測試環境 `http://localhost:3000`  
最終判定：`PASS`

## 1. 放行結論

DEV-074 本輪 58 條 in-scope UI journey 已全部完成修復後重驗。

| 指標 | 結果 |
|---|---:|
| Pass | **58** |
| Fail | **0** |
| Blocked | **0** |
| Not Run | **0** |
| Open P0 / P1 | **0 / 0** |
| Business mutation 來源 | **Rendered UI only** |
| 直接 API / DB mutation | **0** |

本輪執行期間發現的產品缺陷均先退回 RD 修復，再由 QC 從真實 UI 重驗。最終沒有以程式測試、API、DB 改值或狀態修補取代 UI journey。

## 2. 58 條路徑結果

| 路徑家族 | 本輪 ID | 結果 |
|---|---|---:|
| 建號／新增範圍 | `A01-A04` | 4/4 Pass |
| 首版圖面與整包審核 | `B01-B08` | 8/8 Pass |
| 圖面／CAD 辨識與人工確認 | `C01-C08` | 8/8 Pass |
| 正式圖面進版、FFF、送審與發行 | `D01-D14` | 14/14 Pass |
| BOM 建立、編輯、審核、發行與作廢 | `E01、E03-E11` | 10/10 Pass |
| 技轉包與正式交接 | `F01-F07、F09` | 8/8 Pass |
| 正式物件終止與歷史治理 | `G01-G06` | 6/6 Pass |
| **合計** |  | **58/58 Pass** |

各 case 的最終穩定狀態均由 reload、返回清單、歷史／審核畫面或下載入口回讀；必要時再用唯讀資料查詢佐證。測試資料未以 DB 清除，正式／歷史資料依設計保留。

## 3. UI-only 執行與主要事實

- SW／CAD 檔案均透過畫面上的 file input 上傳。
- 建號、送審、撤回、補件、退回、核准、正式化、進版、BOM、技轉、作廢、分支與合併均由可見 UI 操作觸發。
- 未直接呼叫 mutation API、未直接寫 DB、未注入 JavaScript 觸發 business action、未以 fixture／repair script 改狀態。
- DB、hash、network、console 與程式檢查只作 read-only 第二層佐證，不取代 UI 結果。
- 送審者、審核者與管理者角色依流程切換；沒有用單一角色冒充所有權限案例。

最終 G06 回查：

- A0011 以 `/numbering/search?query=A0011&history=include&view=all` 進入；「包含歷史」為勾選狀態。
- A0011 root、drawing 與 part 在 UI 投影為「歷史／已作廢」。
- 「新增圖號」與「申請圖料根號作廢」均不可操作，且沒有復活、核准、發布、checkout 或建立分支入口。
- cancelled／obsolete／merged 記錄仍可開啟、查看檔案與追溯資料。
- `QC074-G06-合併歷史` 分支 `44aa7bdb-5aef-4d1f-b176-78a994d1f80d` 已由 UI 合併，畫面只保留「已合併」與追溯入口。

## 4. 同檔案重複上傳與唯一真相來源

系統不得以檔名判斷兩次上傳是否為同一檔案。本輪採用的同一性條件為：

`同 company / owner root + file role + SHA-256 + byte size`

檔名僅供 UI 顯示與 2D／3D 類型分類，不參與內容相同性結論。因此：

- 改名但 bytes 相同：判定為同一內容真相。
- 檔名相同但 bytes 不同：判定為不同內容，不得沿用舊資產。
- 相同內容跨版次重複上傳：重用同一 physical/canonical storage key；每個版次仍建立自己的 logical attachment reference，讓 UI 各版次都看得到附件。
- 本輪同 hash 重跑只證明流程與去重行為可用，`content_changed=false`；不宣稱幾何、尺寸、公差或工程內容真的有變。

唯讀 hash / storage 佐證：

| Role | SHA-256 | Bytes | Logical submission rows | Distinct storage key |
|---|---|---:|---:|---:|
| 3D | `695ecccd9f4a6425faef1196b319579a8a5011de26d655baa0509a4f61bfc3e2` | 193,353 | 14 | 1 |
| 2D | `4e39ce88825ae14948353b79455daa2bc35c8b97f1c5706810f1ad926c301d09` | 145,826 | 15 | 1 |

Physical storage key：

- 3D：`candidate-revisions/company-jenfu/NCR-f2f07240-6348-4ba8-abc6-e401d6ebde30/NCRF-74cbde38-2001-4242-a6ef-bdfc94c14da0-D-0007-MA1.SLDPRT`
- 2D：`candidate-revisions/company-jenfu/NCR-f2f07240-6348-4ba8-abc6-e401d6ebde30/NCRF-e68e7cd0-e920-4b23-96ab-80091df3c88e-D-0007-MA1.SLDDRW`

以上結果符合「一份實體內容真相、多個版次邏輯可見紀錄」的要求，並非把所有版次壓成同一筆 UI 紀錄。

## 5. QC 發現、RD 修復與重驗

| 缺陷 | 等級 | 修復後重驗結果 |
|---|---:|---|
| 技轉包核准後來源變更未完整納入 snapshot hash，可能讓 F07 stale 判斷漏失 | P0 | drawing、part 與 master 內容納入 snapshot；來源改變會阻擋發布，重建快照並重送後才可繼續，Pass |
| 正式物件的生命週期動作在明細抽屜缺少一致入口 | P1 | 圖料、圖號、料號明細共用正式生命週期操作區；適用動作可達、終止狀態禁用，Pass |
| 已作廢 master 之舊 Pending submission 仍可能出現核准／發布／checkout／sandbox 入口 | P0 | UI 投影為唯讀受控歷史；approval、release、checkout、sandbox 與 merge 後端亦先檢查 master actionability，Pass |
| 「返回圖料歷史」使用錯誤 query key，返回後未勾包含歷史 | P1 | 改為 `history=include`；返回後 A0011 歷史資料可見，Pass |

終止狀態防護採雙層設計：UI 不呈現不適用 mutation，server 仍以 root、drawing 與 scoped part 的 `Obsolete / Merged` 狀態阻擋舊頁面、雙分頁或 stale client 嘗試。

## 6. 代表性資料回讀

- A0007 root、part、drawing 維持 `Released`。
- A0011 root、P01/P02/P03/P05、M01/M02 為 `Obsolete`。
- `SUB-20260815-111B8605` 為 `Obsolete`；`SUB-20260815-B87C4211` 為 `Cancelled`。
- A0007 Rev0.6 的 submission `SUB-20260705-F8220713` 在 G05 駁回後維持 `Released`。
- A0011 舊 minor submission 即使 raw status 仍為 Pending／ReviewApproved，也因正式 master 已終止而只可追溯，不能再被核准、發布、checkout 或建立 sandbox。

## 7. Viewport、錯誤與技術回歸

實際 browser 重驗尺寸：

| Viewport | 證據 | 結果 |
|---|---|---|
| 1440×900 | `.playwright-cli/page-2026-08-15T08-11-12-167Z.png` | Pass |
| 1024×768 | `.playwright-cli/page-2026-08-15T08-11-34-610Z.png` | Pass |
| 768×1024 | `.playwright-cli/page-2026-08-15T08-11-55-547Z.png` | Pass |
| 390×844 | `.playwright-cli/page-2026-08-15T08-12-15-345Z.png` | Pass |

四種尺寸皆可操作歷史 drawer、返回入口與關閉控制；手機寬度正常換行，未出現核准或建立分支入口。最終頁面 console error 0、warning 0；本次流程的相關 network request 均為 200，沒有非預期 4xx/5xx、page error 或 raw API error。

補充回歸：

| 檢查 | 結果 |
|---|---|
| `npm.cmd run typecheck:app` | Pass |
| `npm.cmd run qc:dev-072:contract` | Pass |
| `npm.cmd run qc:pdm-transfer-package-phase3a0` | 18/18 Pass |
| `npm.cmd run qc:pdm-lifecycle-controlled-history` | 63/63 Pass |

程式檢查只作防回歸證據；本報告的 58/58 判定仍以 rendered UI 操作與畫面回讀為主。

## 8. Out of Scope

依使用者確認，下列項目不列入分母，也不判 Fail／Blocked：

- `B09`：`apply_failed / ReleaseFailed`。
- `D15`：正式化失敗重試。
- `E02`：BOM `.xlsx/.xls` 匯入。
- `F08`：整批發布失敗恢復。
- 真正幾何、尺寸、公差、工程屬性差異與 FFF 工程判定正確性。
- 舊保留號與其 legacy lifecycle。

## 9. 最終判定

DEV-074 已達成計畫的本輪放行門檻：`58/58 Pass、Blocked=0、P0/P1 open=0、UI-only business mutation`。本機 QC 驗證結案；未執行 deploy、production release 或正式資料搬移。
