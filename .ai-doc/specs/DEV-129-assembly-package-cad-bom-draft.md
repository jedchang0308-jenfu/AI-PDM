# DEV-129 組立包上傳與自動 BOM 草稿

定案日期 2026-11-19。收件、整包下載與背景 BOM 草稿已在獨立工作樹實作。§6 記錄驗收案例及實測範圍，§7 保留 RD 實作契約。

## 1. 使用者決策與交付目標

| 引導決策 | 已確認內容 |
| --- | --- |
| **1A** | 首版交付可核對的 BOM 草稿。正式 BOM 審核、發布及採購、製造、領料串接留待另案。 |
| **2C** | 工程師一次選多檔、整個資料夾或 Pack and Go ZIP。AI-PDM 自動整理為組立包，從 CAD 讀取組態、階層與數量並建立草稿，主組立或 BOM 表均無須另傳。 |
| **3A** | 直接把包內辨識或選定的 `.SLDASM` 綁為圖號版次唯一的 3D 主檔。圖號送審仍有既有 2D 主檔要求。 |
| **4A** | 有組立包的圖號版次只需通過背景必要參照檢查，便可依既有規則送審。逐版開啟與重建可用於問題排查及實機驗收。 |

**正常交接只有兩個動作：工程師選取一次檔案，接手的人按一次「下載組立包」。** 主件辨識、必要參照檢查與 BOM 草稿產生都在背景執行。工程師只處理系統無法判定的項目。組立包及草稿共用同一個來源，每個版本都能取回當時保存的檔案。

現行圖號版次工作已有受控檔案入口，Windows 服務已有裝置授權和原生解析執行路徑，這兩處是本案接點。BOM 資料與入口依現行重建決策設計。DEV-041 的技轉 Pack and Go 規格可供 ZIP 檢查參考，其技轉、分類與基準線依原案範圍管理。 [版次工作檔案入口](../../src/app/api/pdm/drawing-revision-works/%5BworkId%5D/files/route.ts) · [Windows 解析服務](DEV-125-windows-solidworks-service-and-openswx-retirement.md) · [BOM 重建決策](../decisions/ADR-PDM-BOM-RETIREMENT-001-hard-delete-and-rebuild-boundary.md) · [DEV-041 技轉規格](SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md)

## 2. 使用流程

