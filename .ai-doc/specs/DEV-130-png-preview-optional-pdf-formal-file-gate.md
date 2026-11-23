# DEV-130：PNG 簡易預覽、選配 PDF 辨識與正式版檔案門檻

Status: `RD Complete / Local Verification Passed / Not Released`
Date: 2026-11-23
Owner: Dev PM
Source ID: `DEV-PDM-PNG-PREVIEW-OPTIONAL-PDF-FORMAL-FILE-GATE-001`
Related DEV: `DEV-061`、`DEV-079`、`DEV-082`、`DEV-125`、`DEV-129`
Related authority:

- [圖面檔案權威](SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md)
- [智慧辨識](SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md)
- [原生預覽衍生檔](SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md)
- [受控版次附件包](SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md)

## 1. 人類定案

1. AI-PDM 不承擔 `.SLDDRW -> PDF` 自動轉換，不建立或維護 PDF renderer、SolidWorks／eDrawings 背景轉檔、轉檔授權、轉檔佇列或相關運算資源。
2. 現有 `.SLDDRW -> PNG` 衍生檔只作「簡易預覽」，用於快速確認檔案與圖面大致內容，不代表完整工程圖、完整 Sheet 或可供正式審圖的解析度。
3. 智慧辨識維持兩類來源：
   - SolidWorks 原生檔：檔名與原生屬性辨識。
   - 使用者已上傳的 PDF：PDF 文字層及必要時的瀏覽器 OCR。
4. 系統不得為了智慧辨識自行產生 PDF；沒有 PDF 時，原生檔辨識完成即為正常終態，不顯示仍在等待 PDF 或等待辨識。
5. 研發版只要求本版 2D 原始檔與 3D 原始檔；PDF、DWG 為選配。
6. 正式版要求本版 2D 原始檔、3D 原始檔、PDF 與 DWG 全部存在。這是最低必要集合，不禁止組立相依檔、中繼檔或其他允許附件。

### 1.1 引導決策紀錄

| 題號 | 決策 | 結果 |
| --- | --- | --- |
| Q1 | 正式版缺少 PDF／DWG 的阻擋時點 | `A`：允許先建立及編輯正式版工作；使用者執行「送出正式版」時，由 server 在同一交易內重驗四類檔案並阻擋缺件。不得提前阻擋工作建立，也不得延後至最終核准／發布。 |
| Q2 | 本版同時有 PNG 與 PDF 時的 2D 預設 | `A`：自動顯示本版 PDF；PNG 只在沒有 PDF 或 PDF 讀取失敗時作簡易降級。降級時仍須顯示簡易預覽訊號及 PDF 狀態，不得把 PNG 呈現成完整圖面。 |
| Q3 | 正式版 `.SLDDRW`／PDF／DWG 主檔名不一致 | `B`：允許送出，但產生非阻擋 warning；送審者在檔案 readiness 區可見，且 warning 隨送審快照保留給審核者。不得靜默忽略，也不增加打斷流程的確認 modal。 |
| Q4 | 同一正式版有多個 PDF 或多個 DWG | `A`：本版最多各一個 current active PDF／DWG；重新上傳同角色檔案時，以既有受控 replacement／tombstone 語意取代舊檔，不新增 primary 選擇。歷史仍可追溯；既有重複 active 資料須先整理成唯一才能送出。 |
| Q5 | PDF 文字／OCR 的啟動時點 | `B`：本版 PDF 上傳成功後，立即在目前瀏覽器自動啟動既有 `browser-pdf-ocr.v1`；不等待使用者開啟智慧辨識分頁，也不新增開始按鈕。關頁中斷時不建立 server background job，下一次進入同一工作區自動重跑尚未 terminal 的 PDF adapter。 |
| Q6 | PDF 辨識未完成／失敗／部分完成是否阻擋正式送出 | `A`：不阻擋。智慧辨識是輔助證據，不是正式版檔案門檻；實際 terminal／pending／partial／failed 狀態及缺漏隨送審 snapshot 保留。PDF 本身仍須通過檔案格式與可讀性檢查，不能把損壞 PDF 誤當合格。 |
| Q7 | 正式版四類必要檔案如何呈現 | `A`：在上傳區及「送出正式版」主要動作附近固定顯示精簡四項狀態；缺件逐項可見，全部齊備後收斂成單行完成訊號。不得另建說明卡，也不得等送出失敗才首次揭露要求。 |
| Q8 | 研發版的選配 PDF／DWG 入口 | `A`：主畫面只突出 2D／3D 必要檔；PDF、DWG 與其他選配附件共用一個「加入其他檔案」入口。選配檔上傳後仍立即參與 PDF 預覽／辨識或下載，但不常駐顯示兩個選填 slot。 |
| Q9 | 從已核准研發版建立正式版工作時的檔案處理 | `A`：以相同 canonical asset／content hash 將研發版目前有效的 2D、3D、PDF、DWG 帶入正式版工作，不複製 storage bytes；建立可追溯的 server-derived carry-forward receipt。使用者可在正式送出前替換，送出時仍重驗四類。缺 PDF／DWG 不阻擋工作建立。 |

