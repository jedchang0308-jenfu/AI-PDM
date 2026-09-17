# DEV-118：平台登入入口對齊與 Google／工號身分契約

- 文件成熟度：`118-A RD Implementation Ready + 架構定案（PDM 本地入口）`；`118-B RD Contract Ready / Registered—Platform DEV-014 / 014-LOGIN`；`118-C Release Gated`。
- 工作狀態：118-A PDM 本地實作與 QA/QC 已完成；118-B 已取得兩專案文件授權並登錄 Platform `014-LOGIN`，工程契約與實作仍待完成；118-C 維持 `Release Gated`，正式整合尚未驗收。
- 建立：2026-09-16；本次決策修訂：2026-09-17。
- 來源 ID：`DEV-PDM-PRODUCTION-GOOGLE-SIGN-IN-READINESS-001`，保留原 ID／檔名供追溯。
- 節點：開發點，支援 AI-PDM `DEV-003` 身分／權限交付與 Platform `DEV-013` SSO；118-B owner-native slice 為 Platform `DEV-014 / 014-LOGIN`；關聯 `DEV-046`、`DEV-117`。

## 1. 本次已確認的產品決策

使用者於 2026-09-17 確認理解後要求「依此修改開發文件」。決策是：**符合帳號與權限前提的員工，可選 Google 登入或輸入工號啟動同一身分的驗證；SSO 啟用後，登入方式由鉦富平台集中處理，PDM 只保留平台登入主入口。**

| 名稱 | 本文件的固定意義 |
|---|---|
| 公司 email | 帳號屬性；擁有公司 email 不自動取得 Google 身分或 PDM 權限 |
| 工號／員工編號 | 公司範圍內可變的登入別名，用來找出預先核准的公司管理身分；不是密碼、憑證或永久 canonical ID |
| Google 憑證登入 | 選擇已核准的公司 Google／Cloud Identity 帳號，由 provider 驗證身分 |
| 工號登入 | 輸入工號後導向對應身分的 provider 驗證；Google-managed 帳號仍完成 Google 驗證，不能只輸入工號就登入 |
| 登入授權 | 先取得可信 provider 身分，再檢查 active employee／principal、app assignment、PDM local account／company／permission 與既有 assurance 規則 |

同一員工的兩種起手方式必須落到**同一個預先核准的日常登入身分**；不能因 email 相同、自稱工號或同屬一員工便自動合併帳號。個人專用 privileged identity 與日常身分的權限仍分開，不因工號共用就繼承管理權。

適用前提：公司管理身分已建立、provider 已啟用、工號映射有效（工號路徑）、管理員已開通員工及 PDM 權限。既有非 Google 帳號保留原核准相容政策，不強制遷移；本次新增 Cloud Identity Free 員工屬 Google-managed 帳號，不另開 non-Google 密碼分支。

### 1.1 Cloud Identity Free 決策修訂

使用者補充「我部份員工沒有workspace 的mail帳號, 我會讓他使用Cloud Identity Free 帳號」，並明確授權「依此修改Jenfu-Platform 與此專案共兩個專案的專案文件」。因此：

