# DEV-125：Windows SolidWorks 解析服務與 OpenSWX 退役

狀態：`RELEASED_R25 / USER-OWNED WINDOWS DEVICE ARCHITECTURE FINAL / FORMAL_ACCEPTANCE_IN_PROGRESS / 125-C_OPENSWX_EXIT_COMPLETE`。本文件是 DEV-122／124 移交後唯一後續開發入口；§3～9 為現行 RD 實作、資料、API、發布與驗證契約，§11.6 是最新發布證據，較早紀錄只供追溯。OpenSWX 修復、排程與 provider 資源已退出；Windows 自助連結、生命週期與正式原生結果仍須完成驗收，不能因發布成功直接結案。

> **2026-10-28 取代聲明：**本次使用者定案完整取代 PR #533 草案的匿名 worker、固定 `windows-parser` 身分、共用 API key、任何可連線 caller 可下載 CAD／取得 Document Manager key／claim／complete，以及「使用者已接受匿名風險」等敘述。使用者從未授權匿名開放。所有 Windows 解析請求必須來自公司 Google SSO 自助連結後建立的單機、單一 Principal、可撤銷裝置身分；無此身分一律拒絕。PR #533 未完成 merge 不得成為實作或發布來源。

決策來源：2026-10-27 使用者確認直接提供電腦清單、OpenSWX 完整拆除、不雙系統並行；PR #496～#509 完成架構、Windows 裝置／worker source、OpenSWX active source 退役、fixed readback 與受保護發布續接。正式 owner run `40473862392` 已將 exact source `606c5aff0af85c88749f571018a5204417d521b8` 發布並切換 100% traffic；其後完成 OpenSWX DB 排空、provider 資源刪除及 readback。PR #525 合併已刪 provider declarations，PR #526 合併退役 source／diagnostic executors 移除。PR #529～#531 已完成 Windows 安裝修正、same-source installer 發布綁定、artifact 權限隔離及既有 v1 infra receipt 相容修正；現行已發布 source 為 `ef8a7b9ebddc8e820e44874e34cf17c52a670d33`。後續結果須以各切片 exact source／CI／發布讀回為準。

最新發布來源的 main CI run `40523534853` 已對 exact main `ef8a7b9ebddc8e820e44874e34cf17c52a670d33` 完成 `DEV-012 Isolated PostgreSQL Cutover`與 `Production Slice QC`，兩者均 `SUCCESS`；這是 source／build／contract 證據，不代替下列 Windows 實機驗收。

## 1. 要交付的結果

AI-PDM 網頁與資料管理維持雲端；每位有效 AI-PDM 使用者可在自己的 Windows 電腦安裝同一套「AI-PDM Windows 解析服務」。每台電腦以公司 Google SSO 自助連結到當下使用者的 company、Principal 與 active account，再只領取該使用者目前可查閱／下載來源的工作，使用官方 SolidWorks Document Manager 讀取原生屬性及可取得的已儲存預覽，回傳與原檔版本綁定的結果。不設公司共用或要求不關機的解析主機。

產品只維持這一條原生 CAD 解析路徑。OpenSWX 輔助屬性功能、worker、派送及日常發布依賴全部退役；不保留 provider 選單、雙讀比對或自動回退至 OpenSWX。Windows 尚未上線時顯示等待／未設定，不用 OpenSWX 暫代成功。

## 2. 舊任務如何結束

| 任務 | 任務處置 | 保留的事實與責任 |
|---|---|---|
| DEV-122 | `CLOSED_PARTIAL_HANDOFF`：舊缺陷整治階段結案 | 01～04、06 的既有本機成果封存；正式整組未驗不改為 PASS。05 及管理員辨識、完整原生 CAD 的剩餘結果移至本任務。原七個 issue 與 29 診斷 ID 保留對照。 |
| DEV-124 | `CLOSED_CANCELLED_REPLACED`：取消 OpenSWX 修復 | 不再排修復、重建或恢復 Scheduler。移交時的 readback 失敗／active row UNKNOWN 作為歷史保留；其後已由本任務完成 DB 排空、provider 資源與 active source 退出，不重開 124-A／B／C。 |
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

## 3. 架構定案與使用流程

固定為 `AI-PDM 網頁／API／既有佇列 → HTTPS 輪詢 → Windows 服務 → Document Manager → 原佇列 complete`。雲端不載入 COM，電腦不開 inbound port；只有一套原生 CAD 引擎。沒有 OpenSWX、Shell thumbnail handler、eDrawings 或完整 SolidWorks 自動回退。舊 Shell 實測只保留歷史證據，不是第一版交付路徑。

網頁入口固定 `/settings/windows-service`（系統設定 → Windows 解析服務）。頁面只有「下載安裝程式」「連結這台電腦」及清單；不得出現「註冊 ID」「單次註冊碼」或貼碼欄位。一般有效使用者只看自己的裝置，PDM 管理員可看全公司並於異常時撤銷；欄位為電腦名稱、版本、連線狀態、可處理項目、最後連線、解除連結。連線與能力分開；不蒐集活動、硬體清單或遠端桌面。解除連結永久撤銷該筆憑證，恢復使用須重新連結，不復活舊 token。

固定操作為：`AI-PDM 下載安裝程式 → 執行安裝／UAC → 安裝工具自動開啟系統瀏覽器 → 公司 Google SSO → 使用者按一次「連結這台電腦」→ 瀏覽器以 loopback callback 將短效交換資料交回本機工具 → 系統自動完成`。RD、採購／生管、生產人員及其他有效 AI-PDM 使用者均可自助連結自己的電腦，不需 PDM 管理員逐台核准；管理員只處理異常撤銷。網頁不能靜默繞過 UAC。連結後背景服務開機啟動，日常不需保持網頁開啟。沒有任何使用者裝置在線時，工作維持 `queued`，不增加業務 attempt；裝置重新上線後自動接續。

| 決策 | 第一版固定實作 |
|---|---|
| 安裝形式 | NSIS 3 Unicode 的 `AI-PDM-Windows-Setup-<version>.exe`；不另做 MSI。打包既有 Node 24 LTS 執行碼、WinSW 2.12.0 與預編譯 x64 C# extractor，使用 .NET Framework 4.8；第一版在 Windows 11 x64 驗證。使用者端不安裝 Node、編譯器或完整 SolidWorks。 |
| 服務帳號／檔案 | WinSW 服務 `AipdmWindowsParsing` 使用 LocalService，啟用 service SID；程式在 `%ProgramFiles%\AI-PDM Windows Service`，credential／暫存在 `%ProgramData%\AI-PDM Windows Service`，ACL 僅該 service SID、SYSTEM、Administrators。安裝／解除安裝才需管理員；解析不以 LocalSystem 或人員帳號執行。 |
| 原生元件 | 官方 Document Manager x64 COM runtime；extractor 從已註冊 native COM server 的同目錄載入官方 `SolidWorks.Interop.swdocumentmgr.dll`，驗證 assembly 名稱與 SolidWorks public-key token，再用明確 COM interface 呼叫。SolidWorks runtime／managed interop 都不放入公開原始碼或安裝包。安裝時驗證 native runtime 與官方 interop，將兩者版本、來源檔名及 SHA-256 寫入本機 runtime receipt。使用公司合法取得、與 key／目標檔版本相容的元件；相容者重用，不複製、覆蓋或解除註冊他人路徑。不相容則安裝失敗並說明。 |
| 引擎能力 | 屬性讀取沿 DEV-035 document／configuration scope；PRT／ASM 取 active configuration 的已儲存 PNG，SLDDRW 取第一張 sheet 的已儲存 PNG，無 sheet 圖才查文件內已儲存預覽。全部經同一 Document Manager extractor，不合成假圖。不提供模型重建、互動 3D、任意解析度或 CAD 轉 PDF。 |
| 套件／更新 | 每次產物固定 app source SHA、版本、protocolVersion=1、檔案 hashes、依賴版本與 notices。Windows CI 產出安裝包，既有 app build 依同 source 與 hash 收入 image 的 `worker-downloads/`，下載 API 只讀該唯讀目錄的 manifest；不新增 runtime 儲存桶讀權、GitHub token 或任意 URL 下載。第一版人工下載新版覆蓋安裝、保留本機身分；無自動更新平台。預設不採購簽章、不宣稱 SmartScreen 信任。 |