## 2. 問題與成功結果

現行 PNG 是從 SolidWorks 檔案讀取已儲存的內嵌預覽，不是重新渲染的工程圖。既有真實證據曾得到 640×480，且目前 exporter 只取第一個可用 Sheet 預覽。它適合快速確認，但不適合尺寸、公差、圖框文字、完整多 Sheet 審閱或高品質 OCR。

另一方面，背景產生 PDF 需要受控 SolidWorks／eDrawings renderer、桌面或授權資源、較長 timeout 與失敗恢復。此成本不符合本次產品選擇。成功結果是：

- 上傳 `.SLDDRW` 後仍能快速取得低成本 PNG 簡易預覽。
- UI 不讓使用者把 PNG 誤認為完整圖面。
- PDF 存在時提供完整 PDF 預覽及既有瀏覽器 PDF 辨識；不存在時不製造等待狀態。
- 研發過程維持最低檔案負擔，只有正式版才強制交付製造／審核需要的 PDF 與 DWG。

## 3. 名詞與狀態邊界

- `研發版`：canonical Drawing 的研發資料層／小版次工作，例如 `0.1`、`0.2`、`1.1`。不得以 submission mode 的 `research` 字串單獨推定。
- `正式版`：準備成為或建立量產正式基準的 production target／大版次。不得把任何已核准研發里程碑視為正式版。
- `簡易預覽`：來源綁定且 source hash 相符的 `sheet_png | thumbnail_png`，只作快速確認。
- `完整圖面`：使用者提供的本版 PDF。AI-PDM 只讀取、顯示及辨識，不負責產生。
- 本契約生效後，既有已 Released／歷史版本不回填 PDF 或 DWG，也不因新規則變成無效。尚未正式送出的工作在送出正式版時依新門檻重驗。

## 4. 檔案門檻

### 4.1 最低必要集合

| Target | 2D 原始檔 | 3D 原始檔 | PDF | DWG |
| --- | --- | --- | --- | --- |
| 研發版 | 恰好 1 個 primary `.SLDDRW` | 恰好 1 個 primary `.SLDPRT` 或 `.SLDASM` | 選配 | 選配 |
| 正式版 | 恰好 1 個 primary `.SLDDRW` | 恰好 1 個 primary `.SLDPRT` 或 `.SLDASM` | 恰好 1 個本版 current active `.pdf` | 恰好 1 個本版 current active `.dwg` |

`.dxf` 不替代本次人類定案的正式版 `.dwg`；若未來要接受兩者等價，須回到產品決策，不由 RD 自行放寬。組立包的相依檔與主件選擇仍由 DEV-129 管理，不因上表被縮減成只允許四個檔案。

### 4.2 Server authority

- 檔案缺漏由單一 server readiness policy 計算，client 只投影結果。
- 研發版送審沿用 `DRAWING_2D_REQUIRED`、`DRAWING_3D_REQUIRED` 及 primary／extension 檢查；不得因缺 PDF／DWG 產生 warning、blocker 或待辦。
- 執行「送出正式版」時，除上述檢查外新增穩定 blocker：
  - `FORMAL_PDF_REQUIRED`
  - `FORMAL_DWG_REQUIRED`
  - `FORMAL_PDF_DUPLICATE`
  - `FORMAL_DWG_DUPLICATE`