- **沒有 Gmail 信箱不等於沒有 Google 帳號。** 公司 Google Workspace 與 Cloud Identity Free 帳號皆使用同一 Google provider；不新增第三種登入入口，也不以 Workspace 付費授權作登入條件。[Google editions](https://cloud.google.com/identity/docs/editions)
- 工號只啟動核准帳號的 Google 驗證；平台／PDM 不接收 Google 密碼。Free 帳號名稱即使像 email，也不能要求從不存在的 Gmail 信箱收 invitation／email-link。
- Platform canonical identity 保留 **verified Firebase issuer＋subject（Firebase UID）**。Google `sub`／provider UID 為上游識別，必須經核准連結對應；不可直接覆蓋 Firebase UID。工號、email、license 或網域尾碼不能替代永久身分。Cloud Identity Free 與本專案使用的 Identity Platform／Firebase Authentication 是不同層。[Firebase token 驗證](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- Google 帳號有效不等於員工已啟用或獲得 PDM 權限；原有 admission、MFA／assurance、app assignment、local account／company／permission 與撤銷仍須全部通過。

## 2. 決策來源、現況與替代範圍

| 來源 | 已確立的邊界 |
|---|---|
| [DEV-046 2026-07-13 身分決策 3](SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md) | 支援工號別名；credential／MFA／recovery 屬 Cloud Identity／Firebase，最終依 verified UID 映射 PDM user |
| [DEV-003 §4.1](SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md) | 歷史 PDM 直接登入可接受工號或公司帳號；工號 intent 必須與回來的 UID／company 一致 |
| [Platform ADR-003 2026-09-01 amendment](../../../Jenfu-Platform/ai-doc/decisions/ADR-003-entitlement-user-migration-role-activation.md) | 每位員工使用公司可管理的個人身分；工號不是 canonical identity／免驗證 credential |
| [Platform ADR-002 DEV-013 amendment](../../../Jenfu-Platform/ai-doc/decisions/ADR-002-phase1-identity-session-cloudsql-topology.md)及[DEV-013 §§10、16.1](../../../Jenfu-Platform/ai-doc/specs/DEV-013-cross-application-single-sign-on.md) | SSO 啟用後 target 只提供平台主要入口；保留必要 reauth／recovery／smoke／受控回退，不增加平行一般登入路徑 |
| 本次使用者指令 | 將 Google／工號選擇與平台集中登入原則正式寫入本開發文件 |
| [Platform DEV-014 / 014-LOGIN](../../../Jenfu-Platform/ai-doc/specs/DEV-014-managed-identity-production-activation.md#dev014-login)與[ADR-004 §4.6](../../../Jenfu-Platform/ai-doc/decisions/ADR-004-managed-identity-activation-and-global-session-invalidation.md#managed-google-login) | 依 Cloud Identity Free 決策與兩專案文件授權，登錄 `AI_PDM / DEV-118 / 118-B` 來源；Google／工號入口與無 Gmail 開通契約，尚未產品實作 |

2026-09-17 coding前 repo review：AI-PDM HEAD=`c06447aa40d3738c2d053d3a5f1e1fa59e766878`。DEV-013 target start／callback、handoff 與平台 CTA 已在本地 source；不能重算為 DEV-118 新實作，也不能推定已正式啟用。當時 `/api/auth/mode` 以 `Boolean(firebaseConfig)` 宣告直接 Google enabled，SSO broker 設定缺漏可能被當作 SSO off，login mode fetch 失敗會 fallback managed；這些入口選擇缺口已由本文件 118-A 實作與 QC 關閉。

Platform `src/app/login/login-client.tsx` 文件修訂前查核仍使用 email/password，未發現 Google CTA／工號解析入口。**平台雙入口是確認的目標，尚非既有可用功能，也不是 DEV-013 SSO handoff 本身已承諾完成的能力。** 本輪已依人類授權同步兩專案文件，將 118-B 登錄至 Platform DEV-014 的 `014-LOGIN`，不宣稱程式已完成。

原使用者截圖與前輪 provider configuration not found 記錄，保留為問題來源；本輪沒有重新探測 production，不能用舊調查記錄當 fresh PASS。

### 2.1 Intentional replacement

本修訂取代本文件 2026-09-16 版本中「恢復 PDM 直接 Google 主入口」的目標，以及由此衍生的下列**未實作要求**：

- 取消新增 `PDM_FIREBASE_GOOGLE_SIGN_IN_ENABLED` 並在 production 固定 true。
- 取消 PDM `/api/auth/mode` 的 `accounts:createAuthUri` probe、30／5 秒快取、client 輪詢與八種 provider reason。
- 取消新增 `verification.googleSignInContract`、七筆 smoke observations、internal-candidate-smoke v2／新 Workflow template 的要求。
- 取消以「PDM 直接 Google CTA 登入成功」作為唯一正式交付條件；改驗平台選擇登入、SSO 交接、PDM 權限與 returnTo。

上述取消不代表測試通過，不刪除已存在的 DEV-013 SSO、Firebase exchange 或歷史證據。若後續確需改善 provider readiness，由 Platform owner 在平台登入契約內規劃；不把 provider 探測塞回每個 target app，也不預先指定輪詢架構。

本文件只對齊已接受的 ADR-002／ADR-003，不另建立平行 ADR。DEV-117 十階段、唯一 `releaseCapsuleRef`、憑證及既有 receipts 維持原 authority，不重開 R78。

使用思考習慣：#目的、#限制條件、#變數控制

## 3. 正常登入路徑與 owner

```mermaid
flowchart LR
  A["PDM 未登入"] --> B["使用鉦富平台登入"]
  B --> C{"已有有效平台 session？"}
  C -- 有 --> H["DEV-013 SSO handoff"]
  C -- 無 --> D["平台登入選擇：118-B 待實作"]
  D --> E["選公司 Google 帳號"]
  D --> F["輸入工號 → 核准的公司帳號"]
  E --> G["Provider 驗證 → 平台 admission"]
  F --> G
  G --> H
  H --> I["PDM local admission／權限"]
  I --> J["PDM session → 安全 returnTo"]
```

- **OrgMaster identity owner／Google Admin**：OrgMaster 維護 employee、公司範圍工號與受管身分連結；Google Admin 管理公司 Google 帳號、credential／MFA／recovery。本輪不修改 OrgMaster 文件或產品。
- **Platform owner**：Google provider 整合、依版本化核准 mapping 解析工號、平台登入 UI／錯誤、admission／session 與既有 broker。工號的精確讀取契約仍須與來源 owner 定案，不能直接讀 sibling core 或以 PDM 私有 alias table 作平台 directory。
- **AI-PDM owner**：自己的登入入口、SSO consumer、local session／admission／permission、可見錯誤及受控相容入口；不取得 shared provider 管理權、不代建 employee／Google identity。
- **各 app release owner**：各自發布、設定與回復；Platform 不因集中登入而取得 PDM traffic／DB／release authority。

SSO 交接沿用 `jenfu.sso-handoff.v1` 的 state／PKCE／one-time code／service identity 與 original authenticatedAt、auth_epoch、revoked_before；本案不重寫它。Google ID／refresh token、Portal cookie 與密碼不得傳給另一 app。

## 4. 118-A：PDM 本地入口契約（可派工）

本 phase 只完善既有 PDM 入口選擇與錯誤邊界；不重新開發 DEV-013 consumer，不實作 Platform 登入選擇。

### 4.1 設定與 API

沿用 `PDM_JENFU_SSO_HANDOFF_MODE=off|on`、`PDM_JENFU_SSO_BROKER_ORIGIN`、`PDM_PUBLIC_BASE_URL`、`PDM_AUTH_MODE`、`PDM_JENFU_PLATFORM_AUTH_MODE`。不增加另一個登入模式旗標、public endpoint 或 provider health service。

| 狀態 | `/api/auth/mode` 行為 | PDM 畫面與操作 |
|---|---|---|
| Firebase BFF、handoff mode=on 且既有 SSO 設定有效 | 200；ssoHandoffEnabled=true；googleOAuth.enabled=false、provider=firebase；Cache-Control=no-store | 唯一主要 CTA「使用鉦富平台登入」；隱藏直接 Google／工號／一般密碼表單 |
| Firebase BFF、handoff mode=on 但 platform mode／broker／base 設定缺漏或無效 | 503；固定 `{code:"sso_dependency_unavailable"}`；no-store | 顯示「登入設定暫時無法使用，請稍後再試或聯絡系統管理員。」；不得降級成直接登入 |
| Firebase BFF、handoff mode 明確 off（含既有預設 off） | 保留既有相容 response；ssoHandoffEnabled=false | 保留現有直接登入作過渡／受控回退；不是正式 SSO 完成證據 |
| handoff mode 為非空、非 on/off 的非法值（Firebase BFF） | 同設定失敗，不默認 off | 同上失敗訊息，不新增旁路 |
| local demo／非 Firebase managed 模式 | 保留各自既有契約 | 不為 production SSO 改變本地／demo authority |
| mode request 失敗、缺欄位或未知 authMode | client 保持 unavailable，不推定 managed | 不可提交任何登入方式；提供「重試」重新取得 mode |

SSO on 的 `googleOAuth.enabled=false` 僅表示 **PDM 不提供直接 Google 入口**，不表示平台 Google provider 停用。`ssoHandoffEnabled` 是設定與入口狀態，不是 broker 即時健康保證；不因外部故障自動改模式。

將既有 SSO 靜態設定解析從 `jenfu-sso-handoff.ts` 的 setup 抽為 `auth-config.ts` 可重用、可注入 env 的純函式；auth-mode 與 setup 共用同一判定。只驗既有 DEV-013 設定／exact origin 契約，不讀 DB、credential 或呼叫 provider；不改 state、PKCE、token exchange、principal、session 或權限邏輯。正式 origins 仍由 reviewed owner 設定提供，不從 request Host／query 推導。

### 4.2 UI 與操作

- loading／unavailable 時沒有可提交的登入 CTA；不能先閃出直接 Google 或帳密表單。
- ready SSO CTA 只導向既有 `/api/auth/jenfu-sso/start?returnTo=<safe local path>`；沿用 DEV-013 safe returnTo，不把任意外站 URL 帶給平台。
- 平台已有 session 時不再要求 Google popup／工號／帳密；平台未登入才在平台選擇方式。PDM 不重複收一次工號。
- local logout 留在 PDM 登入頁，明確點擊後才交接，不自動 redirect 造成登出循環。
- mode 載入／重試錯誤放在目前可見的登入面板，以 `role="alert"` 呈現；不要寫入 SSO 模式中被隱藏的 form error。使用單一載入狀態與 request generation／cleanup，防止晚回 response 覆蓋新狀態。
- handoff 途中及 callback 的 error code、account conflict、source expiry／revocation 仍依 DEV-013 處理；本 phase 不自創 callback protocol。若既有正常錯誤呈現路徑缺漏，列入 DEV-013 owner 缺陷並阻擋對應整合驗收，不能以本地 mode UI PASS 宣稱已修好。
- 相容模式沿用既有 Google／工號流程：工號建立短效 single-use intent，驗證後 UID／company 必須命中同一目標；工號不是可繞過 provider 的備援。原 direct provider 設定故障仍需 owner 修復，不因保留舊 UI 被視為已解決。

一般 Google provider 失效，不得推薦同樣依賴 Google 的工號作替代；只有該帳號確實具有已核准、可用的其他 provider 方法時才提供替代登入。平台雙入口完成後的具體文案由 118-B 固定。

### 4.3 實作範圍與順序

| 順序 | 檔案 | 允許變更 |
|---|---|---|
| 1 | `src/lib/auth-config.ts`、`src/lib/jenfu-sso-handoff.ts` | 共用靜態設定解析；handoff 僅委派設定，不重寫 session／exchange |
| 2 | `src/app/api/auth/mode/route.ts` | SSO on 的直接入口關閉、設定錯誤 fail closed、no-store |
| 3 | `src/app/login/page.tsx`；`src/app/globals.css` 僅必要時 | mode loading／retry／可見 error、平台唯一入口，最小版面變更 |
| 4 | `src/lib/jenfu-sso-handoff.test.ts`；新增 `scripts/qc-dev-118-login-entry-contract.mjs`、`scripts/qc-dev-118-login-entry-browser.mjs`；`package.json` | 設定與入口負例、實際登入頁 browser checks、focused commands |

No-touch：DB schema／migration、employee／principal／alias 資料、privileged policy、其他 repo、shared provider／OAuth secret、DEV-117 profile／runtime／Workflow／smoke schema。開始 coding 前先讀相關 Next.js bundled guide，重新核對已提交的 DEV-013 實作；不能用舊版本覆蓋最新 code。

## 5. 118-A 驗收與驗證

| Case | 操作與前置 | 必須觀察的結果 |
|---|---|---|
| A01 | SSO on、設定有效，讀 mode／開登入頁 | sso=true、直接 google=false、no-store；只有平台 CTA；無 provider／DB health probe |
| A02 | SSO on 缺 broker/base、非法 origin／mode、platform mode off | 設定錯誤回 503；UI 顯示就地 error；不出現直接 Google／工號／密碼 fallback |
| A03 | mode timeout／非 JSON／未知模式、第一次重試晚回 | unavailable 不走 managed；重試恢復；舊 response 不覆蓋新 state、unmount 無殘留 |
| A04 | SSO off／demo／managed fixture | 既有模式保留；不把 Google 與工號描述為兩套獨立憑證；既有 alias UID mismatch／replay 拒絕維持 |
| A05 | 點平台 CTA、safe／惡意 returnTo、local logout | 只進既有 start 路徑；無任意 redirect；logout 後不自動重新登入 |
| A06 | 1440×900、390×844、使用者原 748×698；loading／ready／error、Tab／重試 | 主動作與錯誤可見，無水平溢位、重疊、截字；錯誤不藏進未渲染 form |

已新增並通過：`npm run qc:dev-118:contract`（10/10）、`npm run qc:dev-118:browser`（12/12）。既有 `npm run test:dev-013`（3/3）、`npm run qc:dev-046-login-alias`（21/21）、`npm run typecheck:app` 與 `npm run build:isolated` 亦通過。不因改文件／登入入口重跑未受影響的全套 DEV-117 release tests；若後續實作需要修改 release source，停止並重定範圍。

Browser QA 必須操作實際編譯登入頁；fixture 只模擬設定／mode response／外部依賴，不直接塞入成功 session。收集 source revision／dirty fingerprint、角色、route、viewport、操作、截圖、console／page error 與 visible error sweep；local fixture 不冒充跨 app 或 production PASS。

所有 build／QA runtime 遵守 AGENTS.md：啟動前記 project、purpose、port、PID tree、cleanup condition、PDM_DATA_DIR／PDM_REPOSITORY_DIR；使用 task-owned isolated 資料，seed 前先驗 unmodified snapshot invariants，保留 mutation ledger，build 前後證明 primary identities/schema/residue/FK 不變。結束停止 own processes、釋放 port 並清 own UI／temp paths；不碰使用者現有登入分頁。

<a id="platform-login-contract"></a>

## 6. 118-B：平台 Google／工號入口承接契約

狀態：`RD Contract Ready / Registered—Platform DEV-014 / 014-LOGIN / Implementation NOT_RUN`。來源引用為 `AI_PDM / DEV-118 / 118-B`，owner-native contract 為 [DEV-014 §18](../../../Jenfu-Platform/ai-doc/specs/DEV-014-managed-identity-production-activation.md#dev014-login)。使用者已明確授權兩專案文件修改，文件承接缺口已關閉；工程契約與產品實作仍待完成。

Platform DEV-014 的 R2 架構定案只涵蓋既有 S0～S4／QA 基線 20 案；新增 `014-LOGIN` 是 Contract Ready，另列六案驗收。不重算 DEV-013 原有 22 案或基線完成率。

固定產品契約：

1. 有效公司 Google Workspace／Cloud Identity Free 身分均可直接選公司帳號驗證；有效工號可找到該員工核准帳號後啟動 Google 驗證。兩者皆通過同一平台 admission，不各建一套帳號，不依賴 Gmail 信箱。
2. 工號 mapping 由核准的公司／employee／identity authority 管理。Unknown、disabled、retired、ambiguous、cross-company mapping 一律 fail closed，公開回應不得列舉 email／帳號是否存在。
3. 工號起手的 transaction 必須與最終 verified Firebase issuer／subject／employee 一致、短效、防重放；不能接受 popup 選到另一個有效員工便換人登入。Google 起手也不得靠 email/domain 自動建 principal；Google provider UID 不可替代 Firebase UID。
4. Provider failure、popup blocked／closed、mapping rejection、權限不足須分開呈現並可恢復；provider unavailable 時不能把工號包裝成可繞過的備援。
5. 兩種方式均保留 original authenticatedAt、既有 MFA／assurance、revocation 與 global logout；不擴張 privileged identity 權限。
6. 既有核准 non-Google provider-managed email/password 等相容路徑保留原 gate。Cloud Identity Free 員工不屬此分類，不能因沒有 Gmail 而要求另設 Firebase email/password 或應用自有工號密碼。

<a id="managed-google-onboarding"></a>

### 6.1 管理員開通 Workspace／Cloud Identity Free 員工

| 步驟 | 負責 owner | 必須完成的設定與驗收 |
|---|---|---|
| 1. 建立公司 Google 身分 | Google Admin／身分營運管理員 | 在正確 tenant／domain 建立 Free 帳號並核對 license／自動 Workspace 指派；確認受管且可登入，不要求購買 Gmail |
| 2. 首次登入／MFA／復原 | 身分營運管理員＋員工，於 Google 完成 | 透過核准安全管道交付初始登入資料，依 Google policy 完成設定；不可要求在不存在的 Gmail 信箱收 invitation／email-link，另用通知／復原 email 時必須確認可收信 |
| 3. 連結員工與工號 | OrgMaster identity owner；Platform 消費 contract | 依公司範圍工號連結核准 Google identity 與 Firebase issuer＋UID；精確 versioned lookup／首次綁定依 `014-LOGIN` 收斂，不以 email 自動合併，不使用 PDM 私有 alias 作平台 directory |
| 4. 配置應用權限 | Platform 授權管理員＋AI-PDM Admin | 平台檢查 active employee／principal、app assignment；PDM 在 `/settings/accounts` 管自己的 user、company／membership、角色與 permission，不管理 Google password／MFA／recovery |
| 5. 驗證兩種起手與 SSO | Platform／AI-PDM owner | Workspace 與 Free 各驗 Google 按鈕、工號起手皆落到同一核准日常身分與 PDM user；缺 mapping／assignment／local permission 必須拒絕，依既有 release gate 才可發布 |

這是目標開通契約，不能據此宣稱目前所有管理 UI 或雙入口已可操作。帳號 license、Google `email_verified` 均不證明 Gmail 收信能力；Google 密碼不等於 Firebase email/password credential。詳細 owner flow 與官方依據見 [Platform §18.3、§18.6](../../../Jenfu-Platform/ai-doc/specs/DEV-014-managed-identity-production-activation.md#dev014-login)。

<a id="non-google-compatibility"></a>

### 6.2 既有 non-Google 相容邊界

先前 §6.1 的 non-Google 開通建議不適用於本次 Free 員工；以本修訂明確更正。既有核准 non-Google 帳號的 provider credential、MFA、invitation／recovery 與 production allowlist 保留原 authority，不批次遷移、不刪除、不自動擴大開放。真正需要新增 non-Google 員工時另由 owner 定義其可收信聯絡管道與 provider proof，不能沿用「沒有 Workspace 信箱」作分類條件。

PDM `/settings/accounts` 的 local 工號 alias 保留給原 SSO off／受控相容用途；不把它提升成平台 employee-number authority。平台不得讀寫 PDM 私有 `*_core`，PDM 不保存 password hash、MFA secret 或 recovery code。

### 6.3 工程交接與尚待完成項

以 Platform [§18.5](../../../Jenfu-Platform/ai-doc/specs/DEV-014-managed-identity-production-activation.md#dev014-login) 為工程缺口清單：versioned mapping read contract、Google provider 與 Firebase principal 連結／首次綁定、login transaction／API／anti-enumeration／safe returnTo、UI error states 與六案 required cells。尚未閉合前保留 `RD Contract Ready`，不宣稱 `Architecture Finalized`。

修改前核對：AI_PDM `codex/dev-013-ai-pdm` @ `013ae1440acf2735b313b9ac43ee710d2b53927e`；Platform `持續優化1` @ `7e5343e3a5cdbd40a1a5ede38922195964d9bfa4`，兩者 clean。本輪只依授權修改這兩專案文件，未修改 OrgMaster、程式、測試、資料、provider 設定或 production；先前唯讀 QC 留作當時歷史證據，現行 native 登錄以 Platform DEV-014／索引為準。

## 7. 118-C：SSO 發布與整合驗收 capsule

沿用 DEV-013 per-client `off → accept → target on → launch`、revocation guard 與 rollback security floor，以及各 owner 普通 release gate。PDM canonical 仍為 `https://ai-pdm-prod-9536592944.asia-east1.run.app`。不新增 custom domain、workflow input、manual GO、Secret 輪替或 provider session-sharing 機制。

| Case | 正常 delivery path | 完成條件 |
|---|---|---|
| C01 Google 起手 | Workspace、Cloud Identity Free 各走 PDM 平台 CTA → 平台選 Google → provider → 平台 admission → handoff → PDM | 同一核准身分建立 PDM session、回 safe returnTo、reload 可用；Free 不依賴 Gmail 收信 |
| C02 工號起手 | Workspace、Cloud Identity Free 各走 PDM 平台 CTA → 平台輸入工號 → Google 驗證 → handoff → PDM | 各與自身 C01 的 Firebase principal／核准日常身分一致；沒有輸入工號即授權、錯配、Google 密碼送 Firebase password 或新增帳號 |
| C03 平台已登入 | Portal 有權限 app tile／PDM 平台 CTA → handoff | 不再要求 Google popup、工號或帳密；仍經 PDM local authorization |
| C04 拒絕與回復 | inactive／無 assignment／工號與 UID 不符／session revoked／broker failure | 不簽發有效 session；可見錯誤、無自動 legacy fallback；不同 principal 不靜默替換 |
| C05 登出與相容性 | local logout、global logout、必要 reauth／recovery、既有 release smoke | 依 DEV-013／既有 policy 生效；保留必要 Firebase exchange，不移除安全驗證 |

A01–A06 可以先取得 local evidence；C01/C02 依賴 118-B，不得用目前平台 email/password 成功取代雙入口驗收。C03–C05 優先引用 DEV-013 同 source／環境／角色的有效證據，不重做平行 handoff suite；有差異才補測。

現行 Firebase refresh-token smoke只證明既有 session 路徑，不能證明平台 Google／工號入口；本案不強制修改其憑證或 observation schema。Provider 啟用／網域讀回由實際登入所在的 Platform owner 負責；PDM SSO 不以自己的直接 Google provider readiness 作 release 前提。

Production 功能完成需實際 canonical、exact artifact／revision、受控 test principal、操作／畫面及 redacted 結果。使用者原始內嵌瀏覽器問題需保留適用環境結果；其他瀏覽器或 local mock 成功不能冒充。無法安全完成 provider 互動／缺 owner implementation 時保留未充分驗證，不預填 PASS。

## 8. 派工、完成與文件治理

- **118-A 已完成本地 coding 與 focused local QA**：118-B 已依兩專案文件授權登錄 Platform `DEV-014 / 014-LOGIN`；下一步閉合其工程契約，再依實作授權執行。文件完成不等於產品實作或測試授權；production 仍由 118-C gate 進入。
- 本 DEV 從原獨立「直接 Google 修復交付點」收斂為既有身分／SSO 交付的**開發點**，不新增產品交付分母。原 scope 被取代，不記已完成；DEV-013 已有成果不重複計入 DEV-118。
- `架構定案` 僅適用 §4 的 PDM 入口切片；不宣稱 Platform 雙入口的 mapping／API／provider 實作已定案。B 的缺口不阻塞 A 本地設計，但阻塞 C01/C02 與完整需求交付。
- A 實作可決定局部 helper 命名、測試組織與樣式；不得改變入口模式、provider／identity／permission authority 或偷加 release 契約。需改 SSO wire schema、DB、shared credential、跨 repo source、平台 alias authority 時，停止受影響切片並回送 owner 規劃。
- 文件與既有 active SPEC 的一致性：DEV-003 §4.1 同步 Free／Google 與 alias authority；`SPEC-PDM-ACCOUNT-LIFECYCLE-001` 保留原 local account 與 provider invitation／recovery 邊界，不把邀請 email 解讀為 Free 登入必要條件；任務板、map、cold-start 同步。Platform DEV-014、ADR-004、QA-014 與索引同步承接。DEV-046 歷史、Platform ADR-002／ADR-003／DEV-013 與 DEV-117 authority 保留，不重寫歷史 QC。
- 118-A 證據：`output/qa/dev-118-login-entry/DEV118-browser-2026-09-17T00-48-58-748Z/manifest.json`；含 source revision／dirty fingerprint、loading／SSO ready／unavailable／managed compatibility、三 viewport、console/page error sweep、port／Next dist／next-env cleanup PASS。此 local fixture 不宣稱 Platform provider、跨 app SSO 或 production 已通過。
