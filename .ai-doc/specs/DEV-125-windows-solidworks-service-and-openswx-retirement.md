# DEV-125：Windows SolidWorks 解析服務與 OpenSWX 退役

狀態：`PLANNED / RD Contract Ready / IMPLEMENTATION_NOT_STARTED`。本文件是 DEV-122／124 移交後唯一後續開發入口。

決策來源：2026-10-27 使用者確認直接提供電腦清單，要求系統精簡、OpenSWX 不用就拆除、不雙系統並行，舊任務盡量結案、新架構集中新任務。來源基準：`583425d948a9381305ffa4747c30ecb6c2469fd5`。本次交付是任務與契約整理；程式、安裝包及正式資源尚未變更。

## 1. 要交付的結果

AI-PDM 網頁與資料管理維持雲端；指定公司 Windows 電腦安裝同一套「AI-PDM Windows 解析服務」，向 AI-PDM 領取工作，使用官方 SolidWorks Document Manager 讀取原生屬性及可取得的已儲存預覽，再回傳與原檔版本綁定的結果。一般使用者直接在網頁查看結果。

產品只維持這一條原生 CAD 解析路徑。OpenSWX 輔助屬性功能、worker、派送及日常發布依賴全部退役；不保留 provider 選單、雙讀比對或自動回退至 OpenSWX。Windows 尚未上線時顯示等待／未設定，不用 OpenSWX 暫代成功。

## 2. 舊任務如何結束

| 任務 | 任務處置 | 保留的事實與責任 |
|---|---|---|
| DEV-122 | `CLOSED_PARTIAL_HANDOFF`：舊缺陷整治階段結案 | 01～04、06 的既有本機成果封存；正式整組未驗不改為 PASS。05 及管理員辨識、完整原生 CAD 的剩餘結果移至本任務。原七個 issue 與 29 診斷 ID 保留對照。 |
| DEV-124 | `CLOSED_CANCELLED_REPLACED`：取消 OpenSWX 修復 | 不再排修復、重建或恢復 Scheduler。其 readback 失敗／active row UNKNOWN 原樣保留；必要退出盤點與拆除移至本任務，取消修復不表示資源已拆。 |
| DEV-125 | 唯一後續開發任務 | 交付 Windows 安裝及電腦清單、原生解析、舊缺口整合驗收與 OpenSWX 完整退出。 |

任務關閉是工作歸屬的處置，不增加功能 PASS 數。DEV-122 原始七個結果的完整驗收仍為 `NOT_ACCEPTED`；本任務逐項補證或保留未驗，不能用新編號洗掉原失敗。供應商 D122-07 維持 `DISABLED_DEFERRED`，不恢復也不算通過。

<a id="legacy-outcome-handoff"></a>

| 原責任／證據 | DEV-125 承接方式 | 完成所需結果 |
|---|---|---|
| D122-01～04、06 | 保留本機成果；相容驗收列，無新缺陷不重做產品實作 | 重用有效證據，只刷新受影響行為；尚未做的正式整組結果繼續明列未驗，不計正式 PASS。若要宣稱原七項整體通過，仍須補足其適用層級。 |
| D122-05／F-01A 附件 | 整合驗收 | 正常上傳、重載、受保護下載、原始 bytes／hash 與拒絕零副作用。 |
| D122-05／F-01B～E 原生預覽 | Windows 服務整合及來源安全 | A0001-M01 等受控來源經正常 claim／heartbeat／complete 產生 current-hash 真實 PNG，桌面可見；取消、失聯重領、舊租約提交及 parent-lock 拒絕正確。 |
| D122-05 PDF | 獨立於 Windows 安裝的相容修復 | 查明 `unsupported_preview_source` 的 metadata／binding／derivative 原因；現有 PDF 直接顯示正確版本與完整圖框尺寸，不要求先完成原生 CAD 轉 PDF。 |
| 管理員辨識／F-01F | 同一套 Windows 安裝中的原生屬性處理能力 | 正常 actor allow／deny、原生 reader、document／configuration scopes、來源 hash 與辨識結果可互相對應。既有單樣本 native reader PASS 僅重用在其實測範圍。 |
| DEV-124 OpenSWX | 退出工作 | 無產品入口、無 active caller、無排程或執行資源、無現行發布必需依賴；歷史內容可查而不能再執行。 |