- blocker 在「送出正式版」的同一 server transaction 內，以本版 current active bindings 重算。歷史附件、已刪除附件、其他版次附件或只有檔名而無可讀 asset 均不滿足。
- 一般進入工作區、上傳單一檔案、儲存欄位或研發版送審，不因正式版缺件被阻擋。
- AI summary／risk hint 可以顯示同一 server 結果，但不是另一套判定權威。
- 本版重新上傳 PDF／DWG 時，沿既有 replacement／tombstone 語意讓新檔成為唯一 current active，同角色舊檔降為歷史且仍可追溯；不得實體刪除舊物件，也不新增 primary PDF／DWG 欄位或選擇器。既有資料若有多個 current active，回 duplicate blocker 並要求使用者整理，server 不得任意猜測最新一個。
- PDF 是否滿足正式版門檻只依檔案角色、current binding、可讀 asset、PDF signature／viewer 可開啟等檔案有效性判定；recognition session／adapter 的 pending、partial、failed、timeout 或尚未建立均不得成為正式版 blocker。送審 snapshot 必須保存當時辨識狀態及可見缺漏，供審核者參考，但不得把它轉成第二套檔案門檻。
- 從已核准研發版建立正式版工作時，server 以 approved source revision、source binding id、canonical asset id、content hash、role、actor、target work及時間建立 carry-forward receipt，並在正式工作建立 current bindings。相同 bytes 不複製 storage object。這是受控帶入，不是 UI 讀歷史附件作 fallback，也不能由client提交任意asset id。缺少 PDF／DWG仍可建立正式工作；四項狀態立即反映缺件。
- 正式版 current `.SLDDRW`、PDF、DWG 去除副檔名後若不一致，回傳穩定的非阻擋 warning `FORMAL_2D_FILENAME_MISMATCH`。比較忽略副檔名大小寫，但不以模糊、substring 或人工改 role 視為相同。warning 必須進入既有送審 snapshot，供送審者與審核者看到；不得阻擋送出，也不得另開確認 modal。

## 5. 2D 預覽契約

### 5.1 選擇順序

1. 本版可讀 PDF 存在時，自動以 PDF 作 2D 完整預覽，不要求使用者再次切換或記憶個人偏好。
2. 沒有 PDF，或 PDF 讀取失敗時，使用本版 `.SLDDRW` 的 current-hash PNG 衍生檔作簡易降級預覽；PDF 失敗原因與可恢復動作須就地呈現，不得以 PNG 靜默掩蓋。
3. 本版 PDF／PNG 都不存在時，顯示正確終態；不得拿歷史版檔案冒充本版預覽。
4. 不自動 enqueue `drawing_pdf`，也不以頁面開啟、預覽輪詢或辨識 session 建立 PDF 轉換工作。

### 5.2 UI 文案

PNG 顯示時，在 2D 預覽作用範圍內只保留一個低干擾訊號：

> 簡易預覽

就地輔助文案：

> 目前顯示簡易預覽。若要查看尺寸、圖框或完整圖面，請上傳 PDF。

若 actor 可上傳，提供一個次要 `上傳 PDF` 動作；無權限時只顯示說明，不顯示不可用按鈕。PDF 已存在且可讀時移除上述提示。PDF 讀取失敗而降級 PNG 時，改顯示 PDF 失敗狀態及重新上傳／重試動作。若系統無法判定完整 Sheet 數，文案不得宣稱 PNG 已涵蓋全部 Sheet。

## 6. 智慧辨識契約

### 6.1 Source admission

