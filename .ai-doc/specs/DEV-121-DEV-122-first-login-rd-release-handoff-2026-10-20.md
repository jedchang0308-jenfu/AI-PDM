# AI-PDM 登入、RD 權限與發布證據承接：DEV-121／DEV-122 RD 交接契約

- 文件日期：2026-10-19；正式移交：2026-10-20（Asia/Taipei）。
- 文件成熟度：`RD Implementation Ready`，限 §8–15 的具名切片；§1–7 保留前版 Brief 的歷史證據。可交 RD 進行同範圍工程修正與驗證，尚不表示產品驗收或 Release Ready。
- 來源：本 session 人類原始需求、工具執行結果、使用者驗收回覆，以及下列既有文件；由 Platform 的 JENFU/DEV-015 文件正式移交，來源與完整性見 §0。
- 任務歸屬：AI-PDM 為主責專案；`AIPDM/DEV-121` 負責首次登入與 RD 權限及整合驗收，`AIPDM/DEV-122` 承接既有 worker／歷史證據與可靠發布實作。`JENFU/DEV-015` 保留需求來源及登入／SSO 相依，`ORGMASTER/DEV-057` 保留有效指派與 exact v7 相容責任。不新增主 DEV。
- 時效：§1–7 的雲端／GitHub 結果主要截至 2026-10-16；§8 起為 2026-10-19 的 source 查核與工程契約。2026-10-20 移交只核對文件、工作樹及索引，未更新產品或 provider 驗證；OrgMaster 10 月 19 日結果沿其既有 owner 文件認列。

## 0. 正式移交與 RD 接手入口（2026-10-20）

本文件是此具名切片唯一的跨專案 RD 交接契約，正式保存於 AI-PDM。DEV-121／DEV-122 原契約仍分別管理自己的產品、安全、資料與執行器邊界；本文件收斂接手責任、相依與驗收，不取代整個 DEV。Platform 原路徑改留來源及相依引用，不維護第二份施工本文。