D122-05A／05B 原 ID 僅作來源引用，後續診斷、修復與驗收都在 DEV-125 更新；不再維護第二份 active 排程。DEV-123 與 OrgMaster 的人員角色責任不在本任務。

## 3. 第一版產品與技術邊界

- 網頁入口：系統設定 → Windows 解析服務；沿用既有 PDM 管理員授權。頁面提供下載安裝程式、註冊電腦、電腦清單與停用／重新綁定。
- 清單只顯示電腦名稱、服務版本、連線／可處理狀態、最後連線及操作。連線與可解析分開判定，避免只有 heartbeat 就顯示可用；不蒐集員工活動或遠端桌面資料。
- 安裝：Windows x64 安裝包，處理必要元件、服務啟停與解除安裝；管理員從已登入頁面完成一次性裝置綁定。下載安裝檔本身不取得圖檔存取權，也不在安裝包內附帶公司 license key、服務 token 或 Google 憑證。
- 裝置：每台有獨立可撤銷的身分與版本；只主動向 AI-PDM 發出 HTTPS 請求，不要求開放公司電腦 inbound port。服務權限限定領取合法工作、讀取該工作來源及提交衍生結果，不取得人員管理或業務核准權限。
- 佇列：重用既有 preview／recognition owner，保留用途隔離；同一套安裝可包含不同處理能力，不新增 OpenSWX 佇列的替代副本。每台第一版限制同時處理一件重型 CAD 工作；工作由伺服器原子領取，重複完成不得重複寫入。
- 中斷：關機／斷線後租約到期可由另一台領取；舊實例的結果不可覆蓋新租約或新版來源。停用裝置後禁止新 claim、來源下載、金鑰取得及有效提交；已下載的暫存無法遠端保證抹除，服務恢復時清理自有暫存。
- 原檔：受控暫存只供本次工作，以唯讀方式解析；完成或失敗後清理自有副本，不回寫使用者 CAD 檔、不更動正式圖料。雲端結果綁定 source hash／版本及處理能力，不能把舊預覽當新版。
- 金鑰：沿用既有 settings／broker 的 exact active version 與去敏機制；Document Manager key 不進網頁、MSI 或明文設定。裝置 credential 與 CAD license 分開；沿用 broker 的有界記憶體取得，不因安裝方便另建永久 key 副本。
- 撤退／故障：Windows 不可用時保留原檔下載及明確等待／錯誤；已有效產生的預覽仍可讀，不重新啟用 OpenSWX。

原生能力必須分清：Document Manager 屬性讀取及檔內已有 PNG 預覽可重用；它不等於完整 SolidWorks 重建、任意高解析出圖或 `.SLDDRW → PDF` 轉檔器。互動式 3D、完整 CAD 轉 PDF、自動更新、遠端控制與付費簽章採購不列第一版。若要用既有 Shell handler 補足原生縮圖，先驗證執行帳號／桌面 session 相容性，仍包在同一 Windows 解析產品內；不能宣稱所有 COM／Shell 能力都能在 Windows Service 的非互動 session 執行。

## 4. OpenSWX 拆除契約

取消修復立即作為任務決策；實體拆除是本任務交付內容，必須有讀回證據，不能僅以 Scheduler 暫停宣稱完成。