- 只使用本版 current active files；歷史版本不得加入本次 session 的 `sourceAssetIds`。
- `.sldprt/.sldasm/.slddrw`：`filename.v1 + native-metadata-bridge.v1`。
- `.pdf`：`filename.v1 + browser-pdf-ocr.v1`。
- PNG 簡易預覽不是 OCR 來源，也不得被重新包裝成使用者提供的 PDF。
- PDF 不存在時，native adapters 完成後 session 可進入正常人工核對／完成狀態，不建立 pending PDF adapter。
- PDF 上傳成功後，workspace client 立即對本版 PDF 啟動既有 `browser-pdf-ocr.v1`。辨識在瀏覽器執行，不新增 server OCR queue／worker；上傳成功不得等待使用者切到智慧辨識分頁才開始。
- 使用者關頁、瀏覽器中止或 client adapter 未提交 terminal result時，保留未完成狀態；下一次進入同一工作區自動對同一 current source hash 重跑。已存在相同 source hash 的 terminal result不得重跑。

### 6.2 狀態與文案

沒有 PDF 且原生檔辨識完成：

> 已完成原生檔屬性辨識。未提供 PDF，因此未辨識圖框與圖面文字。

若 actor 可上傳，顯示次要動作：

> 上傳 PDF 以辨識圖框與文字

PDF 存在且 adapter 已完成：

> 已辨識原生檔屬性與 PDF 圖面文字。

沒有 PDF 不得顯示「等待 PDF」、「預覽尚未就緒」或會讓使用者持續等待的進行中文案。原生 metadata 與 PDF observation 的衝突仍進入人工核對，不可由 OCR 靜默覆蓋原生屬性。

## 7. 主要流程

### 7.1 研發版

1. 使用者上傳本版 `.SLDDRW` 與 `.SLDPRT/.SLDASM`。
2. 系統建立 PNG 簡易預覽並執行原生屬性辨識。
3. 主上傳區只突出 `2D 原始檔`、`3D 原始檔`兩項；PDF／DWG 與其他選配附件共用一個`加入其他檔案`入口，不固定顯示 PDF／DWG 選填 slot。
4. PDF／DWG 可隨時由該入口選配上傳；缺少時不提示研發版檔案不完整。選配檔上傳後照常進入本版檔案清單及對應預覽／辨識／下載。
5. PDF 上傳成功後，2D 預覽改用 PDF，並立即在目前瀏覽器執行 PDF 文字／OCR；若關頁中斷，下次進入工作區自動重跑尚未完成的同一 source hash。
6. 2D／3D 原始檔及既有送審條件成立即可送出研發版。

### 7.2 正式版

1. 從已核准研發版建立正式版工作時，server 帶入該研發版目前有效的 2D、3D、PDF、DWG canonical assets／hash並建立receipt；不複製bytes，不接受client任意指定歷史asset。
2. 研發版缺少 PDF／DWG仍可建立正式工作，工作編輯期間允許逐步補齊或替換檔案。
3. 上傳區及「送出正式版」主要動作附近固定投影四項最低必要檔案；缺件時逐項顯示完成／缺少，全部齊備後收斂成單行「正式版必要檔案已齊備」。同一事實不得再建立說明卡、摘要卡或第二份 checklist。
4. 執行「送出正式版」時，server 在交易內重驗四項 current bindings。
5. 缺 PDF 或 DWG 時只阻擋正式版動作，保留上傳、編輯、返回與下載。
6. 四項均滿足後才進入既有正式審核／發布流程；本 DEV 不改變核准人、版次規則或 release gate。

## 8. 範圍

### 8.1 In scope

- 研發版／正式版檔案 readiness policy 與 server-side blocker。
- canonical Drawing workspace 的本版檔案投影、2D 預覽選擇及簡易預覽 UI。
- recognition source selection、沒有 PDF 的正常終態及 PDF 存在時的既有 browser OCR。
- 正式版主要動作附近的四項最低必要檔案投影。
- 相關 focused contract、repository 與真實瀏覽器驗證。

### 8.2 Out of scope

- `.SLDDRW -> PDF` 自動轉換、PDF renderer、eDrawings／SolidWorks COM 背景自動化。
- PNG OCR、DWG 內容解析、互動式 3D、歷史版本批次補檔或補衍生檔。
- 修改已 Released 歷史版本、正式資料手工修補、schema migration、IAM／Secret、Windows service 安裝或發布。
- 改變 DEV-129 的組立包 manifest、參照完整性、原生 BOM 或相依檔規則。

## 9. Repository baseline 與預期影響

目前 source 事實：