工具依據：[NSIS 官方介紹](https://nsis.sourceforge.io/Docs/Chapter1.html)、[WinSW 官方版本](https://github.com/winsw/winsw/releases/tag/v2.12.0)、[Document Manager 官方 Getting Started](https://help.solidworks.com/2026/english/api/swdocmgrapi/GettingStarted-swdocmgrapi.html)、[configuration PNG API](https://help.solidworks.com/2026/English/api/swdocmgrapi/SolidWorks.Interop.swdocumentmgr~SolidWorks.Interop.swdocumentmgr.ISwDMConfiguration9_members.html)。公司 key 的合法使用與元件相容是打包／原生驗收的前置條件；本文件不宣稱已取得多裝置授權或新版本 key。

## 4. 資料與身分契約

已發布的 migration 089 保持 immutable；它建立裝置、短效 enrollment 與 completion readback。新增 forward-only migration 090，在 `windows_service_devices` 加入不可變、不可為空的 `owner_principal_id`，以 089 的 `registered_by` 回填既有列，建立 `(company_id, owner_principal_id)` 外鍵、owner/status 索引與禁止改綁 trigger。短效 enrollment 仍是系統內部交換資料，不是人類輸入的註冊碼產品流程。不建通用 fleet、第二套 queue 或新的跨應用 contract；company 永遠由已驗證登入／裝置身分決定，不能接受 request 自選。

| 表 | 必要欄位與限制 |
|---|---|
| `windows_service_devices` | 保留 089 欄位；090 新增 `owner_principal_id text NOT NULL`，以 `(company_id,owner_principal_id)` 參照 active-account authority 所在的 app-owned Principal account，並禁止 UPDATE 改綁。`credential_hash` 只存 SHA-256；每台電腦一個獨立 token，可單獨撤銷。`registered_by` 保留建立歷史，不代替永久 owner。 |
| `windows_service_enrollments` | 保留 089 的短效、單次、hash-only 交換欄位；由已登入頁面與 loopback callback 自動使用。原碼不得呈現在人工輸入欄位、localStorage、server log 或 evidence；不建立 Secret Manager version。 |

`preview_jobs`、`drawing_recognition_sessions`、`settings_secret_probe_jobs` 各加 nullable `worker_completion_json jsonb`，只存最後一次已接受完成的 `{workerId,leaseBasis,resultDigest,terminalStatus,committedAt}`；與原結果在同一 owner transaction 寫入，原有歷史 NULL 不回填。resultDigest 是 canonical complete payload 的 SHA-256；retry 新 attempt 時清除舊 completion，原事件歷史仍保留。這是 ACK 遺失的唯讀確認依據，不是第二份業務結果或新 receipt 服務。

新增表不回填假裝置，不修改既有人員／角色／圖料。註冊、撤銷沿既有 audit 記錄 actor、device ID、前後狀態及結果；不稽核每次 heartbeat，不記 code、token、key 或檔案內容。Enrollment／device 保留供稽核，第一版不另建自動清理工作。沿既有 runtime role 只授予必要 SELECT／INSERT／UPDATE，無 DELETE／DDL；所有存取經 company-scoped repository，無匿名 SQL 或新跨應用 view。SQLite 隔離模式需同義 schema／transaction，正式授權並行測試以 PostgreSQL 為準。

**憑證生命週期：**安裝工具先建立 loopback listener、不可猜 state、UUID device ID 與 32 bytes 隨機 bearer token，開啟 AI-PDM 連結頁。Google SSO 後由頁面建立十分鐘、單次、hash-only enrollment，使用者只按一次「連結這台電腦」，頁面將短效交換資料送到 `127.0.0.1`；本機工具完成交換後才以 DPAPI LocalMachine 與 service SID ACL 保存裝置 token，服務端只存 hash。消耗 enrollment 與新增 device 在同一 transaction，並把當下 company／Principal 永久寫入 owner。相同 enrollment＋device ID＋credential hash 的未知結果重送只回原結果；換內容 409，過期 410，已撤銷裝置不可復活。電腦名稱只是顯示資訊，不是授權依據。

**人員權限：**下載、建立自己的短效連結、查看／解除自己的裝置，對所有具現行 AI-PDM 有效 grant 的 active Principal 開放，不要求 PDM 管理員資格。具 `settings.secret.manage` 的直接全域 PDM 管理員另可列出並緊急撤銷全公司裝置，但不參與日常安裝核准。不新增 MFA、角色 action 或 OrgMaster writer；OrgMaster 仍只負責人員角色指派。

**服務權限：**裝置 actor 固定為 `companyId + ownerPrincipalId + deviceId + instanceId`。每次 `claim`、source download、heartbeat、key/probe access、complete 及 completion readback 都從 DB 重新驗證：裝置 active、永久 owner 相符、Principal account active、OrgMaster current active mapping 唯一、至少一項現行已發布 AI-PDM grant，並對該工作來源重新判斷 owner 的查閱／下載或必要 action。禁止匿名 worker、固定 `windows-parser` 身分、共用 API key、環境 token fallback，亦禁止把「可連線」當成 CAD／key／工作權限。Document Manager key 只在通過上述檢查且持有當前 probe／工作租約的受控程序記憶體內短暫使用；不回 UI、不寫磁碟、不進 payload／log／evidence。帳號停用、角色撤銷、Principal mapping 失效或裝置解除連結後，下一次請求立即拒絕。

## 5. API、狀態與失敗處理

新增 route 均登錄現行 Principal route map／workload disposition；不能用 middleware 全域放行。人員 API 沿用既有回應／錯誤 wrapper，以下 body 是新增欄位；服務回應一律 `private, no-store`，最大註冊 JSON 2 KiB。API 不回傳磁碟絕對路徑、服務 token 或資料庫細節。

| Method／path | 請求與結果／權限 |
|---|---|
| `GET /api/settings/windows-service/devices` | 任一 active AI-PDM Principal 可讀自己的裝置；PDM 管理員可讀全公司。回 `{devices:[{id,name,serviceVersion,status,connection,capabilities,lastSeenAt,rowVersion,ownedByCurrentUser}],canManageAll}`。connection 依 DB 時鐘與近期 heartbeat；清單不授予工作或來源存取。 |
| `GET /api/settings/windows-service/installer` | 任一 active AI-PDM Principal；回 same-source 受控安裝 bytes，固定檔名／版本／SHA-256，缺產物 503 `INSTALLER_UNAVAILABLE`；不接受 filename／URL／object key 參數。 |
| `POST /api/settings/windows-service/enrollments` | 任一 active AI-PDM Principal；由連結頁自動送 `{requestId,codeHash}`，相同 request/body 重送 200，body 不同 409。原 code 不呈現在 UI；此 route 不是管理員核准。 |
| `POST /api/settings/windows-service/devices/{id}/revoke` | owner 可解除自己的裝置；PDM 管理員可緊急撤銷同公司的任一裝置。row lock 下重驗 current account／grant／owner 或管理權限；已 revoked 重送 200、版本不符 409、非 owner 且非管理員 403，無 DELETE API。 |
| `POST /api/windows-service/enroll` | 只交換瀏覽器已建立的短效 enrollment 與本機產生的裝置 public hash；無效／過期／已消耗拒絕且有 rate limit。成功列永久綁定 `company_id + owner_principal_id`。它不授予工作權限；後續每個 workload request 仍須完整重驗。 |
| `GET /api/windows-service/self`、`POST /api/windows-service/start` | 這兩個 bootstrap API 只驗 active device bearer，不要求已啟動 instance；self 回自己的狀態／rowVersion，及該裝置的 `activeJob:{kind,id,leaseBasis}\|null` 供 claim ACK 遺失讀回，不 enqueue／recover。start `{instanceId,expectedRowVersion,serviceVersion,protocolVersion:1}` 原子設定啟動實例，回 rowVersion。同 instance 重送 200；版本衝突或另一 instance 30 秒內仍在線則 409，重啟者等離線後讀新版本再啟動，不盲目覆蓋。程序用本機 singleton mutex；每次真正啟動產生新 instanceId，跨重啟舊租約失效。其餘 API 全部要求 current instance。 |
| `POST /api/windows-service/heartbeat` | current-instance bearer 與 `x-pdm-worker-id=<deviceId>:<instanceId>`，每 10 秒更新裝置 lastSeenAt；沿用既有 capability heartbeat 的 code／version／fingerprint 欄位，不由 client 自訂授權用途。 |
| `GET /api/windows-service/jobs/{kind}/{id}/status` | current-instance bearer；kind 固定 preview／recognition／probe。只回同公司、目前租約或 completion.workerId 屬該 instance 的 `{status,leaseBasis,completion:{resultDigest,terminalStatus,committedAt}|null}`；其他身分／工作 404，無來源內容，不 enqueue／recover／更新 attempt。供 complete ACK 遺失讀回，最多三次；digest 與本次不同則衝突，不自動補送。 |
| 既有 worker API | 保留 `/api/preview-jobs/**`、`/api/preview-workers/**`、`/api/recognition-jobs/**`、`/api/recognition-workers/heartbeat`、`/api/settings-secret-probe-jobs/**`；每個 claim／source／heartbeat／complete 均取得 owner-bound device actor 並重驗 current account／Principal mapping／grant／resource permission。不得留下 native 靜態 token、匿名、固定身分或共享 key fallback。 |

新服務 protocol 不支援、缺必要 fence → 426 `WORKER_PROTOCOL_UNSUPPORTED`；無效／已撤銷 bearer，或 owner account／Principal／grant／resource permission 已失效 → 403 `WORKER_DEVICE_UNAUTHORIZED`；DB 不可用 → 503，不 fallback 至 env。未有 ready 電腦不消耗業務 attempt；`queued` 工作不因等待逾時而失敗或遞增 attempt，只有已被領取的 `running/extracting` 租約逾期才依既有上限回收。單次 poll 無工作沿各既有 claim 的 200-null／204 契約。省略／不匹配租約 → 409 `WORKER_LEASE_STALE`，來源變更沿現有 stale-source 錯誤。

安裝後未註冊只顯示「未註冊」且不輪詢工作；註冊後 online／offline 與 ready／blocked 分開。服務遇 403 停止工作並清除自有暫存；網路／503 使用 2、5、15、30 秒上限退避。一次請求最多重送三次，之後回等待狀態而非快速空轉；只有 heartbeat、具同一 idempotency 身分的 enroll/start 才可直接重送。claim 回應遺失先 self 讀回 activeJob 接續該租約，確認無有效租約才再 claim；complete 回應遺失先讀該工作的 owner／終態與 digest，確認已成功才回報成功；無法確認標為 unconfirmed，不能重新上傳或重寫業務結果。

## 6. 既有工作整合與來源安全

每台服務只有一個排程器、同時一個 CAD 子程序；有 pending key probe 時優先一次，preview／recognition 輪替，無工作時每 5 秒 poll。每個子程序唯讀開啟原檔，使用工作專用暫存路徑，禁止任意 shell command／外部路徑／URL；來源上限沿現有 256 MiB、原生處理 timeout 最長 120 秒，timeout 終止自己建立的子程序並清理。正常結束／失敗／下次啟動都清理本服務的過期暫存；卸載清除自己的 credential／暫存，不碰使用者 CAD。已下載資料無法保證由雲端遠端抹除。

| 既有 owner | 必須保留與補齊 |
|---|---|
| Preview | claim 同時限定 actor.companyId 與 job metadata 的 initiator Principal；content／heartbeat／complete 每次重驗 owner 的 current resource view/download、lease 與 source hash。A 的裝置不能取得 B-only source。只有 running stale lease可回收，未領取 queued 工作保留至可處理裝置上線或業務端取消。 |
| Recognition | claim 同時限定 `drawing_recognition_sessions.initiator_principal_id = ownerPrincipalId`，source／heartbeat／complete 重驗 current authority 與 fingerprint；ownerless 歷史 native 工作不交給使用者裝置。瀏覽器 exact-session non-native baseline 保留獨立內部路徑，不是匿名 Windows worker。worker 只產生 observations，不自行 formalize。 |
| Settings probe | claim 限定 company 與 initiator Principal；claim／heartbeat／credential／complete 每次重驗 owner current `settings.secret.manage` 與 exact probe lease。key 只送進授權裝置的受控程序記憶體，不出現在 UI、API readback、DB completion 或 log。 |
| PDF／附件 | 先在固定唯讀來源查明 MIME／extension／source binding／current hash；只修被證明錯誤的 resolver／viewer。PDF 原檔走既有受保護 preview API，不送 Document Manager，不把可閱讀 PDF 改成 PNG。若需修正式 metadata，另用正常 writer 與具名資料範圍，不能在 viewer GET 偷做回填。 |

撤銷競爭固定鎖序為「device row → 既有 job／source／parent locks」。每次寫入及來源／key 讀取的授權決策，在同一 DB transaction 持有 device row share lock 並重新檢查 active／instance；claim／start／revoke 一開始即取該列排他鎖。跨三個 owner 的 claim 先查該 instance 是否已有有效租約，有則不領第二件；不靠 client 自律避免重複占用。撤銷 commit 之後不得接受新授權決策；已在撤銷之前取得授權的串流 bytes 無法回收，不宣稱中途抹除。原 parent-lock、initiator 撤權及 source-hash fence 只加嚴不取代。工作 heartbeat 沿現有 5 秒節奏／失聯回收與 attempt 上限；失聯後重領產生新 fence，舊結果零寫入。

<a id="openswx-retirement"></a>

<a id="openswx-retirement"></a>

## 7. Repository 施工對照與 OpenSWX 完整拆除

下列是原始施工定位與完成邊界；實際進度以 §11 為準。PR #498／#499 已依此完成主要 source 變更，新檔命名可作局部調整，但 owner、API 與契約不能改回雙軌。

| 範圍 | 現有定位／預定修改 |
|---|---|
| 頁面／API／DB | 新 `src/app/settings/windows-service/page.tsx`、`src/components/windows-service-settings.tsx`、§5 route families、`src/lib/windows-service-devices.ts` 與 repository；新增 migration 及隔離 schema，更新 `config/access-control/jenfu-route-permission-map.v2.json`／既有生成器與 workload disposition。 |
| 共用授權 | `src/lib/worker-service-auth.ts` 改 async DB device auth，全部 preview／recognition／probe caller await；`settings-secret-lifecycle.ts` 的 readiness 從 env 是否存在改為有效裝置／probe 能力；管理員 guard 從 `role-policy-apply-authorization.ts` 共用，不修改 OrgMaster。 |
| Worker／安裝 | 重用 `scripts/run-drawing-recognition-worker.mjs`、`run-solidworks-document-manager-metadata-extractor.mjs`、`run-solidworks-document-manager-preview-worker.mjs`、`solidworks-document-manager-preview-exporter.cs`、`scripts/lib/preview-worker-lease.mjs`；抽出同一排程器可呼叫的處理函式，新增 `windows-service/` 的 WinSW／NSIS／啟動及設定工具與固定依賴 manifest。舊 standalone native／Shell 產品啟動入口退出，不另維護一套安裝。 |
| 結果／UI | `src/lib/repositories/drawing-recognition-async-repository.ts`、`src/lib/repositories/settings-secret-async-repository.ts` 與既有 preview repository 補公司與 lease 檢查；沿 `master-attachment-panel.tsx`／既有 canonical preview resolver 修 PDF、狀態與同頁更新。 |
| OpenSWX 產品刪除 | `drawing-recognition-workspace-panel.tsx` 的 OpenSWX panel／CTA、`src/app/api/numbering/openswx-metadata/**`、`src/app/api/openswx-metadata-jobs/**`、`src/app/api/openswx-metadata-dispatch/**`、`src/lib/openswx-metadata*.ts`、`src/lib/repositories/openswx-metadata-async-repository.ts` 與專用測試；共用檔只刪相關分支。 |
| OpenSWX 建置／發布刪除 | `scripts/run-openswx-metadata-job.mjs`、`scripts/lib/openswx-reader/**`、`scripts/lib/dev122-openswx-*.mjs` 專用執行器、`config/release/dev122-openswx-worker.json`；共用 `dev012-owner-*`、`dev117-ai-pdm-continuous-release`、`dev121-owner-release-proof`、applied-continuation、planner、production Dockerfile／package scripts 移除 imports／descriptor／worker receipt 硬依賴。`read-ai-pdm-rd-permission-state-production.yml` 只退役 OpenSWX operation，其他固定診斷保留。 |
| 共用發布契約 | `config/release/dev117-ai-pdm-independent-production-v3.json` 移除 openswxDispatch／workerRef 要求，082 ledger entry 保留；`dev117-production-release-infra-plan.json` 及 `infra/google-cloud/dev-117-production-release` 僅移除 OpenSWX 專用 binding／讀回。同步 release SPEC 與 affected tests，不讓 required executor 仍要求已刪 profile。 |

### 7.1 專用雲端退出範圍

來源為現有 `config/release/dev122-openswx-worker.json` 與 `infra/google-cloud/dev-122-openswx-worker`／`dev-122-openswx-release-readback`；它們是規劃清單，執行前仍需 fresh provider readback。目標僅 `jenfu-platform-prod`／`asia-east1` 的 AI-PDM 資源。

| 退出目標 | 範圍與保留限制 |
|---|---|
| 計算／排程 | Cloud Run Job `ai-pdm-prod-openswx-metadata`、Scheduler `aipdm-prod-openswx-dispatch` 及尚在執行的該 Job executions；先排空／取消，再刪除。不可只保留 PAUSED 或空殼 Job。 |
| 專用身分／權限 | `aipdm-prod-openswx-reader`、`aipdm-prod-openswx-dispatch` service accounts；其專用 token accessor、actAs、Job invoker／readback／lifecycle bindings；`aipdmOpenswxJobReadback`、`aipdmOpenswxJobLifecycle`、`aipdmOpenswxVerifierJobReadback`、`aipdmOpenswxSchedulerReadback`、`aipdmOpenswxSecretVersionReadback` 僅在全數引用退出後刪除。保留 app／deployer／verifier 本身與其他權限。 |
| 憑證／產物 | 撤銷專用 `aipdm-prod-openswx-reader-token`；共享 `aipdm-prod-workload-auth-credentials` 只退出 OpenSWX entry，Windows 靜態項在新版 device auth 切換後退出。所有 caller 零引用前不得刪整個共享 Secret。只處理 `aipdm-release/ai-pdm-openswx-worker` 的可執行 image／部署引用，不整桶、整個 Artifact Registry repository 刪除。 |
| IaC／歷史 | 兩個專用 Terraform root 先經 exact-resource retirement plan 移除 prevent_destroy／deletion protection 的必要項再執行退役，不能先刪 IaC 遺留孤兒。state 與不可變 receipts 留歷史；`aipdmDev122PrebuildList` 等同檔的共用能力須依現存 consumer 保留／移回共用 owner，不因路徑 dev122 全刪。082 舊表／原 CAD／業務結果與歷史 migration 永久不在本次 DROP 範圍。 |

### 7.2 切換順序與 recovery

1. 取得固定唯讀 DB／provider 盤點，列出 queued／running／dispatch_unknown 的 exact job、execution 與 source；DEV-124 的 UNKNOWN 不能當零工作。先停新入口及派送，維持 Scheduler 停止，不再修復或喚醒 OpenSWX。
2. 用現有 owner 取消／失效租約並讀回 execution。若缺少取消入口，在 125-C 實作一次性、固定範圍的 owner retirement command：輸入預覽過的 job IDs／expected row basis，DB transaction 比對並只轉 `cancelled`／`dispatch_state=terminal`，留下原因／audit，不能改 completed 或刪行。unknown provider 操作先確認終態；無法確認只停止受影響退出動作。
3. 新裝置 schema/API 與 Windows 套件先在隔離環境聯測；正式啟用 Windows 前，上述 OpenSWX 新工作入口與執行都必須為零。新 app 切到 device auth 時，停止舊 standalone native worker；過渡只為部署切換，不提供使用者 provider 選單或永久雙授權。
4. 發布無 OpenSWX 執行依賴的 app／owner source，建立該版本的可用 recovery baseline；沿既有 source-bound applied-migration receipts 重用已套用 082，不重新驗 OpenSWX 的執行能力。對歷史收據只驗現行安全復原需要的 immutable provenance，不能將歷史 workerJob 存活當 prerequisite。必須通過「OpenSWX profile／模組不存在」的 prepare／build／recovery 測試才刪專用資源；尚未通過不能宣告 C 完成。
5. 執行精確資源退出、讀回不存在，從現行 source 移除所有 OpenSWX 執行 reader／builder／dispatch／fallback。歷史資料、applied SQL、證據引用不是 active dependency；檢查例外只限這些歷史資料，不豁免 executable compatibility reader。
6. 最終 recovery 只回到已驗證的 Windows 架構 revision／相容套件；若服務不可用，停解析並保留原檔／有效結果，不重新建立 OpenSWX、不回滾新 schema、不恢復靜態 token。尚在過渡的既有 owner recovery 不能被提前刪掉；需先證明 replacement，再移除舊路徑。

正式資源刪除、IAM／Secret 撤銷是後續執行責任，須提供上述清單的 fresh exact-resource plan 及既有授權核對。本輪文件成熟度不授權或執行任何正式刪除。

## 8. 實作切片、相容發布與失敗退出

| 切片 | 可開始施工的內容／完成出口 |
|---|---|
| 125-A 安裝與裝置 | §3～5 的 migration、API／guard、設定頁、NSIS／WinSW 與自有暫存；用可撤銷測試裝置完成註冊／重啟／卸載。公司合法 key 與相容 runtime 在這階段核實，不能拖到發布才發現。 |
| 125-B 單一解析與舊缺口 | §6 的 auth 全 caller、租約與原生 extractor；PDF／附件先按實際原因修復；完成真實三格式、管理員辨識與 UI 可見結果。沒有符合來源的預覽就保留原失敗，不能降格成只驗 worker 啟動。 |
| 125-C 完整退出與交付 | §7 的 source／release／provider 去依賴和退出；通過無 OpenSWX 的正常發布與復原、重跑受影響結果，維護原 7／29 對照。A、B、C 都完成才關 DEV-125。 |

每個可獨立發布切片一個 active PR，不新增三個 DEV／CAPA／第二套 QA 系統。先 migration（只加表）→ app candidate／新 protocol 與安裝產物 → 單台受控裝置 normal claim smoke → canonical 啟用；API 與安裝 manifest 固定 protocol=1，舊 binary 收 426 且停止領取。正式版本升級用同一安裝包人工更新，不做靜默自動升級。Windows COM／原生樣本可在一台設備完成主要驗證；兩台租約競爭用隔離服務 instance，不強制安排兩位真人在正式資料上操作。

App 及 release adapter 使用現有 affected-slice planner、required CI、owner workflow；修改 SQL 執行 `npm run check:db-boundary`，修改 app 執行既定 typecheck／isolated build；修改 release adapter 依既有 DEV-117 continuous／QC／abort 驗證。installer build 在 Windows runner 產出獨立 immutable artifact 與 hash，成功只代表可安裝，不代替真實 COM 驗收。AI-PDM owner build receipt 增加 `windowsInstaller={sourceRevision,version,protocolVersion,sha256}` 並與 image 內 manifest 比對；固定 same-source artifact 輸入，拒絕 actor 提供 URL 或 mutable latest。這項相容擴充與 OpenSWX workerRef 移除在同一發布契約修訂，不另建 owner workflow。不得為此新增 GCP Windows VM、公司 IAM 管理平台或跨專案 reader/writer。OrgMaster／Jenfu-Platform／JF-FMS：無程式／schema／部署修改範圍。

本次發布必須從最新 protected `main` 的正常 PR 合併來源建立，保留 PR #535 的官方 Document Manager interop 修復；migration manifest 在既有 39 筆後只追加 090，089 bytes／checksum 不變。PR #533 已關閉為 superseded，不能 merge。正式 owner workflow只使用本次 exact merged source、same-source installer 與 40-entry migration bundle；不新增 IAM、Secret、GCP credential、OrgMaster 或其他專案責任。使用者自助連結時簽發裝置憑證屬 §4～5 的既定產品流程。

發布包必須綁定實際 app SHA、migration ledger、安裝 hash／protocol 與 provider retirement plan；這些由 exact-source builder 生成，不填假值。缺合法 key、COM 不相容、未證明新的 recovery 或 provider UNKNOWN 時，阻擋各自相關的打包／原生驗收／刪除，其他隔離工作繼續；不以新增備援引擎解決。

## 9. 精簡驗證計畫與完成定義

以下是 12 組必要結果，每組涵蓋所列正反情境；不是把舊 7 issues／29 診斷 ID 改成新的 PASS 分母。自動化優先、相同未變證據重用；實際進度見 §11，未列完成者仍為 `NOT_RUN` 或 `PARTIAL`。

| ID | 必須看到的結果 | 驗證層級／原責任 |
|---|---|---|
| V125-01 | RD、採購／生管、生產人員等 active AI-PDM Principal 均可下載並以公司 Google SSO 自助連結自己的電腦；非 PDM 管理員不被擋，PDM 管理員只多全公司清單與緊急撤銷；OrgMaster 未新增 writer。 | 角色化 API／UI、隔離 PostgreSQL及正式正常 SSO smoke。 |
| V125-02 | 畫面與安裝工具都沒有人工「註冊 ID／單次註冊碼」欄位；loopback state、短效交換與 unknown-result readback 正常，日誌／DB／UI 無明文 Document Manager key、device token 或 CAD bytes。 | source contract＋API／瀏覽器／Windows 安裝流程。 |
| V125-03 | 全新 Windows 安裝、Google 自助連結、關機／上線、重啟、覆蓋更新、重裝、多電腦及卸載；每台裝置有獨立可撤銷身分，服務以低權限 session 0 真正解析。 | Windows 11 x64 實機；記套件 hash／COM 版本，不要求共用常開主機。 |
| V125-04 | A 的裝置不能 claim、下載、heartbeat 或 complete 只有 B 有權的工作；帳號停用、角色撤銷、Principal mapping 失效、owner 不符或裝置解除連結後下一次 caller／key broker／source／complete 立即拒絕。 | 全 caller route contract＋隔離 PostgreSQL＋正式撤銷 smoke。 |
| V125-05 | preview／recognition／probe 領取用途分離；同工作兩 instance 只一有效 owner；失聯重領、舊 attempt、重啟、取消／parent-lock／initiator 撤權均零錯寫。無裝置在線時 queued 工作保留且 attempt 不增加，上線後自動接續。 | 既有 lease／source／PostgreSQL regression；D122-05 F-01B～F。 |
| V125-06 | known-preview `.SLDPRT`／`.SLDASM`／`.SLDDRW` 各至少一個真實來源，原始 hash→讀取證據→正確 PNG；document／configuration 屬性與預期一致。缺圖、壞檔、較新格式、錯 key 明確失敗。 | 真實 Document Manager／相同產物；沿用有效單樣本證據但不跨格式冒用。 |
| V125-07 | 原檔 bytes／hash 一致；新版來源不取舊結果；亂序／重複 complete 及 ACK 遺失不重寫；timeout／crash 清理自己暫存，原 CAD 零修改。 | 隔離 fault 測試＋真實 reader；D122-05 F-01A～E。 |
| V125-08 | A0001-M01 對應受控來源的原生預覽與 PDF：正常頁面 current-hash、完整圖框可讀、同頁等待轉成功；缺 Windows 顯示等待，ready 不重排。 | 實際正常 UI／受控資料；正式 smoke 與隔離回歸分列，不用本機代正式。 |
| V125-09 | 附件上傳／重載／下載、各有效角色依自己權限執行原生辨識；PDF 不依賴 Windows；Document Manager key、裝置 token、CAD bytes 在 UI／回應／log／evidence 零洩漏。 | §2 原責任對照＋redaction sweep；D122-07 保持 DISABLED_DEFERRED。 |
| V125-10 | 不含 OpenSWX 模組／profile 的 app build、owner prepare／recovery 可用；其 UI／API／imports／package command／環境變數／active IaC 零執行入口，無 Shell 替代雙軌。 | source dependency 搜尋＋affected release suite＋required CI。歷史例外逐類確認，不能把活程式列歷史。 |
| V125-11 | exact 舊工作全終態、無 active／unknown execution；專用 Job／Scheduler／SA／binding／token 已退出，shared 資源與 immutable receipts 保留。 | fresh DB／provider readback；UNKNOWN 不計 PASS，僅 PAUSED 不通過。 |
| V125-12 | immutable 089＋forward-only 090→candidate→使用者自有 Windows→正式 UI→新架構 recovery 的版本／hash 對得上；失敗停解析仍可下載，不重啟 OpenSWX。 | 既有 owner release＋正式受控 smoke；以本次 exact merged source 更新結果。 |

結案需 V125-01～12 的適用結果完整且 Windows 功能可用、OpenSWX 確實退出。保留 DEV-122 的原始七項／29 組完整對照與未驗，不將 deferred supplier 或尚未做的正式旅程計 PASS；DEV-125 完成也不能自動改寫 DEV-122 原七項整體通過。紀錄只需沿既有 QA 入口存受測 source／artifact、環境、樣本 hash、實際結果及失敗，無須新增簽核層、逐案真人操作或任務登錄平台。

## 10. Architecture Closure Review（2026-10-27）

本次由 PM／技術主管對照合併後 main 做文件自查，不宣稱獨立 QC 或執行驗收。

| 實際 source 發現 | 已封口的架構決策／實作定位 |
|---|---|
| `worker-service-auth.ts` 現為同步 env credential，沒有 device company；不能直接宣稱每台可撤銷。 | §4～6 固定兩表、async 全 caller、DB 即時撤銷、company filter 與 instance fence；舊 env auth 一起退出。 |
| preview 已有 v2，recognition 有 attempt／locked_at／fingerprint，probe 已有 company／initiator／v2。 | 重用 owner 與現有欄位加嚴，不創第二套 queue 或 lease 服務；parent／人員權限保護保留。 |
| 現有 C# PNG exporter 主要是 SLDDRW，另有 Shell 路徑；不能宣稱三格式已完成。 | §3 定案 Document Manager 單引擎，PRT／ASM 擴充已儲存 configuration PNG；V125-03／06 真實驗收，無圖明確失敗。 |
| OpenSWX 進入 UI、API、build、owner proof、applied continuation 與專用 IaC；刪 worker 不足。 | §7 全面退出清單與 replacement recovery 在前、provider 刪除在後；共享權限按 consumer 處置，歷史 SQL／收據保留。 |
| 舊文件將安裝工具／資料/API 留待實作再選，PDF 與 CAD scope 易混。 | §3～9 完成 installer、data／API／auth／failure／release／QA 決策；PDF 獨立修復；無 OrgMaster 相容程式任務。 |

當時結論為 `RD Implementation Ready / Architecture Finalized`，且沒有尚待選架構的 P0／P1 設計缺口；其後 125-A／B 及 125-C source／provider 退役已依此契約實作，現況以 §11 為準。合法 key／指定版本 COM、三格式實機、正式 Windows worker／A0001 預覽與原缺口驗收仍是待取得的執行證據，不標 PASS；這些是執行與驗收缺口，不需要重開 DEV-122 或另一輪架構規劃。

## 11. Implementation Progress（2026-10-27）

本節依時間保留當日發布與退役檢查點；較早段落的「尚待」不是現行狀態，最新且權威的收斂結果以 §11.1 為準。

125-A 已由 PR #498 合併：migration 089、管理員電腦清單／下載／註冊／停用 API、device enroll／self／start／heartbeat、設定頁、DB 即時裝置身分、NSIS 3.11＋WinSW 2.12.0＋Node 24 套件、LocalService/service SID、DPAPI LocalMachine credential、Document Manager x64 runtime 版本／SHA-256 probe，以及 same-source installer manifest／CI artifact。

125-A RD 證據：隔離 PostgreSQL 6 組通過（單次碼／重送／錯碼限流／過期／session 撤權／instance 競爭／heartbeat／撤銷）；installer 實際編譯及 manifest digest readback 通過；本機既有 Document Manager x64 major 33 COM runtime 啟動及 runtime digest probe 通過。早期 extractor 的 `dynamic` COM 假設其後由 §11.5 實機首敗推翻，現行定案改為執行時載入電腦既有官方 interop 並以明確 interface 呼叫，仍不散布專有 DLL；DEV-125 contract、既有 release、slice planner、typecheck 與 DB boundary通過。管理員正常 SSO、安裝／重啟／覆蓋／卸載實機操作仍未完整驗證，因此 V125-01／03／04 維持 `PARTIAL`；V125-02 自動化範圍為 `PASS`。

125-B 與 125-C 的 source 層已由 PR #499 合併至 `9d4881755bae7f6b77d77487e32e9d9bec9f50dd`，required CI run `40460654463` 的 `DEV-012 Isolated PostgreSQL Cutover` 與 `Production Slice QC` 均通過：Windows service 增加統一工作排程器及 completion-status 入口，preview／recognition／probe caller 收斂至 DB device auth 與 lease fence；OpenSWX active UI／API／repository／reader／worker、release profile、建置與 owner proof 依賴已移除。PR #501（merge `f635ef426540e810eacc532aa42ef59bfb098ebe`）另讓正常 release producer 可驗證帶有已退役 worker reference 的舊 intent，但 current release 仍拒絕重新引入 OpenSWX。這些只證明 source 與 required CI 收斂，不等於真實三格式 Document Manager、A0001 3D／PDF、管理員辨識、正式 SSO／裝置、candidate／traffic／recovery 或雲端資源退出通過。在 PR #499 當時，V125-05～09 標 `NOT_RUN`／`PARTIAL`、V125-10 只有 source／CI 與 recovery 部分成立、V125-11 未通過、V125-12 為 `PARTIAL / NOT_ACCEPTED`；後續證據已取代其中的 OpenSWX 項，現況以 §11.1 為準。

125-C 退出前唯讀基線新增 fixed `preview-openswx-runtime-state` operation：固定 `company-jenfu`／`A0001-M01`／兩個指定檔案，DB 以 `REPEATABLE READ READ ONLY` 讀 current binding、current-hash preview job／derivative、舊 worker identity heartbeat 與 OpenSWX grouped／active state；provider 只投影唯一 100% serving revision 的非敏感 dispatch flag。operation、migration-runner digest、source revision、child output path 與 final receipt均綁 operation hash，不接受任意 target／SQL／command；不新增 IAM／Secret／schema，也不寫 business row／service configuration。heartbeat 明示不等於 OS process。此讀回尚未涵蓋 OpenSWX Job／Scheduler／execution及所有 caller inventory，因此 receipt 只能回 `DRAIN_OR_ENTRY_SHUTDOWN_REQUIRED` 或 `DB_AND_APP_ENTRY_CLEAR_PROVIDER_INVENTORY_REQUIRED`，`providerInventoryComplete=false`；兩者都不是 V125-11 PASS、no-current-need 或刪除授權。實作已由 PR #500 合併至 main `b7b0f4e59165c00f6f39850170707e7ca9d9174b`；required CI run `40462399916` 與 main push CI run `40463285926` 均通過。因下述正式發布 attempt 綁定較早 source `f635ef426…`，目前正式 migration-runner 尚未含 PR #500；必須先完成 `b7b0f4e…` 的 fresh source-bound 發布，才可建立及執行 fresh immutable operation。正式 readback 仍未執行。

2026-10-27 正式 owner release run `40462943166` 使用 source `f635ef426540e810eacc532aa42ef59bfb098ebe` 與其 immutable release capsule。preflight、build、forward-only migrate、candidate 及 entrypoint 均通過；verify 在 Firebase refresh 成功後，Platform `POST /api/auth/firebase/session` 回非 200，終止碼為 `PRINCIPAL_SMOKE_PORTAL_LOGIN_FAILED`。decision／activation 未執行，沒有切換正式流量；recovery／rollback terminal 為 PASS。此結果證明失敗路徑安全停止及 recovery 可用，不證明 candidate 功能、正常 SSO、Windows 裝置、A0001 預覽或 V125-12 通過，也不把已成功的 build／migration 誤記為產品驗收。

下一次正式發布不得重用上述舊 capsule。既有 reauthentication 已完成且不得為同一原因重複輪替；後續須以 corrective 合併後的 exact main 產生 fresh capsule並走完整 owner release。若 smoke 仍失敗，只保留該次 provider readback並停止 activation；不得繞過 verify。發布成功後才執行 fixed runtime readback，之後仍須另做 §7.1 的 Job／Scheduler／execution／IAM／Secret fresh provider inventory，兩者不能互相代替。

R4 之後的 prerequisite 續接另揭露三個 release-adapter 缺口。第一，ordinary abort reader 原本由 deployment 直接跳 candidate，漏讀已封存的 migration-admission；PR #504 已改為 `deployment → migration-admission → candidate` 並通過 required CI。第二，released predecessor `DEV122-RD-WIF-40231212962-1` 合法保留歷史 `openswxWorkerRef`、runtime extension 與當時的兩項 RD smoke，但 current validator 把它們誤當現行發布輸入。PR #505～#508 已把歷史 ref 限定為只供 observation、從現行 capsule 投影移除，封閉驗證 worker／flag／numeric Secret version，並在套用現行 runtime validator 前精確正規化退役欄位；本 corrective 只再補齊當時 exact RD smoke。不讀或執行舊 descriptor，也不把任何 worker 欄位帶入新 runtime。該 predecessor 的 smoke 只接受封存的 `rd-candidate-ready=200` 與 `rd-permission-unauthenticated-denied=401` exact shape；現行普通發布仍須完整 SSO smoke。第三，optional forward-submission object 的 provider 404 原先比對錯誤字串，本 corrective 只將 `MIGRATION_GCS_METADATA_FAILED:*:404` 的既定終態轉成 `MISSING`，403／media failure 等維持拒絕。

上述 local corrective 已以 focused 18／18、owner／runtime／stage／prerequisite aggregate 145／145 通過；另以正式 R4 immutable refs 執行唯讀 continuation，已讀回 `PRINCIPAL_ORDINARY_ABORT`，未寫正式資料、未切流、未建立 capsule。此結果在當時只證明 fresh release 的 prerequisite 可安全解析歷史證據；當時 V125-10／11／12 都不可改為 PASS。後續 owner release、OpenSWX cleanup／provider retirement 及 source cleanup 已完成，現況以 §11.1 為準。

### 11.1 現行結案修訂（取代上述當時的待辦敘述）

- 正式 owner run `40473862392` 以 exact merged source `606c5aff0af85c88749f571018a5204417d521b8` 完成 prepare、build、migration admission、candidate、入口、verify、decision、activate、canonical 與 finalize；現行 `ai-pdm-prod-f48bd0c43f8c` 承接 100% traffic，image digest 為 `sha256:481644eeb72d2606e4298117d6c903dc688d5a62df055ddb71b01aec99d1df4f`。這取代上述 R4 失敗後「fresh release 尚待執行」的狀態。
- OpenSWX retirement operation `DEV125-OPENSWX-RETIREMENT-20261027-R14` 在 `SERIALIZABLE` transaction 依已證明的 2 筆 active row 完成取消，`mutatedRowCount=2`、`remainingActiveRowCount=0`，provider 前置讀回為 Scheduler `PAUSED`與 active execution `0`；immutable cleanup receipt status=`RETIREMENT_COMPLETE`。
- 後續 fixed runtime readback `DEV125-RUNTIME-20261027-R15` 證明 OpenSWX `pendingCount=0`、`activeRowCount=0`、serving app dispatch 未設定且 disabled。同一讀回也證明 A0001 兩個指定檔案 current binding 都是 `MISSING`，preview job／derivative 都是 0，兩個歷史 worker identity 沒有 fresh heartbeat；因此 A0001 現行缺口是正式檔案綁定與 Windows runtime，不是再開 OpenSWX。
- PR #525 合併後，精確 provider apply 已刪除 OpenSWX Job、Scheduler、reader／dispatch service accounts、reader-token Secret 與五個專用 custom roles，project OpenSWX binding 讀回為 0。worker tfstate lineage `c0d4a392-6333-a452-a390-6eb88a09e91f`／serial 7 為 0 個 managed address；readback tfstate lineage `e23b4b1d-ccce-1d26-e962-7a73ddfeb83a`／serial 5 只保留兩個 shared prebuild readback control。PR #526 合併後又刪除已完成的 Terraform roots、runtime readback／cleanup executor 與 workflow operation，不再保留可重播的 OpenSWX 執行入口。PR #527 因該資源已退出而關閉為 superseded，其 executor 未合併、不重新引入已刪 surface。

依上述 exact receipts、provider readback 與 source 退出，V125-10／V125-11 收斂為 `PASS`；V125-12 僅完成正式發布與 OpenSWX 不回復部分，仍為 `PARTIAL / NOT_ACCEPTED`。V125-01／03～09 仍依現有證據為 `PARTIAL`／`NOT_RUN`；必須完成 Windows 11 x64 服務實機、三格式 Document Manager、正式裝置註冊／停用、A0001 current binding 建立後的 3D／PDF 預覽、管理員辨識及原缺口對照，DEV-125 才能整體結案。

### 11.2 R18 正式發布收斂（2026-10-27）

PR #526 合併 exact main `3720c7cea8f294f086e34a175fdf911283971007`，required CI run `40505306777` 兩項必要檢查通過；正式 owner release `DEV125-FINAL-20261027-R18`／run `40507513920` 完成 preflight、build、migrate、candidate、verify、decision、activate、canonical 與 finalize。terminal 為 `PASS / RELEASED / remainingHumanAction=0`，migration applied 0／replayed 39／ledger 39；`ai-pdm-prod-66f9b3ca5852` 以 image digest `sha256:00080078bfa210441f3e2538184bee437793e64d3fb9ae8622e898eeca380497` 承接唯一 100% traffic、零 tag。candidate 與 canonical 的 Platform session、SSO callback、authenticated probe 皆 200／303，未登入與撤銷 session 皆 401。此結果取代 §11.1 較早的 serving revision，但不替代 Windows／A0001 產品驗收；結構化資料見 [正式發布與退役證據](../qa/DEV-125-production-release-and-openswx-retirement-2026-10-27.json)。

### 11.3 Windows 首次實機安裝缺陷與修正（2026-10-27）

同來源 `0.1.0-ci.1356` 安裝包已在 Windows 11 x64 實機完成安裝，但使用者取消註冊，因此未產生 `credential.bin`、device identity 或正式裝置資料。安裝後 readback 顯示 `AipdmWindowsParsing` 為 `Running / Auto`，實際登入身分卻是 `LocalSystem`，而且 Windows「程式和功能」沒有解除安裝項目；這兩項使 V125-03 維持 `FAIL / REMEDIATION_IN_PROGRESS`，不可用原 contract 測試或服務啟動取代。

根因是 WinSW 2.12.0 的服務帳號 schema 應使用 `<domain>NT AUTHORITY</domain>` 與 `<user>LocalService</user>`，現有 XML 誤用 WinSW 3.x 的 `<username>` 而被 2.12.0 忽略；NSIS 也只寫自有版本 key，未寫 Windows 標準 uninstall key。PR #529 的 `6758bb6088e11970949c2ca499680964c8247524` 修正服務帳號與標準解除安裝登錄，`fdbc32ec35909b9f1ca5d1377251058e3b29f2fd` 補 64-bit 登錄檢視，`ebeceaebc42603f6294ac05e2f6b6f02653b4d98` 再將解除安裝改為服務確實不存在後才刪檔／登錄，固定安裝路徑並只刪本產品捷徑；focused contract 11 項通過。最新 required CI run `40514708934` 的兩項必要檢查均通過，並產生 installer `0.1.0-ci.1361`（artifact ID `12739205967`、protocol 1、SHA-256 `8936eb286d0c1c3b570ef11230651c4c0ddcc57ce450f181b0519865b657cfba`、size `29257184`）。artifact 綁 GitHub PR merge ref `9f8bf4995234a88fc562741c78fccda76018e322`；其 tree `490028618f513d46fce45dbf9aac1a8ee69fba6c` 與 PR head `ebeceaebc42603f6294ac05e2f6b6f02653b4d98` 完全相同，下載後 manifest／build evidence／實檔 hash 與 size 讀回一致。

缺陷版已依使用者明確授權完成解除安裝；2026-10-27T14:00:33.906Z 讀回服務不存在、相關程序 0、程式目錄不存在、資料目錄不存在、自有登錄與標準 uninstall key 均不存在。這只證明失敗安裝已清除，不代表修正版驗收通過；以修正版重新安裝前仍須取得 action-time confirmation，驗證 LocalService、service SID、ACL、程式和功能項目、重啟／覆蓋／卸載及不註冊時零 credential／device side effect。V125-03 只有在這些實機結果成立後才可改為 PASS。

後續查核同時發現 owner release 的 source archive 仍只有 clean Git tree，runner image 也未複製 `worker-downloads/windows-service`；因此即使 required CI 已產生 immutable installer，正式下載 API 仍可能因 image 缺檔回 503。這是 §3／§9 既定 same-source 契約的實作缺口。PR #530 已把 same-source artifact、archive、image 與 receipt 接縫合併至 `main`；本分支保留該修正，並將 `actions: read` 從同時持有 production environment／GCP `id-token` 的 job 收斂到無 production environment、無 `id-token`、無 GCP 身分的隔離 binding job。production job 只接收同一 workflow run 重新驗明的 artifact，且不再有 Actions artifact 讀權。不得使用 mutable latest、name-only 最近一筆、actor URL、runtime 網路下載或新增 GCP runtime 讀權。

### 11.4 R20 Windows 交付路徑發布與正式讀回（2026-10-27）

PR #529～#531 已合併；exact main `ef8a7b9ebddc8e820e44874e34cf17c52a670d33` 的 main CI run `40523534853` 兩項必要檢查均通過，產生 installer `0.1.0-ci.1370`（protocol 1、SHA-256 `906807b7df3e1bb80304418f3c75380c7661795db11b5ebde0f353b77451be73`、size `29257933`）。正式 owner release `DEV125-WINDOWS-20261027-R20`／run `40524682058` 的 preflight、isolated installer binding、build、migration、candidate smoke、activate readback 全部 `SUCCESS`；terminal 為 `PASS / RELEASED / remainingHumanAction=0`。migration applied 0／replayed 39／ledger 39；`ai-pdm-prod-39846fac3736` 以 image digest `sha256:b1634e283dc0edaceb942b9f80af42abf14abaf3370ce03ea7b86841a431dae4` 承接正式流量。build、provenance 與 deployment capsule 三方都綁同一 installer source／version／protocol／digest；R19 只留下 source/runtime 前置收據，未建立 release intent、未部署或切流，且未重用。

公司 Google SSO 管理員在正式 `/settings/windows-service` 已能讀取下載入口、建立註冊碼入口及空裝置清單；未登入直接 GET installer API 回 `401 / private,no-store`。登入後兩次瀏覽器下載均取得 `29257933` bytes，實際 SHA-256 都是 `906807b7df3e1bb80304418f3c75380c7661795db11b5ebde0f353b77451be73`，與 manifest／R20 receipt 一致；Chrome 因可執行檔下載保留為未確認暫存，本輪未繞過警示、未執行安裝。正式頁面仍有一項顯示缺陷：`/settings` 總覽在 production-slice 模式把已開放的 Windows 解析服務誤標為「未開放」且隱藏管理連結。本切片修正該卡片為固定「電腦管理」並保留 `/settings/windows-service` 連結，focused presentation test 8／8 PASS；發布前 V125-01 仍維持 `PARTIAL`。

同一 Windows 11 x64 主機的 `SwDocumentMgr.SwDMClassFactory` late-bound COM probe 已實際通過：Document Manager 2025 `33.3.0.0092`、runtime major 33、x64；授權檔含可用 key（內容未輸出或記錄）。這只建立 V125-03／06 的前置條件，不替代修正版安裝、低權限 service、三格式讀取或正式 UI 結果。現行缺口仍為修正版實機重裝／更新／卸載、正式裝置註冊與撤權、SLDPRT／SLDASM／SLDDRW 原生結果、A0001 current binding、3D／PDF 預覽及管理員辨識。

### 11.5 R21 UI 發布與 Document Manager 實呼叫 corrective（2026-10-28）

PR #534 合併 source `04bf38f1e1e69fb014280a471bb7bb94b5cda50a`；exact-main CI run `40531212142` 的兩項必要檢查通過。正式 owner release `DEV125-WINDOWS-20261027-R21`／run `40533200961` 為 `PASS / RELEASED / remainingHumanAction=0`，active revision `ai-pdm-prod-23016668ce55` 承接 100% traffic；same-source installer `0.1.0-ci.1373` 的 SHA-256 為 `fd75f9565e4c62062d3fd39318c8bcbfc52c0e8e72b07d1ef388b0a33a556fc6`。公司 Google SSO 管理員已在正式 `/settings` 讀回 Windows 解析服務 `電腦管理` 卡片與 `/settings/windows-service` 連結，V125-01 的總覽誤標 corrective 通過。

Windows 11 x64 實機目前安裝 R20 `.1370`；讀回服務為 `Running / Auto / NT AUTHORITY\\LocalService`、service SID `UNRESTRICTED`，64-bit Programs & Features 項目存在。因非提升權限工作階段無法讀取 installer 所設的受限 Program Files／ProgramData ACL，ACL、credential 與裝置檔案仍不得推定通過；也不能用 `.1370` 代替 R21／後續 corrective installer 的同來源驗收。

在不安裝、不連正式 worker 的隔離 stage，以授權金鑰對 `D-0007-MA1.SLDPRT`、`A0053.SLDASM`、`D-0007-MA1.SLDDRW` 首次執行實際 credential、metadata 與 preview 時，原 `.1373` source 的 credential probe 與三格式 metadata 全部失敗，preview 均回 `RuntimeBinderException`：`System.__ComObject` 不包含 `GetApplication`。實機進一步證實該 COM class factory 不支援 `IDispatch`；先前 probe 只證明 ProgID activation，沒有證明功能呼叫。依官方 interface 契約，本 corrective 改為從已註冊 native server 同目錄載入強式簽章身分為 `SolidWorks.Interop.swdocumentmgr`／public-key token `e52dfa2d3a1e978a` 的官方 interop，以 `ISwDMClassFactory` 等明確 interface 反射呼叫；安裝包仍不含 native 或 managed SolidWorks DLL。

修正後同一組隔離實機重播：credential probe 通過；三格式 metadata 分別讀得 14／5／3 個屬性，PNG 分別為 6,483／36,707／13,105 bytes且視覺內容有效；三個原檔前後 SHA-256 完全一致。installer probe 亦會在安裝前 eager-resolve extractor 實際需要的 factory、application、document、configuration 與 sheet interface／member，避免只有 class factory 可啟動、工作執行時才發現版本不相容。DEV-125 contract `13/13`、Vitest `29/29`、affected slice `20/20`、typecheck、lint（0 error；9 existing warnings）及 isolated build（artifact／primary／cleanup=true）通過。這證明 corrective candidate 與三個授權樣本可運作，尚未替代 PR／required CI／正式新 installer、服務身分下執行、註冊／撤權與 A0001 正式 UI 驗收。

### 11.6 Google 自助連結與 R25 正式發布（2026-10-28）

PR #533 已於 `2026-10-27T17:24:02Z` 關閉且未合併；未知 worktree 修改保留。PR #535 的官方 interop 修復保留，PR #536 完成 owner-bound device auth、Google 自助連結、全 caller 重新授權與 forward-only migration 090。PR #537 修復舊 credential 檔案使覆蓋安裝跳過連結的問題；PR #538 再將覆蓋安裝收斂為先向 `/api/windows-service/self` 驗證既有 DPAPI credential，有效即保留相同裝置身分，失效才開啟 Google 自助連結，網路／server 暫時失敗則停止，不建立重複裝置。人工註冊 ID／碼 UI 已移除。

正式發布來源是 PR #538 merged main `06d370bba2749230e4c70c8ae7bfa4580613a6e6`；required PR CI run `40565759836` 與 main CI run `40566610056` 的兩項必要檢查皆成功。`DEV125-SELFLINK-20261028-R25`／[owner run 40567208247](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/40567208247) 完成所有階段，terminal 為 `PASS / RELEASED / remainingHumanAction=0`（此欄只代表發布工作流）。migration readback=`applied 0 / replayed 40 / ledgerCount 40 / boundary PASS`；090 已套用且此次重播，089 未修改。正式 revision `ai-pdm-prod-8effb9783333`、image digest `sha256:d9088c0f17638c43d24f95f62a677394ff2121095151016e6f23180405433816`，provider 讀回唯一 100% traffic、零 tag、Ready=True。

same-source installer=`0.1.0-ci.1383 / protocol 1 / 29,267,355 bytes / SHA-256 aa49888b9bcc7f9a9ac7d771c9f8ea480969af5f02793f86a68045465ecc790d`。CI artifact、build evidence、release capsule 及下載實檔一致。candidate／canonical smoke 的 session、登入 probe 均 200，SSO start／authorize／callback 303，未登入／撤銷 session 401。terminal receipt 外部 SHA-256=`41e9c1152bae64982bf4fd7ce17b8256500dc56649b0901fe4178266208b70fb`；完整 refs 見 QA JSON。

實機 R25 安裝目前停在 Windows UAC 等待使用者本人確認；舊服務仍為 `.1370 / Running / NT AUTHORITY\\LocalService`。新版自助連結、低權限服務三格式工作、正式撤銷、重啟／覆蓋／重裝／多電腦與 A0001 UI 尚未取得完整證據，維持 `PARTIAL / NOT_RUN`。已定位真實 `A0053.SLDASM`（174,437 bytes、SHA-256 `a742e01991a82f08170e82fb137819bb0b1b4ebad8096fe035f841c383385694`）；定位與隔離 native reader 結果不能代替正式服務驗收。此次未新增 IAM、Secret 或 OrgMaster／其他專案修改。