1. 盤點產品 caller、當前 queue／active／unknown 工作與 provider execution；先停新入口及派送。保留原 124-A 的失敗，不以 UNKNOWN 當零工作。該盤點只為安全退出，不再啟動 OpenSWX 修復支線。
2. 對已存在工作使用正常取消／終止契約，unknown provider 寫入先讀回；保存原輸出及終態，不手改成功、不無條件刪資料。
3. 移除 OpenSWX UI 操作、API writer、consumer、reader/build dependency、dispatch/recovery、profile 與專用測試。共用 worker 授權、preview／recognition、安全儲存及發布控制按仍有的用途保留；不得因名稱有 dev122 或 worker 就整批刪除。
4. 退出專用 Cloud Run Job `ai-pdm-prod-openswx-metadata`、Scheduler `aipdm-prod-openswx-dispatch` 與其專用部署設定；核實專用身分／binding／token 後列精確撤銷範圍。共享 `aipdm-prod-workload-auth-credentials`、發布儲存桶及其他服務不可整體刪除。
5. 移除新版本建置、日常發布、recovery 對 OpenSWX descriptor／profile／receipt 的執行依賴。仍被既定 recovery 引用的最小歷史 reader，須在 replacement recovery 可用後一起移除；不能留下永久雙路徑。
6. 已套用 migration、CAD 原檔、業務結果、稽核及不可變發布收據保留；OpenSWX 歷史資料可唯讀封存，這不構成第二套執行系統。不為退出直接 DROP 舊表或清掉歷史 bucket。安全退出後要求 active source 無 OpenSWX caller；Git 歷史／歷史證據中的字樣不需刪光。

正式資源刪除與 IAM／Secret 撤銷須在執行前列出查證後的精確專用目標與共享依賴，依既有正式操作邊界交付。本次 PM 文件整理不執行這些操作。

## 5. 開發順序與重用

同一任務依序交付三個切片，每個可獨立發布切片維持一個 active PR：

1. **125-A 安裝與電腦清單**：裝置綁定／撤銷、狀態與安裝卸載；同時把 OpenSWX 退出盤點收斂為精確可執行清單，停止新增雙軌設計。
2. **125-B 單一路徑解析與整合**：重用 Document Manager reader、preview worker、settings／broker，接入既有佇列；補上表的 CAD／PDF／附件與辨識缺口。PDF metadata 修復可先完成，不等待原生 renderer。
3. **125-C 拆除與結案**：依 §4 移除 OpenSWX 程式、日常發布依賴及專用部署資源，以 Windows 結果驗收並讀回無第二套執行路徑。A／B 不得開啟 OpenSWX 作備援，尚未完成 C 不能宣告本任務完成。

重用入口：DEV-035 metadata reader、DEV-056 preview worker、DEV-058 broker 及 [既有 Windows 預覽 SPEC](SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md)／[ADR](../decisions/ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-worker-derivative-boundary.md)。不重新實作一套通用佇列或金鑰系統。

進入實作時只補目前切片需要的裝置 schema／API、憑證生命週期、MSI 工具與來源、版本相容、worker fence 及測試。命名與程式細節由 RD 決定；第一版不預建完整未來 fleet 平台。安裝包可免費製作，公開可信簽章不預設採購；Document Manager 公司內多裝置的 key 使用條件須依合法持有的授權確認，不能把可重散布 DLL 當無限制 key 授權。

## 6. 最低充分驗收與發布影響

- 新 Windows 電腦從網頁下載、安裝及綁定後出現在清單；正常開機啟動、版本／狀態可辨識，解除安裝清除自有服務與暫存。
- 兩台受控電腦不重複完成同一工作；其中一台離線／停用後的領取、來源讀取、舊提交與另一台接手有正反證據。沒有電腦可處理時 UI 有可理解狀態。
- 真實 `.SLDPRT`／`.SLDASM`／`.SLDDRW` 分別記錄支援能力及實測結果；缺內嵌預覽或缺相依元件時明確失敗，不以假圖／檔名辨識充當成功。屬性與預覽各自驗證，不互相代替。
- 承接表的 PDF／附件／管理員辨識與原七項結果在其實際層級記錄；原始 FAIL／UNKNOWN／NOT_RUN 可追溯，必要未驗項仍未通過。
- OpenSWX 拆除有 source dependency／provider resource／active work 讀回；新版本建置發布及既定 recovery 不再需其 worker。只暫停排程不算拆除完成。
- 沿用 affected-slice planner、required CI 及發布流程；裝置資料若需新增 SQL，採 `ai_pdm_core`／`ai_pdm_contract` forward-only migration，執行 DB boundary 檢查。新安裝產物、裝置 credential、app API 與雲端退出各自核實相容性。

完成定義：Windows 正常安裝與解析、電腦清單可管理、承接的必要結果通過、OpenSWX 退出完成。文件建好、安裝包能啟動或舊任務關閉均不等於 DEV-125 完成。