- `src/lib/pdm-file-ownership.ts` 只把 `.SLDDRW` 與 `.SLDPRT/.SLDASM` 列為 hard required roles。
- `src/lib/revision-package.ts` 把缺 PDF／DWG-DXF 列為 warning，尚未依研發／正式 target 分流。
- `src/lib/preview-derivatives.ts` 對 SolidWorks 原檔自動要求 `native_thumbnail_png`；`drawing_pdf` 仍是未啟用的 future enum。
- `windows-service/service/worker.mjs` 只宣告及處理 `native_thumbnail_png`。
- `scripts/solidworks-document-manager-preview-exporter.cs` 只取第一個可用 Sheet 的內嵌 PNG。
- `src/lib/drawing-recognition-adapters.ts` 已分流原生 metadata 與 PDF browser OCR，但 workspace 必須排除歷史 source 並投影沒有 PDF 的正常終態。

預期受影響模組：

- policy／service：`src/lib/pdm-file-ownership.ts`、`src/lib/revision-package.ts`、正式版 command 所在的 drawing revision work／submission service。
- preview：`src/lib/pdm-canonical-preview.ts`、`src/components/canonical-preview-media.tsx`、`src/components/canonical-drawing-change-workspace.tsx`。
- recognition：workspace source selection、recognition session projection／presentation；既有 PDF.js／Tesseract adapter 本體原則上重用。
- upload／UI：`src/components/drawing-workspace-upload.tsx` 及正式版 action 附近的檔案 readiness presentation。

此清單是 Brief 的影響盤點，不是 exact modify inventory。升級為 RD Implementation Ready 前，RD／TL 必須以當時工作樹與 Next.js 版本重做 repository-specific assessment，保留既有 dirty 修改，不得依本清單覆寫重疊內容。

## 10. 驗收方向

1. 研發版只有本版 `.SLDDRW + .SLDPRT/.SLDASM` 時可送審，且不出現缺 PDF／DWG warning。
2. 同一研發版沒有 PDF 時顯示 PNG 簡易預覽與正確說明；不建立 `drawing_pdf` job。
3. 沒有 PDF 的 recognition 在 native adapters 終止後顯示完成原生屬性辨識，不持續等待。
4. 上傳本版 PDF 後，2D 預覽優先使用 PDF，recognition 追加 PDF 文字／OCR；同一 PDF bytes 不重複下載。
5. PDF 上傳成功後不需切換分頁或按開始即啟動 client adapter；關頁中斷後重新進入會重跑未完成項，已 terminal 的同一 source hash 不重跑，且不產生 server OCR job。
6. 歷史 PDF／PNG 不得成為本版預覽或 recognition source。
7. 建立及編輯正式版工作不因缺 PDF／DWG 被阻擋；執行「送出正式版」時，缺 PDF 回 `FORMAL_PDF_REQUIRED`、缺 DWG 回 `FORMAL_DWG_REQUIRED`，UI 就地指出缺項。
8. DXF 單獨存在不滿足本次正式版 DWG 門檻。
9. `.SLDDRW`／PDF／DWG 主檔名不一致時仍可送出，送審者與審核者均看得到同一筆 `FORMAL_2D_FILENAME_MISMATCH` snapshot warning。
10. 重傳 PDF／DWG 後只有新檔為 current active，舊檔仍在歷史可追溯；既有多個 active 時以 duplicate blocker 拒絕正式送出，不自動猜測主檔。
11. PDF 辨識為 pending／partial／failed／timeout 或尚未執行均不阻擋正式送出；snapshot 準確保留狀態。損壞、不可讀或非 PDF bytes 的檔案不滿足 PDF 檔案門檻。
12. 正式版四項齊備後沿既有審核／發布流程，不新增 PDF 轉換或 Windows worker 工作。
13. 已 Released 歷史版本不被回溯阻擋；尚未正式送出的工作在主要動作時套用新門檻。
14. 桌面及窄版畫面中，簡易預覽訊號、上傳 PDF 動作、四項檔案狀態與 blocker 可見且無重複教學容器。
15. 正式版編輯期間即看得到四項精簡狀態；齊備後收斂成一行，且送出失敗不是使用者第一次得知檔案要求的時點。
16. 研發版主上傳區只常駐2D／3D必要檔；PDF／DWG可從單一`加入其他檔案`入口上傳，缺少時沒有選填slot或缺件訊號。
17. 從已核准研發版建立正式工作時，相同 asset／hash 被受控帶入且 storage bytes 不複製；receipt 可追溯來源與target。來源缺 PDF／DWG不阻擋建立，且client不能以任意歷史asset冒充帶入。