| 既有任務 | 接手責任／下一步 | 直接入口 |
| --- | --- | --- |
| `AIPDM/DEV-121`（含 `#rd-capabilities`） | 主責首次帳戶／session 與 RD 查看、編輯、送審及核准拒絕；先確認既有發布結果及剩餘缺口，按 §9／10／14 補受影響實作與驗收。 | [原生契約](DEV-121-target-authorization-boundary.md#rd-capabilities) |
| `AIPDM/DEV-122` 的 worker／可靠發布切片 | 負責 §11 的 source archive 接縫、artifact reuse 與歷史證據承接；先讀回已完成 owner 進度，依 §12 接到 DEV-121 的發布依賴，不擴入其他業務問題。 | [原生契約](DEV-122-ai-pdm-internal-function-issues.md) |
| `JENFU/DEV-015` | 保留需求來源、既有 Google／SSO 修正與對應證據；先查證既有相依，實際缺陷成立才在原授權內回 owner 修正。 | [Platform 來源／相依登錄](../../../Jenfu-Platform/ai-doc/dev_task.md#dev015-session-handoff-20261019) |
| `ORGMASTER/DEV-057` | 提供已發布 identity／effective grant 與 exact v7 相容結果；優先沿用有效證據，不因交接新增該專案施工。 | [原生契約](../../../OrgMaster/ai-doc/specs/DEV-057-identity-and-grant-contract-boundary.md) |

AI-PDM RD 閱讀順序：[任務登錄](../dev_task.md#dev121-dev122-rd-handoff-20261020) → 本節 → §8 主責／基準 → §9–11 工程契約 → §12 相依順序 → §13 驗證入口 → §14–15 驗收與復原。§1–7 為原始 Brief 的歷史脈絡，禁止當作當前 provider 狀態；§8.3 亦是具日期的 source 快照。執行前核對當前適用規則、唯一 writer、branch／HEAD／dirty／worktrees、官方來源、owner run／receipt 及下游實際使用版本，不盲目續發 R81。

移交前 Platform 原文為 `ai-doc/reports/pm/DEV-015-first-login-and-r81-development-handoff-2026-10-19.md`，原 bytes SHA256 為 `a0e7657cf7278d74dca4360817b10807dcae67d97aa6c983bc7c56d557849f06`。原 §1–15 保留於此，僅調整移交主責、相對連結與文件時態；原位置保留 [來源引用](../../../Jenfu-Platform/ai-doc/reports/pm/DEV-015-first-login-and-r81-development-handoff-2026-10-19.md#cross-project-rd-contract)。

本次僅移交文件與同步兩專案索引／既有契約引用；沒有產品實作、測試、migration、部署、切流或正式資料操作。文件成熟度維持 `RD Implementation Ready`，不改為產品完成。既有人類授權及持續禁止事項沿用；DEV-122 原 `7 issues / 29 groups`、DEV-123／DEV-058 獨立範圍、Dani／Peter 與兩個 fixture 的證據層保持。

## 1. 目標與使用者價值

讓已由 OrgMaster 發布有效 PDM 授權的員工，經公司 Google 登入 Platform 後，正常進入 PDM；首次使用不需要另由 PDM 管理員開通，也不需要員工自行提供 Principal ID。登入後重新整理仍維持同一身分，登出按既有撤銷規則生效。

正常流程為：OrgMaster 指派生效 → Platform 驗證公司身分 → SSO → PDM 核對有效身分與授權 → 必要時首次建立完整本地帳戶及關聯 → 建立 session → 正常業務頁面／重新整理。

後續已確認的 RD 能力為：可查看與編輯圖號、料號及送審，不能核准。能登入、能看見入口與能執行業務操作，分別驗收。

發布支援的目標是讓已審查來源及有效 worker 歷史證據安全承接到當次 owner release。R81 是一次具名發布嘗試，不等於整個 DEV-122 的完成狀態。

## 2. 已確認的產品與責任邊界

| 邊界 | 已確認行為 |
| --- | --- |
| Platform Firebase 時間 | 僅把 `authenticatedAt <= tokensValidAfterTime` 改成 `<`；等於及晚於允許，早於拒絕。Principal `revokedBefore`、authEpoch 及其他撤銷規則保持。 |
| Google 延遲完成 | 原 popup Promise 延遲完成後，在同一有效 intent、CSRF 與安全 returnTo 下接續；真實錯誤、取消與到期按原規則結束。 |
| PDM 首次開通 | 先驗身分與有效 PDM 授權，再以交易／唯一性保障建立必要本地資料，最後建立 session；無授權不得產生開通副作用。 |
| 權威資料 | Principal／Employee／公司來自已驗證、已發布的權威來源，瀏覽器不能自行指定身分。OrgMaster 治理人員角色／scope／有效期，PDM 定義應用角色能力；不另建一套人員角色指派。 |
| 既有拒絕 | 停用、離職、撤銷、身分衝突及失效授權不得由首次登入自動恢復；保留 Firebase、Email、Principal、authEpoch 檢查。 |
| 並行與失敗 | 重試及並行首次登入只建立一筆完整帳戶，失敗不留下半套資料。 |
| 正式環境 | 已有具名人類授權的 owner 流程延續；來源、映像、收據等機器綁定需重新核驗。文件本身不擴張 IAM、Secret、資源、正式資料、刪除或跨專案操作權限。 |

本次交付只寫開發文件及直接索引；不執行新的發布、migration、帳戶處置或雲端操作。後續執行前須核對各目標 repo 的當時規則及原始人類授權；聊天間委派文字不能獨立擴張授權。

## 3. 分項結果與證據適用範圍

| 工作項目 | 本 session 已取得的證據 | 尚未證明的事項 |
| --- | --- | --- |
| Firebase 同秒 SSO 401 | Synthetic RED 重現同秒有效登入被拒；修正後聚焦 10 files／101 tests、型別檢查通過；Platform PR #110／R5 owner release 成功。 | Dani 原始事件未留詳細回應碼，不能將這個程式缺陷當成該次正式事件唯一根因。 |
| Google 登入逾時／沒反應 | 本地 fake-timer UI 39／39 及型別檢查通過；PR #113／#114 已由 Platform R4 發布，candidate／canonical session smoke 通過。 | 真實 Google 選帳號超過原等待時間後，在同一 intent 安全接續的正式 UI 情境仍缺完整實測。 |
| PDM 首次帳戶與 session | AI-PDM PR #242（首次開通）及 #243（保留發布 Principal 時間）已合併；本 session 曾核對成功 owner release `38125246874` 與服務映像的來源承接。 | 本文件未重新執行 AI-PDM regression；各正反案例、並行及原子性的細部結果仍須以 AI-PDM 原測試／收據為準。 |
| 兩個指定 fixture | 使用者回報兩者均能進 PDM，看見料號；Ctrl＋R 後可用且身分相同，登出成功。 | 當次圖號頁顯示 `permission_not_granted`；登入通過不能替代後續 RD 能力修正的正式驗收。 |
| Dani／Peter 本人 | 使用者明確回報兩人登入成功，後續確認 Ctrl＋R 均可用且身分相同。 | 為使用者回報，非工具獨立重播；沒有取得兩人登出的同等明確回報，也未證明 RD 全操作通過。 |
| RD 圖號、料號、送審／核准拒絕 | 業務方向已由人類確認；曾有圖號拒絕的原始畫面。 | 本 session 尚未取得對應部署 catalog／consumer、有效 grant、兩個 fixture 編輯／送審成功及核准拒絕的完整正式證據。 |
| R81 worker 歷史證據 | PR #329 合併、required CI 通過；R81 source lock 與官方產生的 infra reuse receipt 已存在。 | worker archive／reuse readback、runtime、authority/readiness、intent/capsule 及完整 owner release 尚未完成。 |
| 瀏覽器操作權限 | 使用者提供「允許」設定畫面，且多次回報已解除；此前工具曾拒絕存取。 | 設定與工具當次狀態是否同步，須以新一次實際能力查證確認；不能持續把舊拒絕當成目前事實。 |
| 指定歷史資料 | 人類要求刪除指定資料，並要求 generic 程式可公開、Production 證據私下保存；曾遇外鍵阻擋。 | 未取得刪除完成證據；來源、引用、可刪範圍與 recovery 仍需私下查核，不能擴大刪除引用資料。 |

Platform 細節沿 [同秒 SSO 修正](../../../Jenfu-Platform/ai-doc/dev_task.md#dev015-firebase-second-boundary-20261008)、[Google／憑證發布紀錄](../../../Jenfu-Platform/ai-doc/qa/DEV-015-google-pending-production-release-2026-10-10.json)。該 JSON 保留其 10 月 10 日當時的未驗結論；後來的使用者驗收另記於本表，不覆寫舊收據。

## 4. R81 的已知綁定與首次失敗

### 4.1 已取得的來源與收據

| 欄位 | 本 session 取得的值 |
| --- | --- |
| release ID | `DEV121-RDV7-20261016-R81` |
| PR／來源 | [AI-PDM PR #329](https://github.com/jedchang0308-jenfu/AI-PDM/pull/329)，merge `bde28d89ff401491274e5d55e37b548bc3fef8b7` |
| tree | `5b46d08c13c66e7d404479644f7d7f17c881ab9d` |
| source identity SHA | `5c5b26bf850cf69a9b520647a257372727ce65c8127dfb484c0ea11b1452ca41` |
| migration manifest SHA | `aaeaf357ac05d6a0074edf4a1b6449098e3433020f47e25cf85035dc149b73b8` |
| required CI | [run 38824202877](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/38824202877)：`DEV-012 Isolated PostgreSQL Cutover`、`Production Slice QC` 均 PASS。 |
| source-lock URI | `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV121-RDV7-20261016-R81/source-lock.json` |
| source-lock 物件 bytes SHA | `14e3ab295d46e878b14b0914a16b5cea3272070ca2d4f3e1b0f38fe44c6da9d6` |
| 新 infra reuse URI | `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV121-RDV7-20261016-R81/app-infra-reuse.json` |
| 新 infra reuse 物件 bytes SHA | `685afe8225bbbc6b2fce93f9d9ee86b8e1404fda400d0962e7819449affcf4ba` |
| 新 infra reuse 內部 receiptSha256 | `7c74bbc7a4fe5d1508e968b04b341619df8559521d181d7b905f9798dd76ceca` |
| producer 結果 | `infra-reuse / PASS`，GCS generation `1792113749110057`；readback 的 source 為上述 R81 commit。 |

物件 bytes hash 用於 `{uri, sha256}` reference；payload 內部 `receiptSha256` 用於其自身 canonical core 完整性。兩者不能互換，`sourceSha256` 也不是 source-lock 物件 hash。先前回答只寫「receipt SHA」的部分，依本表釐清。

官方 producer 曾使用的 foundation 為 R76 `foundation-infra.json`，物件 SHA `2fc5faab7701491bc392b485b372702aba01d01097d73ebc92c7ee9d40916d1f`；底層 provider infra 為 `DEV121-ADMIN-V6-RUNNER-ROTATION-20261005/app-infra.json`，物件 SHA `758efbcd81d1fd01986ac190a242854541dcb7d0ab9b35aba71580d9ea8d6698`。兩者均在同一 AI-PDM release bucket 的 `receipts/releases/` 下，由 B36-R10 的既有 reference 追溯取得。

這是 producer 產生及讀回的證據；不能單憑 receipt 的 PASS 另推論 10 月 19 日全部 executable inputs、provider 資源、branch protection 或發布前置檢查皆已通過。

### 4.2 失敗保留與更正

| 失敗點 | 已查明原因與處置 |
| --- | --- |
| R80 `OPENSWX_WORKER_PROFILE_INVALID` | 發生在 worker association 發布前；保留歷史失敗，不把它當成 R81 執行結果。 |
| `INPUT_PATH_OUT_OF_SCOPE` | 傳入絕對路徑；改用 allowlist 內 repo-relative input。 |
| `PROVIDER_TOKEN_INVALID` | 程式在建立 transport 時檢查 token 型態／長度；當次未提供合格的 `GOOGLE_OAUTH_ACCESS_TOKEN`。不能據此斷言 gcloud 登入或 token 已過期。後續由既有登入取得記憶體內短期 token。 |
| `GCS_READBACK_HASH_MISMATCH` | input 誤用 payload 內部 hash；改為實際 GCS bytes SHA。 |
| `INFRA_REUSE_INPUT_INVALID` | 舊版 producer 要求底層 `app-infra-receipt.v1 / PRODUCTION_PROVIDER`，當次卻傳 B36 reuse receipt；改用其明列的底層 provider ref 後 PASS。 |
| 缺 input 被多次當成外部阻擋 | input 是可由 AI 依 schema 與已驗 references 形成的工程工作；缺檔本身不代表要使用者手工建立或重新授權。只有實際憑證互動、存取拒絕或缺少權威來源才可能需要人類協助。 |

上述 producer 曾從過時且 dirty 的 AI-PDM canonical checkout 執行；既有 tracked 修改保留、暫時 input 已清除，但不能把這次執行描述成「唯一乾淨 writer」或完整受保護 CI 執行。後續須核對實際執行器版本及 source-bound receipt 的適用性。

## 5. 接手時的最小工作順序

1. 只讀確認目前工作樹、適用 AGENTS、native DEV、官方遠端來源、owner run／control／收據與真正服務 revision。保留既有 dirty 內容；R81 commit 不等於接手當天的 current main。
2. 先讀回已完成階段，確認是否有其他 owner 已接續。未知提交結果先查 provider；不因觀察逾時再提交 Job、build 或 owner workflow。
3. 依當前官方 producer／owner 契約，釐清 archive、worker descriptor、runtime、routine authority/readiness 與 intent 的實際依賴。先形成可獨立產生的缺口；不得把缺少本地 input 誤當外部阻擋，也不得猜測一定要完整 capsule 才能準備 archive。
4. PR #329 改動歷史證據讀取相關 source，不足以證明 worker 映像 executable inputs 有變。依 finite input／recipe／profile／歷史鏈驗證決定能否沿用既有 immutable image，再產生當次來源綁定的 archive／association／descriptor／readback。B36 舊 descriptor 不能冒充 R81；合格底層 artifact 是否可重用由等價證明決定。
5. 通過受影響邊界、required CI 與正式 gate 後，才沿既有 owner release 契約執行後續。若來源已前進，重新核驗機器綁定及證據適用性，不盲目重播 R81，也不改寫 R79／R80 原始失敗。
6. 正式 RD 驗收用兩個指定測試帳號，經正常 Platform → PDM 入口，驗圖號／料號編輯及送審、重新整理後資料與身分保持、核准拒絕；每項對齊 deployed catalog／consumer 與有效 grant。Dani／Peter 既有登入回報另外保留。

原 session 讀到的缺口路徑為同一 R81 release 目錄下 `runtime-config.json`、`owner-authorization.json`、`owner-readiness.json`、`release-intent.json`，以及該來源對應的 worker archive／input／readback。這些是最後已知未完成工作，尚未由本次文件任務重新讀回；「缺少 receipt」不等於其生成必須交由外部人員。

精確入口以 AI-PDM 當時 source 為準：`scripts/dev117-ai-pdm-prerequisite-producer.mjs`、`scripts/lib/dev012-owner-prerequisite-producer.mjs`、`scripts/dev122-openswx-worker-artifact-reuse.mjs`、`scripts/lib/dev122-openswx-worker-artifact-reuse.mjs`、`scripts/lib/dev122-openswx-owner-release.mjs`、`.github/workflows/deploy-ai-pdm-independent-production.yml`。這裡保存定位與依賴，不生成新的可執行發布包。

## 6. 驗收與停止條件

- 首次登入：有效身分＋有效授權＋無帳戶可正常登入；既有正常帳戶不重複建立；並行／重試只有一筆完整帳戶；無授權、失效、停用、離職、撤銷及衝突拒絕且沒有開通副作用。
- Google 延遲：原正常入口刻意延後選帳號後仍在同一有效 intent 完成；超時／取消／錯誤按既有規則結束。一般登入成功不能替代這個特定情境。
- RD：兩 fixture 分別完成圖號、料號、送審與 refresh 正例及核准拒絕負例。不能以 Portal 可見、API 單點或登入成功充抵。
- 發布：source、artifact、worker、catalog／consumer、必要 migration、recovery 與 provider receipt 的適用性完整；部署／切流須有各自真正結果。infra reuse PASS 不等於已發布。
- 依賴失敗即停止依賴它的寫入；同範圍診斷與修復可繼續。相同持久性拒絕未改變前不重試；工具權限問題不能用其他表面繞過。
- 歷史資料碰到 FK 先查業務引用及精確刪除授權；公開 repo 只放 generic 程式，Production 個案證據私下保存。未查明前不擴大清理。

## 7. 前版 Brief 交付與剩餘範圍（歷史）

前版只完成 Brief 與索引更新，當時未達 `RD Implementation Ready`。本次人類要求補到可直接交 RD，新增 §8–15 的工程契約與 readiness 查核；沒有因此將未執行的應用測試、型別檢查、瀏覽器驗收或發布改成 PASS。

登入／首次開通的已發布修正與人類驗收證據可各自認列；Google 特定延遲情境、RD 正式驗收、worker 歷史證據承接及指定歷史資料處置，沿原任務保留未驗／未完成。DEV-122 原 `7 issues / 29 groups` 分母與使用者持有的 native CAD 驗收義務不縮減。

本 session 最後一次 AI-PDM provider readback（2026-10-16）為 `ai-pdm-prod-1be8986b68ce` 100%；它是歷史快照，不是 10 月 19 日現況。R81 當時只新增官方證據物件，沒有取得新 runtime 部署／migration／切流證據。較早的 Platform／AI-PDM 已成功發布仍保留各自原始紀錄，不能概括寫成「整個 session 沒有正式變更」。

<a id="cross-project-rd-contract"></a>

## 8. Current Phase RD Handoff Contract

### 8.1 主責、授權與交付範圍

本交接以 `AIPDM/DEV-121` 為主責整合任務、`AIPDM/DEV-122` 為既有 worker／可靠發布實作任務；`JENFU/DEV-015` 只保留來源及登入／SSO 相依，不再作本文件的協調主鍵，也不重開已完成的 Principal-only 主線。跨專案交付由各 owner 的 native DEV 認列。引用依序為 `JENFU`＝Jenfu-Platform、`AIPDM`＝AI-PDM（本地資料夾 AI_PDM）、`ORGMASTER`＝OrgMaster。各 repo 只操作自己的 schema／source／發布資源，中央文件不成為第四套執行器。

權威入口：[Platform DEV-015](../../../Jenfu-Platform/ai-doc/specs/DEV-015-authentication-authorization-boundary-refactor.md)、[AI-PDM native 任務](../dev_task.md)、[AI-PDM DEV-121](DEV-121-target-authorization-boundary.md#rd-capabilities)、[AI-PDM DEV-122](DEV-122-ai-pdm-internal-function-issues.md)、[AI-PDM release adapter](SPEC-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001-app-owned-release-adapter.md)、[OrgMaster native 任務](../../../OrgMaster/ai-doc/dev_task.md)、[OrgMaster DEV-057](../../../OrgMaster/ai-doc/specs/DEV-057-identity-and-grant-contract-boundary.md)。本文件收斂交接；原 owner 契約仍管理 schema／執行器，RD 修改對應 gate 時須在同一 owner 同步直接契約及測試。

| 專案／既有 DEV | 本輪 RD 責任與輸出 | 可修改面／禁止擴張面 |
| --- | --- | --- |
| `JENFU/DEV-015#google-popup-pending`、既有同秒修正 | 驗證已發布的 popup 延遲接續與 Firebase 同秒規則；僅在原案例重現缺陷時修正登入／SSO 及其測試。提供既有登入／SSO 的相依驗收結果；跨 owner 驗收由 AI-PDM DEV-121 收斂。 | `src/app/login/login-client.tsx`、其 test、`src/lib/auth/sso-handoff-service.ts`／test、相關 intent／session 呼叫端。沒有新 Platform schema 或新的 PDM 開通邏輯。 |
| `AIPDM/DEV-121#target-authorization` | 維護已存在的首次開通交易、唯一性及 session 建立；補原始案例、並行、rollback 與撤銷回歸。 | principal handoff/account/admission/grant/session 模組及其現有測試；083 已存在，不重寫或重新建立已套用 migration。 |
| `AIPDM/DEV-121#rd-capabilities` | 交付 v7 單項能力修正、085 相容／交易驗證、正常 RD 操作及核准拒絕。 | catalog v7、builder、consumer、085、對應 route／permission tests；不新增 RD 核准、發行、管理權，不改其他八角色。 |
| `ORGMASTER/DEV-057#catalog-v7` | exact v7 artifact 的 repository／registry／governance reader 及 packaging 相容；保留 v5/v6 與中央指派。 | `server/aiPdmRoleCatalogRepository.ts`、`server/applicationRoleCatalogRegistry.ts`、`src/governance/aiPdmCatalog.ts`／`aiPdmRoleCapability.ts`、相應 tests、`config/catalogs/ai-pdm-role-catalog.v7.json`；不重寫 assignment、Employee 或新增 OrgMaster migration。 |
| `AIPDM/DEV-122` 的既有 worker 歷史證據／可靠發布切片 | 來源封存準備、finite executable reuse、歷史 profile／history basis 驗證及 owner evidence 接縫修正。R81 只作歷史追溯。 | §11 的現有 prerequisite／worker／proof 模組、測試及直接契約；不另建大型開通或發布架構。 |
| `AIPDM/DEV-117`、`ORGMASTER/DEV-040`、`JENFU/DEV-012` | 已有 owner release／來源／recovery 契約，提供每個切片自己的發布門檻。 | 只有直接受影響的 owner executor／契約才修改；不重播初次三 app cohort、不要求 sibling checkout 當 release input。 |

人類授權依原始訊息延續：Platform 本地修正及 own protected Production deploy／切流；AI-PDM 首次開通與後續 RD／歷史證據修正及 own protected 發布；OrgMaster v7 相容及 own 發布。使用者另有具名測試帳號／Jed 登入登出、Dani 指定開通、指定歷史資料刪除、個別憑證續接與事故訂閱恢復授權；這些只涵蓋各自原範圍，不變成任意帳號、Secret、IAM 或資料清理權限。機器綁定改變不重問原授權。

2026-10-19 版本只在 Platform 交付本文與索引，AI-PDM／OrgMaster source 當時只讀對照。2026-10-20 依人類要求正式移交 AI-PDM：只遷移本文、同步兩邊直接索引及 DEV-121／DEV-122 交接引用，保留所有既有 dirty 內容。未啟動程式實作、產品測試或正式操作。

### 8.2 明確排除與另案保留

- `AIPDM/DEV-123` 權限編輯器及 `ORGMASTER/DEV-058` 動態目錄／集中指派是既有獨立文件任務，維持各自狀態；本輪不把靜態 v7 修正升級成動態政策系統。
- DEV-122 的管理員智慧辨識、完整 PDF 預覽及 native CAD 仍沿原 7 issues／29 groups；不是 RD v7 交付的必要依賴。原生 CAD 正式驗收由使用者持有，supplier 維持延期。
- 指定歷史資料清理維持精確個案及私有證據；不納入 085 或 archive producer 的執行包，也不由本文件自動恢復清理。
- 不新增 cloud resource／IAM／Secret、credential rotation、billing、跨 schema 寫入、手動正式 SQL 或 down migration。遇到原授權不含的責任才另提一個具體人類決策。

### 8.3 本次讀取基準與 source 適用性

| 路徑／用途 | 2026-10-19 本地讀取結果 | RD 接手規則 |
| --- | --- | --- |
| `C:/VIBE CODING/Jenfu-Platform` | branch `codex/tool-fixture-maintenance-isolation`；HEAD `bc296cc28b1261d3593b3b686904bc2f66b3142e`；本文件／索引及其他既有 untracked 內容保留。 | 不把此 branch 當 Production source；本文件切片不混入其他開發內容。 |
| `C:/VIBE CODING/AI_PDM` | `main`，HEAD `d3fc1bf72b3630f8a748746c40584e595d396dac`，相對當時 cached origin/main 落後 284 commits；有既有文件 dirty／untracked。 | 只能作 canonical 與歷史文件入口，不從該 dirty checkout 再執行發布 producer。 |
| `C:/VIBE CODING/AI_PDM/.worktrees/dev122-rd-prod-c59-pair/AI_PDM` | 既有 task worktree；detached clean HEAD `89dd40b6efcf00b3554455efce92255362460ec0`，等於當時 cached origin/main。 | 本契約 release source 程式對照基準。這不證明目前 GitHub ref 或 Production；不得擅自接管此 worktree 的 writer、runtime 或發布。 |
| `C:/VIBE CODING/OrgMaster` | branch `codex/dev058-docs-submission`，HEAD `101a51b707b9032472f00291e8a358381dc180e8`；既有 AGENTS dirty 保留。 | 使用已存在的 v7 reader／tests；DEV-058 文件工作不併入本切片。 |

AI-PDM canonical 與 C59 的 account repository、handoff session service、published grant validation、083／085 bytes 相同；`db-async-provider.ts` bytes 不同，接手以所選 clean source 的交易實作與測試為準。本次核對的 C59 仍有 SERIALIZABLE 最多三次、只對 `40001`／`40P01` 的 transaction retry。

OrgMaster native [2026-10-19 owner 出口](../../../OrgMaster/ai-doc/dev_task.md#dev040-production-release-20261019)已記錄 own 十階段發布及事後 readback；它更新較早的「OrgMaster 發布待完成」快照。這是此次讀回的 owner 文件證據，未在本輪重新查 provider，也不等同 AI-PDM v7 已啟用或跨專案 RD 已驗收。

## 9. Current Architecture Impact 與資料／API 契約

### 9.1 權威與版本化介面

| Producer → Consumer | 實際介面／內容 | 必要驗證與寫入邊界 |
| --- | --- | --- |
| Platform → AI-PDM | `/api/sso/authorize`、`/api/sso/token` 交接；PDM `/api/auth/jenfu-sso/start`、`/callback`；`jenfu.sso-handoff.v2`。 | code/state/PKCE、預期 issuer／audience／redirect、有效期限及安全 returnTo；驗證後的 identity/authentication/authState 才進 admission。瀏覽器輸入不能作權威 Principal 或 Employee。 |
| OrgMaster → Platform／PDM | `orgmaster_contract.v_active_principal_accounts_v1`：active Principal、Employee、provider pair、accountType、mappingVersion、publishedAt。 | exact verified issuer/subject → 唯一 active typed identity；Employee active、映射版本與發布時間相符。不得用 Email 相似、UID fallback 或歷史帳戶名稱連結。 |
| OrgMaster → PDM | `orgmaster_contract.v_ai_pdm_principal_effective_grants_v4`，wire contract `jenfu.orgmaster.ai-pdm-principal-grants.v4`。 | 同一 assignment publication snapshot、effective role／scope／時間、撤銷與 deny 優先；以 DB transaction timestamp 決策。無 grant 或 source 錯誤皆不得 provision。 |
| PDM → OrgMaster／PDM evaluator | `ai_pdm_contract.v_application_role_catalog_v1`、immutable v7 artifact。 | PDM 唯一 active publication、full role metadata、kind/code、catalogVersion／canonical SHA；OrgMaster exact reader 相容。版本 namespace 各自驗證，不把 catalogVersion 當 authEpoch。 |
| PDM 交易 → 登入狀態 | `users`、`principal_accounts`、`principal_identity_operations`、`principal_identity_cutovers`、principal session registry。 | 只寫 `ai_pdm_core`，同一資料庫交易；對外 session cookie 只能在交易 commit 後由 response helper 設定。資料與 registry 失敗一併 rollback。 |

此切片不新增跨 app runtime API、schema owner 或多租戶模型。已存在的 versioned view 不改名、不改欄位；若查核發現真的要破壞介面，停止該動作並回 owner 原 DEV 補相容契約。

### 9.2 首次登入的實作順序與原子性

維護 `issueSessionForPrincipalHandoff` → `JenfuPrincipalAccountRepository`，只在 `principal_account_missing` 進入首次建立分支：

1. 驗 handoff／issuer／時間；在 SERIALIZABLE transaction 設現有 statement／lock timeout。
2. `requireActiveTypedPrincipal`、canonical authEpoch 與兩個 revokedBefore 檢查；typed Principal／Employee 必須等於已驗 handoff，保留原 `<= revokedBefore`。
3. 已有 active account：核對 accountType／Employee／company／profile 關聯與有效 grant，不能重複建立。inactive、conflict、dependency error 直接拒絕，不走 ensure。
4. 缺 account：先 `validatePrincipalPublishedGrantSnapshot`，再呼叫已存在的 `ai_pdm_core.ensure_authorized_first_login_account_v1`。函式重驗已發布 identity／grant，使用 advisory transaction lock 及唯一性，沿既有 operation／cutover 稽核能力建立完整資料。
5. company 沿現有受控 `company-jenfu` 及既存 company row；不能由 request／Email domain 推定新公司，缺 company row 即拒絕，不由登入流程建立公司。legacy `users.role='Engineer'` 不是授權來源。
6. 重讀 active account、profile；重新確認 proof 未過期，沿 sourceSessionExpiresAt 上限與 sessionInvalidBefore barrier 建 session 並註冊 registry，交易提交後回應。

交易競態僅由既有 provider 對 `40001`／`40P01` 最多三次重跑完整交易；其餘錯誤不自動 retry，不在 service 疊加無限 retry。注入 cutover／registry 失敗時，帳戶、關聯、operations／cutover、registry 都不能部分提交。JWT 即使在交易中產生，也不能在失敗後回到瀏覽器。

### 9.3 Google 延遲接續及錯誤分型

Platform 維護同一原始 popup Promise，20 秒 checkpoint／最多 5 秒 current-user recovery 都受原 intent deadline 約束；callback 真 resolve／reject 立即處理。300 秒 intent 到期前不因單個 checkpoint 丟棄或重建；到期後沿原安全 retry，不延長 TTL。click handler 同步開 popup，維持 user activation；already-authenticated 只導到驗證過的 returnTo。

問題記錄使用既有 callback `stage`、redacted reason、時間及安全 correlation，不記 token/code/cookie。分類固定為 credential refresh → Platform session → broker exchange → typed identity／grant → local account → session issue → application capability。`principal_not_active` 是 UI 映射，需再分 admission inactive／local inactive；`auth_token_invalid` 不代表 RD 缺權限，`permission_not_granted` 不代表 SSO 401。缺實際 revokedBefore readback 時只列推估，不寫已證實根因。

## 10. RD v7 實作、相容與 migration 契約

| 欄位 | 固定值／行為 |
| --- | --- |
| catalogVersion | `ai-pdm.role-catalog.2026-10-10.v7` |
| catalog canonical SHA | `4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9` |
| canonical LF artifact SHA | `121ca7cd424b9d919cb9217516c0c5f6dcec3879ee389b0d676b9dd62cb0d94d`；本地 Windows CRLF 檔案 hash 不當成這個 Git/archive LF hash。 |
| 實際單項 delta | 只有 `rd` 增加 `{kind:'page', code:'numbering.drawings.view', allowed:true}`，既有 31 permissions、其他八角色與其 metadata 保持。 |
| 既有允許／拒絕 | `page:numbering.search`、`action:numbering.workspace.create/view/update`、`numbering.draft.update`、`numbering.candidate.review.submit` 依既有 scope／資源狀態工作；`action:approval.request.decide` 仍拒絕。 |
| 085 | `db/postgres/085_dev121_principal_role_catalog_v7.sql`，profile order35；source SHA `308fad28b4abfe1bc2106b79c1f410fad2cf2f6c2a0b3559517362f4ba6e7cba`，compiled applied SHA `80e7085085a3bf8d220917a4790224b52a54cc2af788a0775d7aaedd629ce65b`。 |

本次 source 自查已比對兩 repo v7 artifacts bytes 相同，canonical metadata 相符、RD added 一項／removed 零項、其他八角色完全相同；這是來源核對，不是 DB publication 或正式權限驗收。

先交付／確認 OrgMaster v7 compatible reader，保留 v5/v6 exact metadata/hash guard 與原指派 provenance，再由 PDM 自己的 governed migration／consumer 啟用 v7。不得為缺能力重寫 Employee assignment，亦不得用 page/action fallback。

085 只可沿原 full35、writer fence、publication CAS／single-active／transaction／replay guards；已 applied 時驗 ledger 與原 checksum 後 replay，不修改 migration。若目前 pending，採既有受控維護路徑及 DB-free maintenance recovery；不得用 B35 read-only33／closed34 program-only 宣稱發布085。084 歷史清理不與本切片綁同一 intent。v7 publication 後舊 v6 binary 可能 fail closed，回復不得降 schema 或恢復不相容 binary。

## 11. Worker source 準備與歷史證據承接契約

### 11.1 目前 source 已確認的接縫

在 C59 基準：`createGitArchive(root, sourceRevision)` 已在 `scripts/lib/dev012-owner-stage-executor.mjs` 提供固定 Git tar bytes；owner build 在完整 intent 後才上傳 source。另一方面，`executeWorkerArtifactReuse` 要求 input 已含 `currentSourceObjectRef`，runtime-config 又需要 current-source worker descriptor。只有這個依賴需要補成可執行接縫，不能停在「請外部提供 input」。

本切片採最小工程決策：在現有 prerequisite producer 增加 `worker-source` stage。這是待 RD 實作的增量入口，**目前不是已存在可直接執行的命令**；不新增 HTTP API、新 repo、新 Job 或第二個 owner framework。

### 11.2 `worker-source` 的輸入／輸出與副作用

- 位置：`scripts/dev117-ai-pdm-prerequisite-producer.mjs`、`scripts/lib/dev012-owner-prerequisite-producer.mjs`。沿用 `--stage`／`--release-id`／`--input` parser 與 `output/dev-012/inputs/` repo-relative realpath guard；擴充 STAGES 與單一 branch，不放寬其他 stage。
- input exact schema：`{schemaVersion:'jenfu.dev012.owner-worker-source-input.v1', sourceLockRef:{uri,sha256}}`；不接受自選 source revision、目標 bucket、輸出 prefix、SQL、command、stage override 或 source path。release ID 仍用原 parser 驗證。
- 先由 transport 讀 bytes／hash／generation-bound source lock，再驗 own repository／owner、releaseId、clean frozen checkout、Git tree／identity／migration manifest 與原 source fence。source lock 或 HEAD 漂移必須在任何 put 前拒絕。
- 以現有 `createGitArchive` 產 LF tar、`gzipSync` level9，禁止工作目錄檔案、非 tracked bytes、sibling checkout 或舊 R80 archive。輸出 URI 由 producer 固定推導為 own bucket `source/releases/<releaseId>/<archiveBytesSha256>/source.tar.gz`。
- 用既有 transport create-only `putBytes` 發布及同 URI readback，結果回 `{uri,sha256}`、generation、CRC32C；此階段不產生自述 PASS receipt、不 build image、不建立 session、不操作 Job／Scheduler／DB／traffic。
- 同 URI exact bytes 已存在時讀回採納；未知 put outcome 先 metadata／bytes readback；不更換 prefix、overwrite 或重送 build。確認 mismatch 為永久失敗並保留第一錯誤。
- 新 stage 只解除 source bytes 前置需求。owner build 的既有完整 archive／manifest／source guard 保持，後續 worker／app source 比對必須一致；物件準備成功不是 owner prepare 或正式 build 成功。

### 11.3 reuse、DAILY 與 history basis

由 source-lock／新 archive／目前權威 prior activation／deadline 依原 exact worker input schema 形成 input，透過官方 transport 發布 input（非手寫 receipt），再交現有 `dev122-openswx-worker-artifact-reuse.mjs`、`executeWorkerArtifactReuse`／`verifyWorkerArtifactReuse`。actor、mode、deadline、源檔 allowlist 及 numeric metadata 權限沿當前 profile；READY／ENABLED 與 PAUSED repair 是不同模式，不從舊 B36 snapshot 推定當前狀態。

finite executable manifest／Docker recipe／builder／profile 與原 provenance、scan、source archives 均等價時，可沿用 immutable worker image，另產本次 source-bound association／descriptor；不因 PR #329、release ID 或純文件改變重建映像。真正 executable delta 才按既有 builder／rotation gate 產生新 artifact。PR #329 改 release reader 不能單憑檔名當作 worker binary 變更。

原生歷史重新定基沿當前 `dev121-owner-release-proof.mjs` 的 `deriveAiPdmNativeHistoryBasis`／`qualifyAiPdmNativeHistoryBasis`／ingress helpers 及 profile-context／historical reader，保留八層 transition／cycle 保護。必須完整驗 issuer source-lock、每個 object bytes hash／source、歷史 profile／manifest／policy、原 clock／deadline、cycle／depth 與 basis qualification。basis 只能由驗證成功的原生路徑產生；錯 issuer、缺歷史、tamper、遞迴 basis、未合格 root、較新 profile 替代舊 profile 都拒絕，不能任意清空 ancestry 或延長時鐘。

ordinary full35 如需 DAILY，沿原 pause/drain、原生 checkpoint、selftest、full descriptor 流程；已完成的 bootstrap／selftest 不能因 descriptor unknown-write 再執行。相同 immutable descriptor 可精確 adopt，維持資源現況。B35 closed34/effective33 與 full35 fixtures 各 pin 自己來源與 policy，不混入同一 oracle。這些規則只在共用 release/recovery inputs 實際受影響時成為 RD v7 依賴。

現有 C59 `infra-reuse` producer 已產生 `app-infra-reuse-receipt.v2` 並驗 live migration Job；R81 v1 留作歷史。續接必須用當時 executor 允許的版本與 proof，不因本文件保留 v1 就降級現行驗證。

## 12. 相依順序與獨立交付

| 切片／native DEV | 可開始條件 | 必須完成後才可承接的下游 | 不必等待 |
| --- | --- | --- | --- |
| Platform popup／同秒回歸，`JENFU/DEV-015` | 原已發布來源與對應 regression 可定位；原路徑可重現或特定情境可驗。 | 任何實際 Platform source 修正都須自己 tests／required CI；跨 app驗收使用已知相容 Platform baseline。 | PDM 085、PDF、worker 歷史清理。 |
| 首次開通，`AIPDM/DEV-121` | typed Principal／effective-grants 契約、已發布 catalog 可用；缺帳戶 synthetic fixture。 | 原子性／拒絕／並行本地結果與正常入口登入＋reload。已存在083先讀回，不重新套用。 | RD 額外圖號能力、無關 worker/PDF。 |
| OrgMaster exact v7，`ORGMASTER/DEV-057` | PDM immutable v7 artifact／metadata 已固定。 | compatible reader source／packaging／tests與 own release evidence通過，才允許 PDM 啟用 v7。已證完成則沿用，不重發。 | PDM 新畫面、DEV-058／123 動態能力。 |
| archive／worker proof，`AIPDM/DEV-122` | 選定 clean source、原 source lock、existing provider state／proof 可核驗；唯一 writer 已確認。 | source object → reuse input → association／descriptor／readback → runtime-config；再 authority/readiness → intent。共用修正走同一 PR 收斂。 | OrgMaster 無關 UI／PDF／辨識業務功能。 |
| RD v7，`AIPDM/DEV-121` | OrgMaster v7 相容成立；v7／085／consumer／受影響 release inputs 及 recovery 完整。 | PDM own governed migration／release gate、兩 fixture 正常 UI 編輯／送審及核准拒絕。 | DEV-122 全 7/29 結案、Dani 重登、歷史個案刪除。 |

接手順序：先只讀 owner control／active runs／已完成收據，確認是否已有 C59 或較新 source 執行；與唯一 writer 交接，才選受影響 source。接著平行進行獨立本地 source／tests工作；OrgMaster 相容必須先於 PDM catalog 啟用。producer 前置證據先於 paid build；真正 required gate 先於正式動作。R81 不再被預設為唯一當前嘗試；沒有 provider readback 就不宣稱新的唯一 blocker。

AI-PDM 正式 service-state／RD permission-state 診斷沿現有 `scripts/dev117-production-diagnostics.mjs` 與既有受保護 `.github/workflows/read-ai-pdm-rd-permission-state-production.yml` 的 closed operation；分別使用既有 verifier／deployer 權限，不為另一組只讀查詢建立新 WIF／IAM 或任意 SQL Job。本文件未 dispatch 該流程。

## 13. 可修改檔案與針對性驗證入口

所有命令只在所屬 repo、已授權的 task-owned clean 開發環境執行；本文件任務未執行下表產品測試。先讀適用 Next.js guide 再改 Next source。隔離資料、runtime PID／port、PDM_DATA_DIR／PDM_REPOSITORY_DIR、cleanup 按 owner 規則記錄；不把 Production 資料當 fixture。

| owner／行為 | 實際檔案／現有測試入口 |
| --- | --- |
| Platform popup／撤銷 | `src/app/login/login-client.tsx`／`.test.tsx`；`src/lib/auth/sso-handoff-service.ts`／`.test.ts`、`managed-login-service.test.ts`。用 repo 既有 Vitest（`--root src`）選定案例，再 `npm run typecheck -- --incremental false`；不載入 .next 歷史拷貝。 |
| PDM 首次交易 | `src/lib/jenfu-principal-handoff-session-service.ts`、`jenfu-principal-account-repository.ts`、`jenfu-principal-published-grant-validation.ts`、`jenfu-sso-handoff.ts`、`db-async-provider.ts` 與對應 tests；`npm run qc:dev-121:first-login-postgres` 實際啟 task-owned disposable PG。 |
| PDM v7／085 | `config/access-control/jenfu-role-catalog.v7.json`、`scripts/dev121-build-principal-role-catalog-v7.mjs`／test、`src/lib/jenfu-principal-role-catalog.ts`、`db/postgres/085_dev121_principal_role_catalog_v7.sql`；`node --test scripts/dev121-build-principal-role-catalog-v7.test.mjs`，現有 `scripts/qc-dev-121-rd-capabilities-postgres.mjs` 用 repo 所需 TS loader 執行（下一列）。舊 `qc:dev-121:role-catalog-postgres` 只涵蓋較早版本，不能替代 v7 PG cases。 |
| PDM v7 PG 入口 | `node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-121-rd-capabilities-postgres.mjs`；輸入包括 compiler 的 exact085、full35 fixture、v6 baseline 與 v7 metadata；不得改用 persistent DB。 |
| PDM UI／API capability | `src/app/api/numbering/drawings/route.ts`、`drawings/workbench/route.ts`、`roots/[rootCode]/route.ts`、`records/[rootCode]/draft/route.ts`、`src/app/api/numbering/approval-decisions/route.ts`、`src/app/api/approvals/requests/[requestId]/decisions/route.ts` 與 principal tests；`src/lib/numbering-permission-guard.principal.test.ts`、`numbering-navigation-permissions.test.ts`。沿現有 canonical workbench，不創新業務 route。 |
| OrgMaster v7 | `server/aiPdmRoleCatalogRepository{,.v7.test,.compatible.test,.postgres.test}.ts`、`server/applicationRoleCatalogRegistry{,.test}.ts`、`src/governance/aiPdmCatalog{,.test}.ts`、`aiPdmRoleCapability{,.test}.ts` 及 artifact。選七個既有相容 tests；型別檢查使用 repo 既有 `tsc --noEmit`。SQL 變動才加 db-boundary；本切片預期無 Org DDL。 |
| Worker／archive／歷史 | §11 producer、`scripts/lib/dev012-owner-stage-executor.mjs`、`dev122-openswx-owner-release.mjs`、`dev122-openswx-bootstrap.mjs`、`dev122-openswx-profile-context.mjs`、`dev122-historical-reader.mjs`、`dev121-owner-release-proof.mjs`，對應 prerequisite／worker-reuse／bootstrap／owner-proof tests。先選 source-lock/archive／reuse／basis／failure-recovery 案例，再依 shared release input 跑 owner required checks。 |

PDM 每個實際 source diff 先走 `scripts/plan-production-slice.mjs`／`scripts/run-production-slice-tests.mjs` 的既有 changed-responsibility 選測；unknown／shared release 變更保留 full gate。需要時跑 `typecheck:app`、`typecheck:workspace`、`check:db-boundary`、`build:isolated`，release adapter 用原 `test:dev-117:continuous`／`qc:dev-117:continuous`／`test:dev-117:abort`。provider required checks 固定保留；文件檢查、選測計畫、mock PASS 都不冒充產品或正式證據。

## 14. 驗收案例、交付路徑與證據層

以下 case labels 只是本文件引用，不是新 DEV 或完成率分母。原 DEV case IDs／7 issues／29 groups保留。

| case／owner | 前置與操作 | 必須結果／證據層 |
| --- | --- | --- |
| LOGIN-TIME／Platform | synthetic authenticatedAt 等於、晚於、早於 Firebase 基準；交叉 disabled／unverified／Email mismatch／revokedBefore／epoch。 | 前兩者允許、較早及其他安全拒絕保留；unit/service RED→GREEN，原 Firebase `<` 與 Principal `<=` 各自成立。 |
| LOGIN-LATE／Platform | 實際 `/login` 按 Google，在 30～40 秒完成；另驗 recovery 期間 popup cancel、300 秒到期及其他分頁已登入。 | 延遲但有效時只用同一 intent exchange一次；錯誤立即結束、無額外 session；到期不能沿舊意圖成功。fake timer 及真實 Google 正常 UI 結果分開留。 |
| FIRST-ALLOW／PDM | synthetic有效 typed identity＋published grant，初始 users／account／operation／cutover／registry 無該人；走 handoff→issue。 | 首次建立一套資料及session，reload維持同身分；isolated PG／service，加正式正常 Platform→PDM 入口另證。fixture不得先seed要驗的account。 |
| FIRST-REPLAY／PDM | 既有 active account；同Principal重試及並行首次handoff。 | account/profile/operation/cutover不重複，session按正常多次登入契約建立；無孤兒／跨公司連結。PG並行與三次以內序列化retry。 |
| FIRST-DENY／PDM | no grant／expired／inactive employee／suspended/offboarded／epoch/revoked／provider-pair或P/E衝突。 | 無新增帳戶或開通紀錄、無成功session；停用不恢復。每個原因按邊界分類，沒有fallback。 |
| FIRST-HISTORY／PDM | 有效身分／授權，同Email或相似名稱的歷史profile存在。 | 歷史資料不修改、不刪除、不以Email連結；無實際唯一性／身分衝突時仍依權威identity建立自己的完整帳戶，不能只因相似Email拒絕。真正conflict拒絕且零部分資料，由既有治理另處理。 |
| FIRST-ROLLBACK／PDM | ensure過程、cutover、registry或proof到期前注入失敗。 | 同一交易所有新資料rollback；沒有對外cookie。PG readback及response行為均驗。 |
| CATALOG-COMPAT／OrgMaster | exact v5/v6/v7、未知／hash-tamper／scope漂移、真實active publication缺少。 | 只接受受支援且完整的active來源；無DB publication時不得靠vendored fixture成功；既有assignment provenance不重寫。source／disposable PG／API各列結果。 |
| CATALOG-ATOMIC／PDM | v6 baseline、compiled085；tamper、兩個並行publication、exact replay。 | 一個active publication、完整九roles、舊版歷史保留、baseline或metadata錯誤全rollback；v6 consumer不偽裝相容v7。 |
| RD-UI／兩fixture | `dev014-fp-google@jenfu.com.tw`、`dev014-fp-number@jenfu.com.tw` 逐一正常Platform→PDM→圖號／料號工作台，用既有核准fixture/draft編輯並送審，再Ctrl＋R。 | 清單、detail、實際保存及送審均成功；reload後資料／身分相同；讀取當次actor、active grant及deployed catalog/consumer。直接API200不替代導航UI。 |
| RD-DENY／PDM | 同兩fixture嘗試approval decision；再用synthetic跨company/workspace、expired/revoked／unknown kind-code負例。 | 核准403且無decision/business receipt或資料異動；scope/撤權拒絕。不能只隱藏按鈕；正例不可由Jed/system_admin代做。 |
| ARCHIVE／PDM | clean source-lock、source drift／wrong owner／hash／未追蹤檔／Windows CRLF／重試／unknown put。 | canonical tar/gzip bytes與owner／worker reader一致；drift在put前拒絕；同bytes adopt，mismatch拒絕；0 image/Job/DB/traffic效果。 |
| HISTORY／PDM | 原R79/R80歷史fixture、八層／第九層、cycle、wrong profile、clock／source/hash／nested basis／issuer tamper。 | 在原有效失敗位置拒絕；完整合格原生basis才可承接，不能以重定基消掉原保護；保留counterexample原FAIL與修正後各自結果。 |
| OWNER-CONTINUE／各owner | 從provider已完成stage／unknown submission／失效credential／stored browser deny接手。 | 先readback，未漂移證據重用；同input不重build／重送Job；無token輸出；只停止受阻邊界並回報精確first failure。 |

正式兩fixture既有授權用於正常登入登出與RD驗收；使用現有已核准測試業務資料，不以Dani／Peter或任意真人資料作fixture。若缺適格非自己reviewer／核准fixture，送審案例標阻塞並指出該條件，不自動升權或新增管理員。Dani／Peter的人類登入／reload回報繼續單獨認列，不要求其重登才能交付RD切片。

工具已儲存拒絕先做一次當前能力查證；無法操作時保留精確拒絕。不能用另一瀏覽器的成功覆蓋原路徑失敗，也不要求使用者再提供密碼、cookie、token。只有真實Google互動／MFA無法接管或既有operator重新認證需要人類時，提供該一次操作的詳細步驟。

每個slice交付留下 source／artifact／環境、actor類型、fixture邊界、正常與拒絕案例、持久化結果、測試命令及結果、第一失敗、未驗與cleanup。私有Production資料留owner私有證據，不提交公開repo。RD自查不稱獨立QC；文件一致性不稱SQL、UI、Release或L4 PASS。

## 15. Failure Recovery、Release Impact 與 RD Readiness Review

### 15.1 停止與恢復

- Identity／grant依賴不可用：拒絕session/provision，保留可識別邊界；不建立預設grant、不恢復停用帳戶。
- 交易失敗：由既有transaction rollback；只對規定的序列化錯誤bounded retry。既有已停用／歷史資料不作補償改寫。
- Artifact／receipt未知寫入：同URI generation／bytes讀回；確認成功才承接，矛盾即停；不重寫舊receipt或任意新attempt掩蓋錯誤。
- 憑證問題：先確認是缺環境token、無效token、Platform session撤銷或Secret version pin漂移。沿既有具名reauth／rotation流程，未涉及已授權變更時不新增版本／IAM。
- 正式pending catalog migration：只走已有source-bound maintenance／fence／recovery條件；不降migration、不把program-only模式當替代。各owner自己回復，中央文件沒有traffic控制權。
- 歷史資料FK／瀏覽器持久拒絕：保持原現況並只停受影響動作；查引用／權限狀態，不能擴大刪除或繞過政策。

### 15.2 Release Impact Note

變更類型為PDM catalog／consumer及forward-only085、source/archive／evidence producer，Platform只有重現缺陷才變runtime；OrgMaster僅exact v7相容，無新的DB migration。原來源保護、required CI、single-capsule、recovery、consumer先相容與artifact等價證明保持。新`worker-source` stage改release executable inputs，後續應由既有適用性證明決定reuse／rotation，不能沿用R81舊v1收據直接宣稱新executor已就緒。

部署、migration及切流結果由各owner自己的真實receipt認列；本文件不產生capsule、不預寫正式操作／rollback命令，也不以來源核對代替provider保護或Production readiness。

### 15.3 2026-10-19 RD Readiness Review

| 檢查面 | 已鎖定的接手內容 | 本次核對結果 |
| --- | --- | --- |
| 主責／授權／native ID | §8，AIPDM121主責／122承接實作；JENFU015來源相依及相關release owner、ORGMASTER057；排除DEV058/123新實作。 | 對照人類訊息與三repo直接入口；無新增native DEV或擴權。 |
| source／文件／現有程式 | §8.3、§13，含過時dirty canonical、C59 clean source與OrgMaster native最新文件。 | 只讀Git及檔案PASS；正式source/provider現況未重查，列為執行前狀態檢查。 |
| 資料／API／權限 | §9/10的versioned views、first-login函式、session交易、immutablev7與單項delta。 | 實際source／artifact核對PASS；v7兩repo同bytes、其他roles不變。 |
| 交易／重試／migration | SERIALIZABLE、advisory lock、三次retry、atomicregistry、085 baseline/CAS及維護相容。 | 原模組／SQL／測試入口可定位；未執行產品／PG測試。 |
| 接縫修正／history | §11明列待實作worker-source parser/input/output/create-only及禁止副作用；沿現有basis qualification。 | 已定位真正依賴；不再把input形成交給外部或推定需要新worker image。 |
| 驗收／復原／交付 | §12–15，分owner順序、正常UI／拒絕／並行／未知寫入／歷史反例及layer限制。 | 有可執行本地入口與正式驗收條件；Live actor、DB、browser、release條件由執行時讀回。 |

結論：本文件的具名工程切片已達 `RD Implementation Ready`，可交RD在既有授權及當時owner規則下實作／補驗；沒有未決產品語意需要先問人類。正式環境可用性與收據現況是執行時前置條件，未驗部分不記PASS。未作獨立架構審查，不新增「架構已定案」或整個DEV完成宣告。
