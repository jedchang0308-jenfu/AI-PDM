# QA Validation Plan: DEV-CAD-001 Local Adapter Contract

Date: 2026-06-02
Scope: local native CAD extractor adapter contract, probe tooling, redaction, and upload fallback behavior.

## 驗證範圍

- 驗證 Web metadata detect API 可透過外部 extractor command 取得 native metadata 與 CAD references。
- 驗證 extractor probe 可產生機器可讀 `probe.json`，並覆蓋 `.sldprt`、`.sldasm`、`.slddrw`。
- 驗證 probe output 會遮蔽 license / token / password / secret 類參數。
- 驗證 native extractor 未配置時，upload metadata detect API 不崩潰，並回傳可操作 warning。

## 不在本輪範圍

- 不驗證正式 SolidWorks Document Manager 授權。
- 不驗證真實公司 CAD 檔案。
- 不將 `DEV-CAD-001` 整體狀態改為完成；正式完成仍需 `qc:document-manager-report:report` ready。

## FMEA 風險表

| 失效模式 | 可能原因 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|---|
| QC fixture 覆寫失敗 | `data/qc-fixtures` 內既有檔案被 Windows / sync client 鎖定 | 本機 QC 無法重跑 | probe QC 回 EPERM | 將 contract fixture 改到 `.tmp/` |
| 外部 extractor contract 漏接 metadata | env command / args contract 錯誤 | native metadata 無法帶入表單 | `qc:native-cad-extractor-contract` | 驗證 detect route 200、metadata source recorded |
| CAD references 未進 API | reference extractor contract 錯誤 | BOM 工作台 CAD Draft 缺資料 | `qc:native-cad-extractor-contract` | 驗證 reference count 與 quantity |
| probe 洩漏密鑰 | log 未遮蔽敏感參數 | license / token 外洩 | `qc:document-manager-probe-redaction` | 驗證 secret 值不存在且 `<redacted>` 存在 |
| extractor 缺失導致上傳偵測崩潰 | route 未處理未配置或失敗 | RD 無法先上傳 / 送審 | fallback detect test | 未配置時仍 200 並顯示 warning |

## 測試案例

| ID | 指令 | 預期 |
|---|---|---|
| QA-CAD-CONTRACT-001 | `npm.cmd run qc:native-cad-extractor-contract` | 14/14 pass，含 external extractor 與 fallback |
| QA-CAD-CONTRACT-002 | `npm.cmd run qc:document-manager-extractor-probe` | 6/6 pass，產生 `.tmp/document-manager-probes/qc-contract/probe.json` |
| QA-CAD-CONTRACT-003 | `npm.cmd run qc:document-manager-probe-redaction` | 9/9 pass，probe output 不含 secret |
| QA-CAD-CONTRACT-004 | `npm.cmd run qc:document-manager-probe-path-gate` | 4/4 pass，missing / not-ready probe 會被阻擋 |
| QA-CAD-CONTRACT-005 | `npm.cmd run qa:dev-task:sync` | 不因 local mock contract 誤關閉正式 Document Manager blocker |

## 通過標準

- 以上 QC 指令全數通過。
- `.ai-doc/dev_task.md` 僅勾選 local adapter contract / probe tooling / fallback 行為。
- `DEV-CAD-001` P0 總列仍維持 `[!]`，直到正式 Document Manager 或等效讀取器 evidence report ready。

## 證據收集方式

- 保存命令輸出摘要於 QC report。
- 以 `.ai-doc/dev_task.md` Update Log 記錄本輪局部完成項目。