## 11. 下一步與停止條件

九項人類產品決策與本機 RD 實作／驗證已完成，17 項驗收對照見 §13。正式部署、正式身分／實機驗收及正式資料操作不在本次範圍，不能以本機證據宣稱發布完成。

若實作需要新增 PDF renderer、把 PNG 納入 OCR、讓歷史附件滿足本版門檻、以 DXF 替代 DWG、回溯修改 Released 版本，或改變組立包權威，必須停止並回送產品決策。一般元件拆分、錯誤碼載體、查詢形狀與測試 fixture 由 RD 在上述契約內決定。

## 12. RD 進度與證據（2026-11-23）

- 單一 readiness owner：`pdm-file-ownership.ts`；`drawing-revision-work.ts` 在送審交易內重驗 current bindings，保存 readiness warning 與辨識 session／adapter 狀態快照。辨識狀態不再作為送審 blocker。
- PDF 檔案有效性：`drawing-pdf-validity.ts` 以既有 PDF.js 解析使用者 PDF 的頁面結構，不渲染、不 OCR、不產生衍生檔；送出時同時檢查 storage bytes 長度與 SHA-256。
- 正式工作以 `drawing-revision-work-async-repository.ts` 建立 current bindings，沿用 canonical asset，receipt 存入既有 `policy_snapshot_json`。取消工作時僅可淘汰該工作版次擁有的模型，避免影響研發版來源。
- `drawing-revision-work-file.ts` 的 PDF／DWG replacement 沿用 tombstone；preview 使用本版 PDF 優先及本版 PNG 回退。recognition 查詢限制當前版次。
- focused Vitest：8 個檔案、67/67 通過，涵蓋 required roles、DXF 拒絕、重複 PDF、不可讀 PDF、檔名 warning、權限入口、carry-forward、取消來源保護、預覽回退及 recognition recovery。這些是 RD 自查，尚不證明全部 17 項驗收。
- `test:production-slice:affected`：planner 26、database 35、authorization 52，合計 113/113 通過。證據：`output/qa/dev130-affected/production-slice-aacc8233a387-19652-1795425317077.json`。
- `check:db-boundary` 通過。隔離建置第一次因 PDF.js 不支援 `isEvalSupported` 而失敗；已移除該參數後重跑。第一次結果為 primary invariant 通過、暫存清理通過，不能記為 build PASS。
- 第二次 `build:isolated` 通過：artifact=true、primary=true、cleanup=true。建置複製來源後又修正了「舊重複 active 檔案重傳相同 bytes」的 reuse 邊界，相關 focused 41/41 通過；最終收斂時仍須對包含這項修正的來源刷新建置。最新變更 focused ESLint 通過；文件檢查 23/23、13/13、8/8 通過，這些工具的 PASS 不代表 DEV-130 已完成。
- 新增 `scripts/qc-dev130-browser.mjs`：真實 workspace 元件／CSS、無視窗 Edge、明確 API projection fixture；1440px／390px 的研發版、正式版缺件、正式版齊備共六情境通過，包含 PNG 實際渲染、PDF 讀取失敗回退、簡易預覽提示位於可見 frame、DWG 狀態可捲動到達、無水平溢出。截圖及有界 API 紀錄在 `output/playwright/dev130/`。這是 UI fixture 證據，不是後端或真實登入權限驗收。最初截圖發現提示被 frame 裁切，已修正 CSS 並加幾何斷言後重跑通過。
- `drawing-revision-work-file.principal.test.ts` 新增三個真實 in-memory SQLite 交易案例（Principal admission／storage adapter 為 mock）：PDF／DWG 舊重複 active 集合即使重傳相同 bytes 仍整理為唯一 current binding；保留來源 asset 與歷史 hash；插入失敗時 tombstone、work bindings 與 row version 全部 rollback。該檔 11/11 通過。這證明 metadata 交易，不等同真實 storage provider 或 PostgreSQL 的端到端驗收。
- 最新 `typecheck:app` 通過；UI 新修正與最終來源建置、正式送審 snapshot 真實讀回仍需收斂後驗證。所有瀏覽器與 loopback listener 已由 runner 關閉，bundle 暫存由 runner 清理。
- 新增五種辨識狀態的真實送審 metadata 交易讀回：pending、partial、failed、timeout、not_started；缺 PDF 的正式版回 422 且不改 payload／lifecycle，原生檔齊備研發版可送審，四檔齊備正式版可送出且 snapshot 保存檔名 warning／實際辨識狀態。SQLite 與 task-owned PostgreSQL 皆通過五情境（storage、actor admission、reviewer／package sink 為 fixture，PDF 解析、readiness 與 snapshot SQL 為真實程式）。重現 native PG：`node scripts/qc-dev130-postgres.mjs`。最初 sandbox fixture 的 loopback 無法供主機測試連線；已停止該次程序並確認暫存隨 sandbox 清除。修正 pg_ctl 繼承管線後，主機重跑 PASS，port 63415 已釋放且暫存清除。
- 第三次隔離建置 PASS（artifact=true、primary=true、cleanup=true），涵蓋最終產品 UI 與替換修正；後續只有測試／runner／planner／文件變更，最新 `typecheck:app` 與 planner 27/27 通過。既有 recognition adapter／browser baseline／media type／permission／provenance focused 五檔 36/36 通過。planner 已把兩個 DEV-130 fixture runner 明確列入 application responsibility，未知 runner 仍走 FULL。
- 逐項驗收發現尚未達成 §10.4 的「同一 PDF bytes 不重複下載」：`canonical-preview-media.tsx` 與 `drawing-recognition-pdf-ocr.tsx` 目前分別 GET 不同受保護 endpoint，沒有共用 PDF bytes。需補具身分／source hash 範圍、保留各入口授權的記憶體共用，並驗證權限失效會清除。此缺口未修前不得結案；其他既有 PASS 不能替代該要求。
- 上述 PDF 重複下載缺口已實作：shell-owned `pdm-protected-pdf-cache.ts` 以 current SHA-256 共用並限制 128 MiB／2 分鐘；沒有 browser storage。每次跨入口使用都透過各自受保護 URL 的條件 GET 重新授權，只有 metadata／binding／hash 仍有效且回 304 才重用 bytes；permission/account invalidation 清除，檔案變更依新 hash 及 server current-binding 檢查使舊內容不可重用。OCR 結果寫入不使同一 PDF 重新下載。兩個 API 保留原本權限檢查，條件命中不讀取／傳送 PDF body。
- 快取、兩個受保護讀取邊界、permission provider及真實 preview + auto OCR hook 的整合 focused 5檔 60/60 通過。整合案例同時掛載 viewer 與 OCR，明確斷言兩個不同 URL 各自 GET、只有一份 PDF body；涵蓋撤權、來源變更、cache invalidation、跨入口併發與容量限制。整合 renderer／OCR extractor 為 fixture，API 授權測試沿用既有 verified-actor fixture。最新 source 的 typecheck／建置仍須完成；此證據尚不代表全部 DEV-130 結案。