1. **上傳一次。** 圖號版次工作頁只有一個檔案入口：拖入多檔或資料夾，點主按鈕選多檔，或由旁邊選單選整個資料夾；ZIP 也走同一入口。選完自動上傳，含 `.SLDASM` 時在背景整理為保留相對路徑的 ZIP，沿用組立解析與 BOM。若需交付其他組態，提供該組態需要的子組立、抑制件與外部參照。完成安全收件並排程後，工程師可繼續編輯圖號工作。 [SolidWorks Pack and Go 選項](https://help.solidworks.com/2023/english/SolidWorks/sldworks/r_pack_go_db.htm?cid=f622b689a9b84ecc996ebe4512227489)
2. **背景完成。** 能唯一辨識主組立時直接綁定包內 `.SLDASM`，採用其儲存時的啟用組態並顯示組態名稱。主件或組態有歧義時，只請工程師選擇該項，沿用原 ZIP 接續。系統檢查必要參照並建立 BOM 草稿，唯一且無衝突的料號直接帶入，畫面優先列出缺檔、同名衝突、待建檔、待編號和用量不明。已有結果可直接查閱或更正，正常結果無須逐項確認。 [SolidWorks 組態用量](https://help.solidworks.com/2026/English/SolidWorks/sldworks/t_displaying_config_quantities_boms.htm) · [OpenBOM 的 SolidWorks 建表流程](https://help.openbom.com/installing-and-working-with-the-solidworks-plug-ins/)
3. **一鍵下載。** 接手者從圖號版次頁按「下載組立包」，直接取得該版次的原始 ZIP，頁面顯示主組立的相對路徑。掃描尚未完成或查到缺件時，同頁標示原因，已安全收件的 ZIP 仍可下載。子件進版後，從歷史版次下載仍得到當時的 ZIP。 [SOLIDWORKS PDM 參照版次說明](https://help.solidworks.com/2026/english/EnterprisePDM/fileexplorer/r_EPDM_Add_in_Task_Pane.htm?id=0.11.0.4)

### 2026-11-19 統一入口補充（本機 1021 試用）

- 移除工作頁獨立的「上傳組立包」與「上傳所選檔案」。空白版次顯示一個拖放區；已有檔案時顯示「加入檔案」，右側選單可選資料夾。選完即開始，只有無法唯一決定的主檔才要求選擇，選擇後自動接續。
- 多檔／資料夾在瀏覽器以 fflate 0.8.3 整理成 ZIP，保留相對目錄與所有輔助件。單獨 ZIP 維持原始 bytes；與其他檔案一起選取時合併為新包。伺服器沿用原本收件、權限、不可變來源、主組立辨識與 BOM 排程，不新增資料庫結構。
- 未選 ZIP 的補檔先讀本版組立包再合併，原檔保留；同一路徑更新、單檔同名只在唯一位置更新，多目錄同名不猜測。明確提供新 ZIP 則視為替換整包。補檔後建立新的分析來源，歷史包不改寫。
- 包內 `.SLDDRW`／PDF 只有符合本圖號、根號或唯一主組立檔名才自動綁定；單獨選取的主圖面也可綁定。子件圖留在組立包，不因「只有一張」誤設成主組立圖面。多個主檔候選必須選擇，不採最後一檔無聲覆蓋。
- 完整資料夾的外層目錄原樣保留；原生解析器對組立的儲存絕對參照，允許配對到該組立所在目錄的精確同名子件，仍檢查不同儲存來源衝突。不將此規則用於外部幾何參照，也不從其他目錄任選同名檔案。
- 延續 256 MiB ZIP／2 GiB 展開總量／10,000 檔限制；拒絕危險 Windows 路徑、重複路徑、連結與加密 ZIP。重打包前核對來源 CRC 和大小，產出仍由伺服器完整檢查。失敗顯示在原入口，重試沿用原指令身分，只重送未完成項目。
- 上傳前保存當前欄位；傳輸期間防止同頁重入，完成後原位讀回工作。不將「關閉失敗提示」當成取消工作或刪除整包。BOM 排除用途不移除下載檔案，仍沿用既有 UI。

以下送審與歷史契約中的「ZIP」指系統保存的組立包，來源可以是多檔、資料夾或使用者提供的 ZIP。

本次 RD 自查：針對性單元／UI 測試 105 passed，原生解析器 61 cases passed，型別、受影響檔案 ESLint、DEV-079／100 契約及隔離建置通過；affected-slice runner 的 FULL 來源測試通過。A0054 多檔、資料夾、完整編輯頁多檔及 ZIP 均以無視窗 Edge、任務隔離 PostgreSQL、實際 Windows worker／Document Manager 跑過，必要參照 passed、4 個實例的數量已讀回、下載 SHA256 一致，並驗證歷史包凍結。補 2D、缺 2D 拒絕、未掃描新包拒絕及實際送審交易的隔離回歸通過。這些是 RD 自查與 fixture 身分，不宣稱本次人工驗收或正式環境驗收。

第一輪資料夾測試保留為失敗證據（外層目錄使參照未知），補上相鄰檔案配對後重測通過；第一輪完整頁測試的下載名稱預期誤用輸入 ZIP 名，修正為工作圖號後通過。證據位於試用工作樹 `output/qa/unified-upload`；實際 shared daily 1021／1020 畫面及 636 寬度檢查位於 `output/playwright/unified-upload-live`，該次檢查未修改共用業務資料。1021 保留本分支與本機解析器供試用，1020 保持 main；未推送、合併或正式部署。

2026-11-20 使用者明確允許將依賴名稱及版本送至 npm registry，並要求升級套件後合併 main。先補跑 `npm run audit:production`，確認基底有 1 low／4 moderate；再將 fast-xml-parser 更新至 5.12.1，並以 scoped override 將 google-gax 的 rimraf 更新至 6.1.4、glob 14.0.6／minimatch 11.0.9，同時接受相容範圍內的開發工具修版。最終 `npm run audit:production` 與完整 `npm audit --json` 均為 0 vulnerabilities。修版後聚焦測試 105 passed、typecheck、受影響檔案 ESLint、隔離建置、A0054 真實資料夾流程及 affected-slice FULL 來源檢查通過。查核與升級紀錄保存於 `output/qa/unified-upload/dependency-*-20261120.*`。

### 圖號送審規則

| 狀況 | 系統處理 |
| --- | --- |
| 主組立已確定 | 從本次上傳 ZIP 保存選定的 `.SLDASM` 原始內容及指紋，經既有受控檔案寫入邏輯完成 3D 主檔與本次上傳證明，ZIP 則保留為整包下載來源。主檔曾單獨上傳且內容相同時，沿用相同內容並保留一筆有效主檔；內容不同時提示工程師確認切換到包內主檔，避免無聲覆蓋。 |
| 必要參照檢查通過 | 預設檢查儲存時的啟用組態。工程師另外指定交付組態時，該組態也須通過。以相同原始 ZIP、主組立及交付組態的檢查結果，搭配現行 2D／3D 主檔條件判定能否送審。 |
| 缺必要子檔、解析歧義、待掃描或無法判定 | 圖號工作可繼續編輯與保存，畫面指出目前需要等候、選擇或補正的項目。確認缺檔時，補傳一份 ZIP 取代草稿來源並自動重新檢查。待全部必要參照通過後即可送審。 |
| BOM 有待處理項目 | 已通過的 CAD 參照檢查仍有效。例如無編號但檔案齊全，圖號可送審，BOM 繼續顯示「待編號」。有明確 CAD 排除設定的輔助件如果仍是開啟組立所需的參照，照樣檢查包內檔案。 |

伺服器在既有的圖號送審交易中，核對當前組立包、3D 主檔及交付組態是否與參照結果一致。送審成功時保存當次組立包與結果，審核明細使用該份記錄。補傳 ZIP、改主件或增改交付組態後，待新的對應檢查完成再送審。一般單檔版次與舊版次維持原送審路徑。 [圖號主檔契約](SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md) · [現行送審服務](../../src/lib/drawing-revision-work.ts)

## 3. 子件、參照與用量

| 情況 | 組立包與 BOM 草稿的行為 |
| --- | --- |
| 已建檔圖號／料號 | 保留包內實際使用的原檔。優先使用 CAD 料號或精確圖號關聯；CAD 沒有提供編號時，使用 manifest 中實際檔案的檔名（去掉副檔名）精確查找既有料號、圖號或根號。在同公司、可讀範圍內找到唯一且無衝突的適用料號時直接帶入；同根號多個料號、圖料衝突才提示工程師。不用模糊比對、前綴猜測或覆蓋 CAD 明確編號。 |
| 有圖號／料號但未建檔 | 外部檔隨包保存。屬於實際用料的項目顯示「待建檔」，保留原編號、階層及可確認用量。後續補建資料時由工程師完成關聯。 |
| 無編號的外部輔助件或狀態件 | 外部檔仍隨包保存。有明確 CAD 排除設定者記在草稿的排除清單。用途不明者待工程師確認，實際用料標記「待編號」。 |
| SolidWorks 內嵌虛擬件 | 隨其所屬組立檔保存，仍追蹤其外部參照。是否納入 BOM 依組態與用途判定，內嵌狀態本身不決定是否為實際用料。 [SolidWorks 虛擬件](https://help.solidworks.com/2025/English/SolidWorks/sldworks/c_VC_Virtual_Components_Overview.htm?id=817b70ea8484404fa68e964e1987d753) |
| 缺檔、同名但無法唯一解析、未支援的參照 | 顯示受影響的父件、組態及參照。依賴該參照的草稿行保持待處理，保留已確定的項目。按「補正組立包」重新上傳後，以新來源重新解析。 |

- **以指定組態的 CAD 元件實例計算。** 逐層保留父子階層與子件引用組態。納入判定採該組態的抑制與 BOM 排除設定，隱藏顯示不等於排除。依子組立的 Show／Hide／Promote 設定保留並展開、保留單列、或提升子件一層。相同檔案在同父件使用 12 次應得到 12 個實例的基礎用量，同名異檔不得混算。 [排除元件 API](https://help.solidworks.com/2025/english/api/swdocmgrapi/SolidWorks.Interop.swdocumentmgr~SolidWorks.Interop.swdocumentmgr.ISwDMComponent5~ExcludeFromBOM.html) · [子件展開列舉](https://help.solidworks.com/2026/english/api/swdocmgrapi/SOLIDWORKS.Interop.swdocumentmgr~SOLIDWORKS.Interop.swdocumentmgr.swDmShowChildComponentsInBOMResult.html)
- **用量保留適用範圍與單位。** 階層列用量以直接父組立為基準。提升後乘上經過的父件用量，再合併同父層且料號、組態、來源版本與單位一致的項目。CAD 有自訂用量時採可驗證的值與單位。若長度、重量、焊件切割清單、未保存的運算值或特殊組態無法可靠取得，該項顯示「用量待確認」。 [SolidWorks BOM 元件與用量設定](https://help.solidworks.com/2026/english/SolidWorks/sldworks/HIDD_BOM_COMPONENT_OPTIONS.htm?id=13.9.3.5)
- 可先用 SolidWorks 內建 BOM 當開發對照，核對同組態的階層、用量與展開行為。它是驗收證據，日常操作只使用 ZIP。

## 4. 資料、權限與失敗行為

- **來源固定。** 在版次工作保存原始 ZIP 的識別、SHA-256、儲存物件版本、包內安全相對路徑、檔案指紋與主組立。版次留存時綁到當時的確切來源。BOM 草稿綁圖號版次、組立包指紋、主組立路徑、組態與解析器版本，保留每一列的 CAD 證據及人工修改，供日後追溯。首版下載原始整包，子檔的新版本或料號資料變動不得改寫歷史內容。
- **重試與競態。** 同一上傳操作可用同一請求身分取得已完成結果。同一草稿來源與解析工作重送不得重複建草稿或覆寫人工調整。補傳 ZIP 或切換組態會建立自己的來源綁定，遲到的舊工作只可寫入仍持有有效租約的對應來源。回覆遺失沿現行裝置工作讀回契約確認後再重試。
- **授權與檔案隔離。** 上傳、下載、草稿讀寫使用現行 Principal 與版次範圍授權，組立包下載需符合原生 CAD 的查看與下載權限。只交付給發起者本人已授權的 Windows 裝置。領取、取檔、心跳和回傳都核對當下權限、租約及來源指紋。裝置收到的解析材料限該包，所用外部參照須實際解析到該包內，拒絕以工作目錄、使用者資料夾、網路共用或名稱猜測替代。 [Windows 裝置與來源授權](DEV-125-windows-solidworks-service-and-openswx-retirement.md)
- **封包收件。** 安全檢查、限制及傳輸方式依 §7.2。對 Windows 正規化後的路徑做唯一性檢查，拒絕不安全路徑、連結、加密或損壞的封包。封包完整保存與驗證後才成為下載及解析來源。 [既有私有檔案儲存](../../src/lib/google-cloud-file-storage.ts)
- **集中顯示例外。** 在原版次工作顯示背景進度及待處理項目。裝置離線時顯示「等待 Windows 解析」，工程師可繼續編輯。必要參照檢查成功時顯示「參照檢查通過」。實機驗收另記錄下載後開啟及重建結果。

## 5. 切片與 RD 接手

| 切片 | 交付與依賴 |
| --- | --- |
| **A 組立包收件與整包下載** | 圖號版次工作可收件、查詢與下載來源 ZIP。用同一 ZIP 證明檔案、路徑與內容可回復，補傳與舊版下載互不影響。可與原生解析試驗獨立進行。 |
| **B 原生解析與草稿** | 優先在 DEV-125 同一 Windows 服務增加組立解析能力。先用實際受支援的 CAD 檔、Document Manager runtime／interop／授權測試組態列舉、元件、排除、展開與外部參照，對照同組態的 SolidWorks 結果。通過後接上自動派送、配對與草稿頁，沿用裝置認證及有界暫存。 [組態元件 API](https://help.solidworks.com/2022/english/api/swdocmgrapi/SOLIDWORKS.Interop.swdocumentmgr~SOLIDWORKS.Interop.swdocumentmgr.ISwDMConfiguration2~GetComponents.html) · [現有 Windows worker](../../windows-service/service/worker.mjs) |

在 A 與 B 接通後，沿既有圖號工作做 3D 主檔綁定與送審檢查。優先在同一背景工作取得參照與 BOM 所需資料，沿用既有權限、版次與審核頁。使用者端的操作集中在圖號版次頁。

若現有 Document Manager 無法可靠支援核心案例，保留 A 的獨立成果，列出實測差異及是否需要完整 SolidWorks 的技術選項，再決定 B 的實作方式。2C 自動產生草稿的驗收條件維持有效。首版不含跨組立 Where-used、每檔自動去重、更新子件時自動重建歷史組立或新技轉基準線。

RD 可從 §7.7 的傳輸及原生工作開始。傳輸有初始可實作的容量值，原生涵蓋範圍以代表性 Pack and Go ZIP 與既有 Document Manager 環境實測確認。

## 6. 驗收

| 案例 | 可判定結果 |
| --- | --- |
| **01 混合子件與完整下載** | 用一套組立涵蓋已建檔、未建檔、無編號外部件、內嵌虛擬件與巢狀子組立。從版次工作上傳並從版次頁下載，核對 ZIP 指紋。於無法存取原工作目錄／網路磁碟、SolidWorks 尚未開啟原件的實機環境解壓，開啟主組立、切換驗收組態並重建。必要參照全部載自包內，無缺檔或未解析參照。 |
| **02 ZIP 單檔自動產生草稿** | 使用已授權且在線的 Windows 服務，只上傳一次 ZIP。在背景執行時可繼續修改圖號工作。主件、組態與料號都可判定時，自動綁定、填料號且無須另按解析或確認。主件或組態有歧義時只問該項，選完沿原 ZIP 接續。接手者從該版次按一次即可下載原 ZIP。 |
| **03 組態、階層與正確用量** | 同一螺絲檔 12 個實例、多組態用量不同、抑制／隱藏／排除、巢狀子件及 Show／Hide／Promote 均有實機對照。至少一項自訂用量或特殊單位驗證可追溯的結果，或者顯示無法確認的原因。 |
| **04 配對與人工確認** | 唯一料號、重名／圖料衝突、尚未建檔、無編號真用料及繪圖輔助件都能得到對應結果。工程師更正草稿後，背景重試不覆蓋更正。 |
| **05 缺檔與安全拒絕** | 缺巢狀子檔、同名參照歧義及包外參照能定位來源。損壞或不安全的 ZIP 不產生可用來源。已收件但缺檔的 ZIP 可取回，頁面保留缺檔提示。 |
| **06 版本、重送與裝置狀態** | 裝置離線時可等待並在上線後續跑。重送同一來源不重複建草稿。補傳新包後，遲到的舊回覆不覆寫新結果。舊版仍可取回原 ZIP 和對應草稿。 |
| **07 權限與隔離** | 合法身分可從正常入口讀寫和下載。跨公司、其他人的裝置、僅有查看權或撤權後，不能經整包下載或工作路徑取得 CAD bytes、工作憑證或寫入解析結果。 |
| **08 主檔綁定與既有 2D 要求** | 包內 `.SLDASM` 能作為且只產生一個受控 3D 主檔；已單傳相同內容時也只有一個有效主檔，不同內容須由工程師確認切換。缺既有的 2D 主檔仍阻擋圖號送審，但可使用組立包並產生草稿。無組立包的單檔版次沿既有送審行為。 |
| **09 參照檢查與例外** | 用同一組立測試待掃描、缺檔、參照歧義及補正後通過。另選交付組態缺件時仍阻擋；只在未交付組態使用的缺件不阻擋。CAD 排除但仍需載入的輔助件，缺檔時阻擋；補檔完成後即使 BOM 待配對或待編號，圖號仍可送審。 |
| **10 送審以當前來源為準** | 以正常 UI 和送審 API 驗證，補傳 ZIP、改主件或組態後，舊的通過結果無法送審。新來源通過後可一次送出，審核明細讀回同一份主件、ZIP 指紋與交付組態。 |

驗收記錄需能對應來源指紋、主組立、組態、CAD／解析器版本及受測身分。

2026-11-19 開發自查使用 SOLIDWORKS 2025 安裝附帶的 U-Joint 範例，將 2 個組立與 8 個零件壓成 998,824 bytes 的 ZIP。隔離 PostgreSQL、真實收件與下載路由、測試 Principal 及無視窗 Edge 的版次檔案面板完成一次選檔、一次下載。原始與下載 ZIP 的 SHA-256 均為 `89bf9684b277b25d0e7cc523421f56f5168caa22cfa8254b4e7e3836a60a4171`，worker 解包後的 10 個檔案也逐一比對通過。這涵蓋案例 01、02 的傳輸部分。這次傳輸測試採一般 ZIP 製作。下表另記錄原生 Pack and Go、BOM 對照與下載副本的 CAD 開啟重建。 [瀏覽器驗證](../../scripts/qc-dev129-assembly-browser.mjs) · [原始檔到 worker 的檢查](../../scripts/qc-dev129-assembly-zip.mjs)

### 實際組立包與 SOLIDWORKS 對照（2026-11-19）

| 驗證輸入 | 觀察結果 |
| --- | --- |
| 開發用 `A0054.zip`，1,392,774 bytes，SHA-256 `62b8f573b4370717f5e75f688f091ea7141302292e11d6b6d851ec913b9f55a8` | 工程師在實際檔案面板選 ZIP 一次。Windows worker 領取工作，以授權的 Document Manager 讀出主件、組態「預設」和 4 個實例，回寫草稿並綁定 3D 主檔。必要參照通過。隔離資料庫回讀及歷史下載使用同一包。 |
| 接手者從同一面板按一次下載 | 下載 bytes 與來源一致。以新的空白 SOLIDWORKS 2025 SP3 程序從下載副本開啟、重建，錯誤與警告均為 0。每個啟用的外部元件都核對實際從解壓目錄載入。實際縮排 BOM 表列出 `A0030 × 1`、`A0033 × 2`、`DEV-129組立圖測試用零件 × 1`；最後一項採子件組態「彎折」。三項按檔案及組態加總均與 PDM 草稿一致。草稿仍保留待識別實例供工程師確認。 |
| 幾何檔缺失與自訂用量 | 從同包移除 A0033 時，兩個受影響實例的用量留空，其他兩個零件仍可讀取。另一個獨立 CAD 副本用真實自訂屬性把 A0033 設為每件 2.5 m。Document Manager 讀出兩個 2.5 m，SOLIDWORKS 原生 BOM 用量格顯示 5。 |
| 原廠 U-Joint 的原生 Pack and Go | SOLIDWORKS 產出含 2 個組立、8 個零件的 ZIP。Document Manager 自動辨識頂層 UJoint，取得 8 個直屬實例及 crank 子組立的 3 個實例，並分開 SHORT 與 LONG 銷件組態。 |
| 內嵌虛擬件、排除與三種子組立展開 | 在 U-Joint 的隔離副本內建立虛擬件，再由 SOLIDWORKS Pack and Go 產包，SHA-256 為 `2161d3f5e4f0f14d66d1ac460eac0b896b5ae32d9478de9b0a2c344cee1ec2a5`。三個組態均讀到 SHORT 銷 12 件、LONG 銷 1 件、內嵌件 1 件。隱藏的 Yoke_female 仍計入，bracket 列為排除。原生縮排 BOM 的 Default、Hide、Promote 分別顯示 8、6、8 列，子組立的三個下層零件分別呈現於父件下、隱去、提升至主層。 |
| 非交付組態、同名與幾何參照 | 移除已排除 BOM 但仍需載入的 bracket，必要參照受阻。移除只在另一交付組態啟用的 Yoke_male，Default 仍通過，另選 Hide 時只阻擋 Hide。A0054 的兩個同名候選 A0033 不能唯一解析時，保留其他零件用量。另在 A0030 建立實際插入零件特徵，完整包通過；移除 BaseOnly 後正確定位 `A0030.SLDPRT → BaseOnly.SLDPRT`，保留組立元件草稿。 |
| 圖號工作送審與接手 | 隔離 PostgreSQL 搭配實際圖號工作頁及送審交易。缺 2D 主檔時按鈕停用，API 回 422。補上 2D 後替換組立包，解析完成前 API 回 409。新包完成後從頁面送審回 200，同一交易保存 review package v2 與組立快照，指派審核者的測試身分可下載同一 ZIP。2D 樣本用來驗證既有送審條件。 |

上述端到端測試走實際檔案面板、HTTP 收件與下載、隔離 PostgreSQL、Windows 工作迴圈及原生解析器。測試身分、裝置准入以及記憶體中的工作金鑰提供者使用隔離測試介面。桌面 CAD 只用於獨立驗收，日常操作仍由 Document Manager 在背景完成。 [瀏覽器入口](../../scripts/qc-dev129-assembly-browser.mjs) · [Worker 驗證入口](../../scripts/qc-dev129-assembly-live-worker.mjs) · [原生桌面對照](../../scripts/dev129-solidworks-sample-oracle.cs)

RD 要重現同一條實檔流程，可在已安裝 Windows Document Manager 與 PostgreSQL 18 的開發機執行 `node scripts/qc-dev129-assembly-postgres.mjs`。指定 `DEV129_LIVE_ONLY=1`、`DEV129_LIVE_REQUIRE_PASSED=1`，以 `DEV129_LIVE_ARCHIVE` 指向 ZIP，以 `DEV129_LIVE_EXTRACTOR` 指向對應版本的解析器。將 `DEV129_LIVE_DM_KEY_MODULE` 指向既有測試設定的讀取模組，該模組匯出 `readAuthorizedDocumentManagerKey()`。金鑰只在工作程序記憶體使用。若提供 `DEV129_LIVE_EXPECTED_BOM`，runner 同時比對原生桌面讀出的同包指紋、主組態、各子件路徑、引用組態及數量。 [隔離資料庫入口](../../scripts/qc-dev129-assembly-postgres.mjs)

## 7. RD 實作交接

### 7.1 接點與正常頁面

| 接點 | 實作位置與責任 |
| --- | --- |
| 圖號版次工作 | 沿用 `CanonicalDrawingChangeWorkspace` 及 `DrawingRevisionWorkService`。在原檔案區加「上傳組立包」，選檔即開始傳輸，背景狀態在同區顯示。解析期間仍可存圖號欄位；已有正常結果的畫面只顯示下載、主件路徑及 BOM 草稿入口。 [工作頁](../../src/components/canonical-drawing-change-workspace.tsx) · [版次服務](../../src/lib/drawing-revision-work.ts) |
| 運送與下載 | 擴充現有檔案儲存分層加入組立包所需的有界上傳及串流讀取。正式走現有 AI-PDM 私有 GCS，地端驗收走隔離 local provider。ZIP 和一般 `.SLDPRT`／`.SLDASM` 的單檔入口各走既有角色對應。 [檔案儲存契約](../../src/lib/file-storage.ts) · [GCS adapter](../../src/lib/google-cloud-file-storage.ts) |
| 主檔與版本 | 抽出既有 [`drawing-revision-work-file.ts`](../../src/lib/drawing-revision-work-file.ts) 受控檔案暫存、雜湊重用、來源綁定與主檔寫入中可重用的部分。ZIP 識別、包內 entry 和此工作上的 3D binding 一起記錄。單檔入口沿用同一套主檔不變條件。 |
| Windows 工作 | 沿現行 worker 排程、Linked device、認證、租約、key broker 及 installer 組裝，新增 `assembly_analysis` 工作類型及此能力的 readback。舊 installer 可繼續處理現有工作，新工作由宣告支援的裝置領取。 [Windows worker](../../windows-service/service/worker.mjs) · [工作結果讀回](../../src/app/api/windows-service/jobs/%5Bkind%5D/%5BjobId%5D/route.ts) |
| 審核與歷史 | 由既有圖號送審、核准、歷史明細讀取第 7.6 節的凍結資料。審核中顯示當次送審來源，歷史頁顯示該版次的整包下載連結及同一來源的唯讀 BOM 草稿。 [審核明細路由](../../src/app/api/pdm/review-requests/%5BrequestId%5D/route.ts) · [版次歷史 reader](../../src/lib/pdm-canonical-drawing-history.ts) |

工作狀態獨立刷新，先採可見頁籤每 3 秒查詢，等待離線裝置或暫時錯誤時退避至 15 秒，終態即停止。刷新只更新組立包、草稿摘要、附件和送審可用狀態，保留未儲存的圖號欄位。如果背景綁主檔推進原工作 `rowVersion`，重新讀工作後，僅在伺服器欄位仍等於編輯起點時自動重送使用者的修改。有其他人改同一份資料時，沿用現行衝突提示。

### 7.2 ZIP 傳輸與收件

- 採同源 **8 MiB** 順序分段，使用者一次選檔後，前端自行開始、傳完及確認。ZIP 首版預設上限 **256 MiB 壓縮、2 GiB 解壓、10,000 個 entries**，收件驗證整體預算 **180 秒**。由服務端集中設定並回傳 UI 使用；`.SLDASM` 維持既有受控主檔上限。這些是起始實作值，待第 7.7 節量測後可調整。現行 GCS adapter 的整檔 Buffer 方式不適合直接處理 ZIP。Cloud Run HTTP/1 單次請求上限與 GCS 可續傳分段據此處理。 [Cloud Run 請求限制](https://docs.cloud.google.com/run/quotas#request_limits_for_cloud_run) · [GCS 可續傳操作](https://docs.cloud.google.com/storage/docs/performing-resumable-uploads)
- 後端先保存屬於目前工作／發起者的上傳記錄，再以既有工作負載身分對其私有業務 bucket 物件鍵啟動 GCS resumable upload，使用 create-only generation precondition。GCS session URI 留在服務端受保護的上傳狀態，瀏覽器只持有 PDM package ID。遇斷線先向 GCS 查已收到的 offset，前端自動從該處接續；驗收 local provider 用相同 offset 契約及隔離暫存。每次只允許一段寫入同一上傳記錄，逾時依 provider offset 讀回與回收寫入權，防止另一個請求覆蓋尚在傳輸的段落。
- 最後一段完成後，前端自動呼叫 finalize。服務以確切的物件 generation 及宣告大小讀回，在有界串流中驗證 ZIP 結構、實際解壓大小及 CRC，同時計算整包與包內檔案 SHA-256。保留原路徑及 Windows 唯一鍵。拒絕絕對路徑、越出根目錄、連結、不合法 Windows 路徑、正規化同名、損壞、加密或超限內容。使用可驗證的 ZIP reader，沿輸入串流或有界 range read；檔案解壓後逐 entry 處理。沒有 `.SLDASM` 時回傳檔案類型錯誤。`finalize` 回覆遺失時讀回同一 package 狀態，先確認 GCS generation 和既存結果，才繼續未完成階段。
- 驗證與物件 I/O 在資料庫交易外完成。只有完整驗證且工作仍可編輯時，才在同一個短交易啟用 ZIP、寫入 manifest、排入解析，並處理現有解析的失效。新 ZIP 傳輸期間保留已收件來源；同一工作預設只允許一個進行中的上傳。傳輸中斷可續傳；取消、失敗或 24 小時未完成時，舊來源維持有效。未收件物件永不成為下載來源，依既有任務可追溯的孤立物件處理方式記錄，不擴張 runtime 刪除權。接受下載的 ZIP 採 generation-bound stream 與私有 cache headers，回傳原檔 bytes，避免 Cloud Run 將大檔整體放入記憶體。

### 7.3 API 與權限

工作區 browser 路由以 `/api/pdm/drawing-revision-works/{workId}/assembly-packages` 為基底。路徑 `{id}` 是本工作所屬組立包，系統從已驗證身分取得公司、從工作取得圖號／版次，所有 ID 皆需核對歸屬。

| 操作 | 契約 |
| --- | --- |
| `POST` 基底 · `GET` 基底或 `/{id}` | POST 接受 `fileName, byteSize`、現行 command `Idempotency-Key` 及已知 active package ID，回 `packageId, nextOffset, chunkBytes, maxArchiveBytes`。同 key 同內容宣告回原操作，不同宣告回 409。GET 回收件進度、主件／組態候選、參照結果、BOM 摘要、所需例外與合法操作；GET 無寫入。 |
| `PUT /{id}/content` · `POST /{id}/finalize` · `DELETE /{id}/upload` | PUT 使用 `Content-Range` 及 binary body。若重送、範圍不合或結果不明，回當前 offset 供續傳；最終完整包雜湊由後端驗證。Finalize 可重送，成功回 202 和 `queued`，後續背景工作不需開著頁面。DELETE 只取消未收件的上傳，供異常時切換來源。 |
| `PATCH /{id}` | 只接受工作尚可編輯的 `mainEntryKey`、已知 `deliveryConfigurations`、主檔衝突時的明確 `acceptPrimaryReplacement`。帶目前 `selectionVersion` 和命令 idempotency key。變更只針對該包，後端針對尚無有效結果的組態自動排程。 |
| `GET /{id}/bom?configuration=…` · `PATCH /{id}/bom` | GET 回該組態分層草稿，例外置前，回 `draftVersion`。PATCH 接受 `configuration, rowKey, draftVersion` 及被修改欄位（`partId, quantity, unit, disposition`），逐筆自動保存。過期回 409，重載草稿並保留未儲存的例外操作。正用量為十進位字串，未知為 `null`；已知是按件計數時採 `EA`，其餘單位依可確認的 CAD 值或工程師輸入保存。料號選擇走現有同公司、可讀、有效的料號查詢。 |
| 工作 `GET /{id}/download` · 審核／歷史下載 | 工作版從該工作與已收件包取檔；審核版使用 `/api/pdm/review-requests/{requestId}/assembly-package/download` 讀凍結記錄；歷史版使用既有圖號歷史路徑下 `…/{revisionId}/assembly-package/download` 讀該版生效記錄。下載直接回 attachment bytes，一次點擊即可。 |
| 審核／歷史 `GET …/assembly-package/bom?configuration=…` | 沿各下載路由的父資源讀回對應凍結來源中的指定組態草稿。審核退回時可在工作頁更正；既有審核記錄與歷史頁維持唯讀。 |

工作修改採現有 `numbering.workspace.update`、drawing 範圍與編輯資格，讀摘要沿工作、審核或歷史的現有授權。提供原始 ZIP 的入口和裝置取檔都另外核對原生 3D 所需的 `drawing`、`model` 查看及下載能力。BOM 顯示的 PDM 料號明細依讀取者目前料號權限投影。審核須以既有共享／指派規則驗證。新 browser route 依現行 Principal route map 分類，裝置 route 依既有 device guard 分類。未登入 401，無權限 403，隱藏跨範圍資源的存在，狀態／排程衝突 409，超限 413，無效 ZIP 422。重用現有通知元件，提示指向補包、選擇或等待。 [Principal 資源權限](../../src/lib/principal-resource-capability.ts) · [裝置原檔授權參考](../../src/lib/principal-recognition-capability.ts)

### 7.4 持久狀態與競態

以 `ai_pdm_core` 新增 forward-only migration。使用下一個可用正式 migration 編號。三張表以公司與 owning 工作／版次／review 綁定，外鍵讀取與領取佇列索引隨 migration 一併建立。Runtime 只持有本功能所需 DML，沿現行 PostgreSQL 隔離環境驗收。舊 BOM 資料模型依 [退役決策](../decisions/ADR-PDM-BOM-RETIREMENT-001-hard-delete-and-rebuild-boundary.md) 處理。

| 表／資料 | 唯一性與必要欄位 |
| --- | --- |
| `drawing_assembly_packages` | 保存 `id, company_id, work_id, revision_id, initiator_principal_id`、上傳 idempotency key 與 request hash、物件精確位置及 generation、SHA-256、byte size、版本化 manifest、主組立 key、交付組態與 `selection_version`、收件狀態及有效／替代時間。每個工作最多一筆有效來源及一筆上傳中來源，可用 partial unique index。受控檔案 binding 狀態由目前 package 與其工作檔案列共同判定。 |
| `drawing_assembly_analysis` | 以 `(company_id, package_id, selection_version)` 唯一。一筆涵蓋所選組態，可先回主件／組態候選。保存 `status, lease owner/token/version/expiry, attempts`、版本化幾何參照結果及 BOM 投影、內容 digest。每個組態的人工修正和 `draftVersion` 分開於原始解析結果，更新同列時以 `draftVersion` 比對。候選已選定後建立對應同包新版本，不刪舊結果。背景結果與人工修改以不同欄位更新。 |
| `drawing_assembly_review_snapshots` | 以 `(company_id, review_request_id)` 唯一。保存 `work_id, revision_id, package_id, primary_binding_id, primary_asset_id, selection_version, package hash/generation, mainEntryKey, delivered configurations, reference result digest, review snapshot hash`，以及這些交付組態在送審當時的唯讀 BOM 草稿投影。每個版次最多一筆生效記錄，既有核准交易確認後標示生效。歷史查詢直接選該版次生效記錄。 |

流程為 `uploading → accepted → queued → running → complete / needs_input / blocked`。上傳失敗或到期留在未收件結果；已收件的 ZIP 遇解析問題仍可下載。更新工作與送審涉及共用資料時，使用既有工作列鎖，再鎖組立包／解析列。`selectionVersion` 只因來源選擇變更而變，普通圖號欄位修改不觸發重跑；BOM 修改有自己的版本。領取與回收使用 DEV-125 既有租約規則，對 `company_id, initiator_principal_id, status` 查可領工作，以現行 lease compare-and-set 或同等短交易避免重複領取。任何回寫前檢查同工作仍可寫、package 仍有效、選擇版本和租約一致。完成時用同工作、來源與結果 digest 支援安全重送，結果不明先 readback。

### 7.5 原生解析與 BOM 投影

1. 新工作類型沿同一 Windows 排程器接上 `POST /api/assembly-analysis-jobs/claim`，以及 `/{jobId}/content`、`/heartbeat`、`/complete`，共用現有 Windows 工作讀回與工作專用 Document Manager key broker。領取回 `jobId, leaseBasis, packageId, archiveSha256, byteSize, selectionVersion` 及選擇資訊。Worker 以串流把 ZIP 存至工作暫存，驗證 ZIP hash，再按已驗證 manifest 解壓。繼續使用有效的本機裝置身分、來源查看與下載權限及每次請求重驗。返回時只傳版本化結果，內容限包內 entry ID、組態、數值與相對路徑。發生能力缺口時回可定位的 diagnostics，成功回應需要對應仍有效的 lease 和來源。
2. 主件辨識可以在唯一 `.SLDASM` 時直接選取。多組立時，用可可靠確認的組立元件關係找唯一頂層，包含儲存的抑制件關係；幾何外部參照與零件反向關聯不當作父子組立。仍有並列、循環或結構無法判定則回 `needs_main` 候選。讀主件已儲存的 active configuration，取得與列舉相符才自選，無法確認回 `needs_configuration`。已有人選擇時直接重用。能在同一工作完成預設組態解析時直接回結果，避免多次下載 ZIP。增加組態時沿用已通過且輸入相同的既有結果，補做受影響組態即可。
3. 每個指定組態回傳兩個結果 `references` 與 `bom`。`references` 逐層確認需要載入的元件以及依附的外部檔，包括 BOM 已排除但依然需要開啟的輔助檔。先把參照對到 manifest 的唯一 entry，子文件只從暫存根目錄中該 entry 的絕對路徑開啟。原 CAD 的工作路徑可以用來辨識參照，禁止從該路徑取檔。缺檔、包外、歧義、原生 reader 無法可靠列舉都回診斷，未查明的參照範圍不能標為通過。`bom` 依 §3 計算，保存原始父子和參照組態、元件實例穩定路徑、CAD 編號、用量來源及行為。輸出參照／草稿各自標示成功或例外，預設合計結果上限 8 MiB。超限指出需要的組態或檔案，避免截斷後仍判定完整。
4. Server 用 manifest、組態、結果結構與租約再次驗證。以「包內來源、組態、父層及穩定 occurrence 資料」生成可重跑的 `rowKey`。先做同公司可讀的 CAD 料號及精確圖號關聯批次比對，兩者都有時必須一致。唯一才自動帶入，其餘依 §3 標例外。同一父層可合併的用量用十進位運算，無法證明同料號、來源、組態、單位時保留各列。參照結果與該組態的草稿投影由同一交易保存，未判定的草稿資料以例外呈現。補傳新 ZIP 產生新草稿，舊草稿及人工修正在舊來源可追溯；同包同主件同組態重跑時，若 `rowKey` 仍相同則保留人工修改。

### 7.6 3D 主檔與圖號送審

- Worker 結果指出主件 entry 後，由伺服器從已驗證 ZIP generation 擷取該 entry，核對 manifest hash，走既有受控檔案暫存與 canonical 重用，建立本次 upload receipt。資料庫短交易核對工作可編輯、作用中的來源、選擇版本與現有 3D 主檔，以現有寫入路徑綁定唯一主檔並更新 file snapshot。相同的單傳內容可重用；不同內容只在衝突項要求明確切換。一般單檔寫入試圖改變有效組立包的主檔時，也回到同一個衝突處理，避免兩個來源各自生效。背景 I/O 不持有工作鎖。Zip 可以下載後，主檔綁定或掃描仍可短暫等待。
- 將組立包適用與 `canSubmit` 的理由一起投影到工作頁。真正判定在現有 submit transaction，於主檔檢查後、建審核案前確認同包、同 generation／hash、同主件 binding、且所有指定交付組態的必要參照通過。上傳取代進行中、主檔不一致或結果仍待查時阻擋。BOM 草稿是否待確認、工作站是否保持在線或使用者是否看過草稿，不列為送審條件。
- 在既有送審交易建立 sidecar snapshot，使用該筆 review request ID 和既有 snapshot hash 綁定。保留目前嚴格的 review package v2 序列化。審核明細讀回 sidecar；核准同交易核對已送審來源與 freeze 並標示該版次生效。退回後圖號工作可改來源並再次送審，先前審核案讀回先前的 sidecar。送審前後的補傳、主檔切換及草稿改動不得污染已凍結的參照結果。 [審核包序列化契約](../../src/lib/pdm-review-package-contract.ts) · [圖號核准及版次寫入](../../src/lib/repositories/drawing-revision-work-async-repository.ts)

### 7.7 施工順序與驗證入口

| 順序 | RD 可直接開始的工作與出口 |
| --- | --- |
| **129-A 收件與下載** | 做 `packages` 資料、分段 provider、archive 驗證及正常頁面。使用隔離 provider 從 normal UI 上傳／下載同一 ZIP，測超過 32 MiB 的分段與斷線重送，核對大小、指紋及原始相對路徑。這部分可先做。對實際候選入口測一個接近上限的封包，記錄時間、memory 與 offset 恢復；首版上限以可重現量測支持。 |
| **129-B1 原生取證** | 在 task-owned Windows 暫存用有權使用的實際 SolidWorks 及 Document Manager 樣本，以既有 extractor/runtime 做一個原型。取證務必涵蓋預設與替代組態、subassembly 顯示／排除、虛擬件、套件內完整與故意缺巢狀檔的對照。用同組態 SolidWorks 結果核對 §6 的 01、03、09。若無法可靠讀取必要參照或核心 BOM 階層、用量，回報具體 fixture 與差異，繼續 A 與安全獨立工作，原生上線結論維持未通過。 |
| **129-B2 自動派送與草稿** | 以相同 worker HTTP 邊界完成 §6 的 02、04、05、06、07。單元測試驗證例外及用量，隔離 PostgreSQL 測租約、來源切換、重送、授權與人工修改留存。使用原有 Windows worker 測試入口覆蓋舊版相容和新能力。 |
| **129-C 主檔、送審、歷史** | 實作 §7.6，跑 §6 的 08、09、10 與舊圖號版本的正常入口回歸。使用隔離 PostgreSQL 和專案無視窗 Playwright，從版次工作到正式有效版次讀回；先前規格的 10 個案例保留為同一交付分母。 |

沿用 `windows-service/tests/worker.test.mjs`、`scripts/qc-canonical-drawing-work-upload-browser.mjs`、`src/lib/drawing-revision-work.principal.test.ts` 及歷史與審核 Principal 的現有測試入口。RD 依變更用 `npm run plan:production-slice` 選受影響範圍；涵蓋 app、worker、migration 時分別執行其聚焦驗證及適用的 `npm run typecheck:app`、`npm run build:isolated`、`npm run check:db-boundary`。測試 ZIP、解析暫存及資料庫保持任務隔離。隔離 provider 結果與 SolidWorks 實機開啟證據各自留存。正式啟用沿現行發布流程另行授權。

本機容量自查以 U-Joint 真實 CAD 加測試填充檔得到 263,201,659 bytes 的 ZIP。在隔離 local provider 依 8 MiB 分段寫入、讀回 offset、下載並逐檔驗證 worker 解壓後內容，共耗時約 4.3 秒，驗證程序峰值 RSS 約 165 MiB。這是本機儲存與串流量測；瀏覽器網路、GCS 與原生 CAD 計算時間另計。

### 7.8 頁面如何引導例外處理

工作頁從目前套件分別讀取收件、3D 主檔、必要參照及 BOM 草稿四項結果。以下用同一張表決定主要提示、可用操作及送審條件。下載沿 §7.3 檢查權限，送審沿 §7.6 檢查既有條件。

| 目前情形 | 版次頁顯示與可做的事 | 影響範圍 |
| --- | --- | --- |
| 首次收件完成，Windows 裝置尚未上線 | 顯示「可下載 · 等待 Windows 解析」。接手者可立即下載，工程師可離頁。裝置恢復後自動續跑。 | 必要參照仍待查，圖號暫待送審。 |
| 兩個可能的頂層組立，或無法讀出啟用組態 | 有兩個主件時列包內相對路徑供選一個；只有組態不明時直接列組態名稱。選完即自動續跑。 | 只詢問目前阻礙解析的一項。 |
| 缺必要子檔，或兩個同名檔都可能是所需參照 | 提示「主組立／父件 → 參照名稱」及受影響組態，提供「補正組立包」。原 ZIP 仍可下載，草稿先顯示可判定的列。 | 受影響的交付組態待補正後再送審。已建 PDM 料號也不能證明 ZIP 內有該檔。 |
| 參照完整，只有未建檔、待編號、用途或用量待確認 | 顯示「參照檢查通過」及草稿待處理筆數。展開草稿才顯示各列原因與可編輯欄位，可留待之後處理。 | 可下載；既有主檔等條件齊備即可送審。 |
| 原有 3D 主檔與包內主件內容不同 | 顯示現有主檔與包內主件名稱、路徑及可區分的內容指紋，提供「改用包內主檔」。 | 僅此衝突需確認切換。使用者也可上傳正確的包取代本次來源。 |
| 已收件、已綁主檔、所有結果明確 | 版次頁顯示「下載組立包」、主件相對路徑及 BOM 草稿入口。 | 沒有待辦。接手者無須先開 BOM 或逐檔選取。 |

同一必要檔影響多個實例時，在同一組態的例外摘要只列一次，保留可展開的父件與實例明細。新包尚在傳輸時，下載仍指向前一份已收件 ZIP，畫面顯示正在下載的檔名；新包驗證成功後才切換。新版次、審核快照與歷史下載各自沿用 §7.6 的來源。

### 7.9 RD 第一組端到端對照資料

以下為驗收樣例。RD 在隔離環境用可開啟的實際 CAD 建立同等 Pack and Go 包，測試前準備既有 2D 主檔及表中所指 PDM 對應。包內有主組立與子組立，預設交付組態叫「標準」。同一主件另存一個「維修」組態，讓其中一項只在維修組態使用。

| 「標準」組態內的輸入 | 預期 BOM 草稿與下載結果 |
| --- | --- |
| 子組立使用同一支已建檔螺絲 12 次 | 在該父件下得到一列，帶入唯一料號，數量 `12 EA`。ZIP 內只需保存被參照的那個螺絲檔。 |
| 一個有 CAD 料號、PDM 尚無紀錄的支架 | 保留原料號、父件與採用的用量，標「待建檔」。下載含支架檔。 |
| 一個無編號、仍需載入、CAD 已明確排除 BOM 的定位體 | 定位體列入參照檢查與排除清單，材料用量不計入。下載含定位體檔。 |
| 一個無編號、用途不明的內嵌虛擬件 | 從父組立找得到該實例，無須外傳獨立零件檔。草稿提示確認用途；工程師指定為實際用料後顯示「待編號」。 |

用同一樣例跑三次具結果差異的操作，併入 §6 原有案例。第一次上傳完整 ZIP，確認工程師可離頁、草稿自動產生，接手人只按一次下載，在無原始檔路徑可用的環境開啟、重建。第二次提供刻意少了定位體的 ZIP，預期能下載且能看已確定的 BOM 列，圖號送審指出缺定位體。第三次補回定位體，僅讓「維修」專用檔缺失；只交付「標準」可送審，若送審前另選「維修」則須指出該組態缺件。測試各自從可編輯的版次工作起跑，保留同組態原生 BOM 對照與 ZIP 指紋。

RD 可直接決定元件命名、查詢批次及快取方式。若原生能力實測顯示必須新增工作站軟體或授權費用、要求工程師額外輸入檔案，或必須改變交付組態的送審條件，再帶具體樣例與使用者影響回來選方案。其餘可獨立施工的項目照常進行。

### 7.10 儲存與解析器交接格式

| 邊界 | 呼叫端可依賴的輸入與結果 |
| --- | --- |
| ZIP 儲存 | 建立上傳取得伺服器端 session。寫入接受 session、起始 offset、總長及一段 bytes，回已確認的下一個 offset。寫入結果不明先查 session；已完成則讀回同一物件的精確版本及長度。已收件物件提供按版本「讀指定 byte 範圍」及「串流整包」兩個操作。local 與 GCS 使用相同語意。 |
| 包內檔案 | Manifest 每個檔案至少含 `entryKey, relativePath, byteSize, sha256`。API 與 worker 以 entryKey 指同一個檔案；畫面使用 relativePath。綁定主檔時由 server 對已收件版本擷取並核對該 entry。 |
| Worker 回報 | 所有結果攜帶 `schemaVersion, parserVersion, packageId, archiveSha256, selectionVersion`，租約沿 §7.5 傳送。選主件回候選 entry keys；選組態回已選主件與候選組態名稱。已解析則回主件、已讀組態及各組態的 `references` 與 `bom`。無法讀取時回具體階段與原因。 |
| 單一組態 | `references.status` 為 `passed / blocked / unknown`。診斷至少指出組態、父件、所需參照、原因，能唯一定位時附 entryKey。BOM 原始列含父件、實例識別、來源 entry 或內嵌件的所屬組立與內部識別、子件組態、CAD 原編號、排除／展開設定、可確認的用量與單位。缺值保留原因。 |
| Server 投影 | 先對照有效來源與 manifest，再產生穩定 rowKey、可見的 PDM 配對及例外。裝置回傳的實例與 CAD 值可作依據；PDM 料號關聯及人工欄位由伺服器保存。相同租約重送相同結果可讀回既有回執；相同來源已有不同結果時回衝突，由工作讀回查明。 |

### 7.11 2026-11-19 shared daily 人工試用接線

- 使用者要求：controller 的 1020 保留 main；1021 使用 `codex/dev129-assembly-package`，待 A0054.zip 人工確認後才合併，禁止正式部署。
- Platform 本機 override：`.dev-local-pdm-standalone.local.json` 指向 `AI_PDM/.worktrees/dev129`。本機 launcher `.tmp/dev129-daily-launch.mjs` 啟動 Web 與專用 worker，均由 controller 程序樹管理。試用期間保留；試用結束時移除 override 並經 controller reload 恢復原始來源，不刪測試資料。
- 沿用 `jenfu_local_shared_daily`／51870 及其隔離 data/repository；兩埠共用測試資料，不是兩份獨立資料庫。已透過 migration 109 原檔安裝向前相容資料表並記錄 checksum ledger，DB boundary 通過。沒有修改正式 schema／資料。
- 沿用 main 工作區既有 shared daily 雙埠 cookie 與測試管理員支援，僅將相關實作帶到 candidate，保留 main 其他未提交修改。Document Manager 採既有明確啟用的 environment fallback，變更識別 `DEV-129-local-1021-trial`；金鑰由已授權讀取模組載入記憶體，不進 source、log 或文件。修正 readiness 與既有 credential resolver 對此設定的判定不一致，相關測試 47 passed。
- 已驗證 controller 分工作樹、路徑限制及原生命週期測試，候選登入支援 5 passed。無視窗 Edge 通過兩埠同時 SSO（各 `/api/auth/me` 200）、A0054 編輯入口、正常 device enrollment 與 worker 組立 claim HTTP 200。`A0054-M01` 既有工作 `e70cbc91-63f3-47cb-a0d1-56cc84c04618` 保留未上傳，讓使用者親自走上傳、BOM、下載。
- 試用入口：`http://localhost:1021/numbering/drawings?query=A0054`；先經 `http://localhost:1000/login` 使用測試超級管理員，再進明細按「編輯」。本次接線驗證不宣稱人工流程已驗收；未合併、未部署。

#### 同日上傳後的本機背景授權修正

- 使用者實際上傳 A0054.zip 後停在等待解析。工作重新驗權要求 dynamic role-policy publication，但 shared daily 使用既有 static catalog，造成 claim HTTP 503；原先空佇列 HTTP 200 並未覆蓋實際有工作的路徑。
- 背景驗權沿用已明確啟用的 shared daily 測試管理員例外：先驗現行 Principal、帳號生命週期、auth epoch 與有效 grant，再驗本機環境／marker／資料指紋及 system-admin 的 66 個操作，依既有 registry 的 legacy bindings 確認查看／下載權限。其他帳號與正式環境維持原有行為。
- 修正過程一次權限對應不完整使尚未執行的工作轉 blocked；修正後用 task-owned `.tmp/dev129-resume-upload.mjs` 核對 51870、當代 fixture 指紋、精確 package/work/principal、原 ZIP SHA256、attempts=0 且無結果，僅將這筆工作接回 queued。沒有重傳、改寫 ZIP 或 BOM。
- 原有 Windows worker 完成解析，組態「預設」、參照檢查 passed、自動綁定 A0054.SLDASM，BOM 草稿 4 列／4 列待處理（3 列未提供編號、1 列 CAD 料號 TBD 未配對）。測試 22 passed，typecheck 通過。人工試用仍待使用者確認；未合併、未部署。

#### 同日既有圖料號自動配對補正

- 使用者指出既有 PDM 圖料號應自動帶入。確認 A0030.SLDPRT、A0033.SLDPRT 缺 CAD 編號，但本機已有唯一對應料號；原實作未使用檔名根號，且背景投影未沿用 shared daily 明確啟用的管理員查料權限。
- 補上 manifest 精確檔名／根號查詢與既有測試管理員的已發布操作對應；CAD 明確編號優先，同公司、有效料號、唯一候選才自動配對；多料號保持 conflict，無讀取權限不查料。內嵌虛擬件不以外部檔名猜測。
- 用原 raw_result_json 更新這筆仍可編輯、沒有人工 overrides 的本機草稿，先驗精確 package／ZIP hash 及當前工作權限，保留原始解析、ZIP、lease receipt、人工更正，遞增 draft_version。未重傳或重跑 CAD。
- 更新後：A0030-P01 × 1、A0033-P01 × 2 已配對；DEV-129 測試零件 CAD 料號 TBD 待建檔／人工更正，共 3 列、1 列待處理。配對與背景授權相關測試 27 passed，仍待使用者確認，不合併、不正式部署。

#### 同日輔助繪圖的 UI 操作與實際設定

- 使用者指定 TBD 測試零件為輔助繪圖，排除 BOM 但下載保留。每列直接提供「BOM 用途」選單：實際用料（已有料號時顯示已配對）、實際用料（待編號）、輔助繪圖（排除 BOM，保留檔案）；選擇後沿用草稿版本與既有 PATCH 自動儲存，失敗就地提示。更正按鈕保留料號查找、用量與單位操作，不重複顯示用途控制。
- 已以無視窗 Edge 在 1021 的真實 UI 將該列設為 excluded；重新載入後讀回相同設定，A0030-P01 × 1、A0033-P01 × 2 保持 matched，顯示 3 列／0 列待處理。排除列仍顯示於草稿供後續調整，其原始用量留存但不計入 BOM 用料。
- 同一次 UI 按下載組立包：1,392,774 bytes，SHA256 仍為 `62b8f573b4370717f5e75f688f091ea7141302292e11d6b6d851ec913b9f55a8`，與原 ZIP 相同，證明不因 BOM 排除移除子檔。檢視 1280／636 寬度畫面，636 無水平溢出；typecheck 通過。本機試用持續保留，未合併、未正式部署。

#### 同日依使用者要求復原取消的 A0054-M01 工作

- 使用者按「取消本次工作」後要求復原。取消服務移除 work／claim／branch／清單狀態及主檔 binding，將原 0.1 revision 設 cancelled；組立包、原始解析、BOM 草稿與 excluded override 均保留。
- task-owned `.tmp/dev129-restore-cancel.mjs` 在 51870 的 shared daily fixture 指紋、精確 drawing/work/package/hash 及無新活動工作的前提下，以 serializable transaction 復原。操作前保存 `.tmp/dev129-daily/cancel-recovery-before.json`。過程先後因不可變組立包身分與 audit scope 契約被拒，兩次均完整 rollback；修正方案遵守原觸發器，沒有停用保護或變更 schema。
- 保留 cancelled revision `73aac528-dc77-40f0-a445-b37f3ae17231` 及原包的歷史身分，建立同圖號／顯示版次 0.1 的 preparing revision `880866e4-a5d7-498f-a8f7-799bc079090d`，復用原 work ID、清單 row ID，恢復主檔及快照。新活動包 `ccd849fd-96a0-4214-9739-90340bcc9386` 引用相同 immutable ZIP bytes，沿用原始解析與 draft version 4／人工排除；舊包標 superseded。沒有重傳或重跑解析。
- 交易已 commit，新增 `drawing.local_cancel_recovery` 的 tenant audit，記錄舊／新 revision、package 與原分析來源；只修復本機該筆工作，不變更正式環境。
- 無視窗 Edge 實測：清單重新出現 A0054-M01，工作頁顯示主檔與 BOM 3 列／0 待處理，TBD 用途維持 excluded；按下載取得 1,392,774 bytes 且 SHA256 與原 ZIP 相同。此為本機復原自查，不代表使用者已驗收。

#### 同日檔名顯示與本機 3D 預覽補正

- BOM 顯示標籤遇 CAD 占位編號 TBD／TBC／N/A／NA／未定／待定，優先顯示來源檔名；已關聯 PDM 料號仍優先。原 CAD 值、配對結果與 excluded override 不改寫。1021 頁面確認顯示 `DEV-129組立圖測試用零件.SLDPRT`。
- 使用者回報 A0054 主檔已存在但預覽尚未建立。先前本機專用 worker staging 僅包含組立分析器，缺 PreviewExporter；復原工作建立新主檔 asset 時，也未補建預覽 job。一般上傳入口既有 `ensureAutomaticPreviewJobsForSourceAssetsAsync` 呼叫仍在。
- 依既有 Windows installer 的相同 csc 編譯參數，從本分支原始碼補齊本機 `.tmp/dev129-daily/install/extractors` 的 PreviewExporter 與 CredentialProbe。透過 `.tmp/dev129-prepare-preview.mts` 核對 51870／精確活動組立包／原 ZIP hash／現行 Principal 工作權限，再呼叫既有排程函式，建立 job `d187b8b7-47c8-4e1a-86e5-e0c304186bd8`；沒有重新上傳 ZIP 或變更 BOM。
- 由真實 Windows worker 執行，job succeeded、error_code/error_summary 均 null。冷編譯期間一筆 heartbeat 40001 暫時衝突，後續 heartbeat 及 complete 成功。首輪 UI 檢查因反覆 reload 中斷非同步載圖且錯誤假設圖片 src 為 API URL 而失敗；修正為等待頁面實際 blob 圖片載入後，無視窗 Edge 確認 A0054.SLDASM 圖片 640×480、naturalWidth>0，並檢視截圖確實顯示組立預覽。證據 `.tmp/dev129-daily/a0054-preview-ready.png`。未合併、未正式部署。

#### 審核中的工作台預覽連結修正

- 使用者要求修好進入審核後的 2D／3D 預覽，先本機驗證。A0054 現有 pending review `ff1f741f-51f8-428e-a393-98790a09c2cf`、檔案與 BOM 不進行業務寫入。
- 根因：工作台版次連結沿用列上的 reviewRequestId，組成 `context=candidate_revision&reviewRequestId=...`；檔案 API 明確只接受 review_package 攜帶該參數，因此在讀檔前回 503 READ_ACCESS_REQUIRED。不是缺少預覽 bytes。
- 在共用 `pdmFileReadHref` 僅於 review_package 序列化 reviewRequestId，其他上下文保留原 context/contextId/bindingId。涵蓋工作台 2D、3D、代表預覽、檔案下載與料號附件；真正審核包連結仍攜帶原 request ID，API、Principal、指派與快照檢查均沿用。
- 本機分支 `codex/fix-review-preview-context`，1021 直接載入此分支，1020 隔離 main 工作樹複製這個修正檔供驗證。相關單元／預覽與權限拒絕案例共 74 passed，typecheck 通過；1020 真實登入 API 已讀回 3D image/png 200、2D application/pdf 200。
- UI 驗證期間本機 callback 回 local_sandbox_unavailable，臨時只記固定代碼診斷，並將本機請求等待從預設 5 秒調整為協定允許的 15 秒完成新登入；驗證後移除臨時診斷與等待調整，不改權限或憑證。另發現 1020 新工作樹未準備 PDF.js 靜態 worker（404），使用既有 `prepare-dev-082-ocr-assets.mjs` 補齊兩個本機工作樹 public/generated 資源。這些失敗保留為本機驗證前提，未記為預覽成功。
- 最終無視窗 Edge 在 1020 同一 pending-review A0054 工作台詳情：3D 圖片完成渲染 640×480；2D PDF 畫布 `data-pdf-render-state=ready`、1 頁；兩個媒體請求均 200。截圖 `.tmp/dev129-daily/1020-preview-diagnostic.png`。沒有重送或修改審核、BOM、ZIP；僅本機修正，未部署正式環境。