## 13. 最終本機 RD 驗收對照

本節為最終狀態；§12 保留過程中的失敗與修正，不把舊的 pending 敘述視為目前待辦。驗證使用隔離／合成資料，actor、storage 或 renderer 為 fixture 的範圍已在各段明示，沒有獨立 QC、正式登入或正式環境驗收宣稱。

| §10 項目 | 實作與當前證據 | RD 判定 |
| --- | --- | --- |
| 1 | readiness research policy、不產生選配 warning；SQLite／PG 真實送審交易以兩個 native files 成功 | 通過 |
| 2 | workspace 本版 PNG 提示；6 情境 Edge runner 與可見 frame 幾何斷言；native upload queue 沿用 native PNG kind | 通過 |
| 3 | native-only adapter admission 與完成文案；Edge research fixture 顯示完成／未提供 PDF，沒有 pending PDF | 通過 |
| 4 | PDF 優先選擇 focused contract；viewer + OCR 真實 hook 同時掛載只下載一份 body；兩入口各自條件 GET 授權 | 通過 |
| 5 | OCR hook mount 自動啟動；media-type focused 新增中斷 remount 續跑、terminal pending set 為空不重跑；既有 browser baseline tests | 通過 |
| 6 | current-only preview／sourceAssetIds tests；recognition query 限制 source revision；review snapshot current flag 不借歷史 | 通過 |
| 7 | create repository 沒有四檔 assert；交易內 formal gate 與兩個穩定 required code；UI 缺件／停用送出 | 通過 |
| 8 | exact DWG policy 拒絕 DXF，focused case | 通過 |
| 9 | SQLite／PG 實際 stored payload 與送審 sink 保存同一 filename warning；review workspace 投影 snapshot readiness | 通過 |
| 10 | SQLite 真實 PDF／DWG replacement：相同 bytes 舊重複集合仍收斂唯一、保留 tombstone／hash／來源；失敗全 rollback；duplicate policy case | 通過 |
| 11 | 五種狀態的 SQLite／PG formal submit 均成功且 snapshot 保留 status／adapter diagnostics；PDF parser 及 storage length/hash 不可讀檢查 | 通過 |
| 12 | 正式送出沿用 reviewer／v2 package／lifecycle 流程，既有 Principal required-publish tests；未加入 renderer／worker conversion | 通過 |
| 13 | 新 policy 只在當前 work submit 執行；歷史 read 與 Released rows 不回寫、不回溯執行 gate | 通過 |
| 14 | 1440px／390px Edge 六情境、PNG 與 PDF failure fallback、無水平溢出；提示完整位於 frame；狀態可捲動到達 | 通過 |
| 15 | 四項就地 readiness、全部齊備單行；Edge formal missing／ready 兩情境，duplicate 另顯示 server blocker 原因 | 通過 |
| 16 | 一個「加入其他檔案」入口，research 不顯示 PDF／DWG 必要 slots；Edge research case | 通過 |
| 17 | repository create 執行以 approved source binding 建立 target binding、保留相同 asset/hash、server receipt；無 file_assets／storage copy；拒絕非 approved source；cancel 不淘汰來源模型 | 通過 |

最終證據與可重現入口：

- 相關 Vitest 18 檔 171/171 通過，隨後只新增 OCR 中斷／terminal 案例，該檔 5/5 通過；目前案例總數為 172，未以未執行全庫測試宣稱全庫通過。
- `node scripts/qc-dev130-postgres.mjs`：5/5，真實 disposable PostgreSQL；port／cluster／temporary fixture 已清除。
- `node scripts/qc-dev130-browser.mjs`：6/6，無視窗 Edge；最新截圖與 request 紀錄在 `output/playwright/dev130/`，listener／bundle 已清除。此 runner 使用 API projections，並非正式身分端到端驗收。
- `test:production-slice:affected -- --evidence-dir output/qa/dev130-affected-final`：PASS；先前 sandbox preflight 為 NOT_RUN，主機同命令完成 planner／release-core／database／authorization。證據 `output/qa/dev130-affected-final/production-slice-aacc8233a387-16076-1795428169388.json`。
- 最新產品來源 `build:isolated` PASS：artifact=true、primary=true、cleanup=true；後續只有 OCR test／文件變更，最新 `typecheck:app` PASS。所有本輪修改與新增 TS／TSX／MJS 的 focused ESLint PASS，`git diff --check` PASS。
- 沒有 schema migration、正式資料修改或部署。既有 dirty UI 修改完整保留在同一分支；本次以本機工作樹交付，未把其他人的修改自動打包 commit／push。
- 尚待：最新來源完整建置、桌面／窄版真實瀏覽器、檔案替換與送審 snapshot 的端到端讀回、17 項驗收逐項核對。工作樹保留先前同任務 UI 修改；沒有 migration、正式資料修改或發布。
