# DEV-118：正式 Google 登入可用性與能力放行修復

狀態：`RD Contract Ready / P0 / Production Provider Change and Release Gated`

來源 ID：`DEV-PDM-PRODUCTION-GOOGLE-SIGN-IN-READINESS-001`

建立日期：2026-09-16

父任務／關聯：`DEV-046` Firebase Auth／Identity Platform 身分邊界、`DEV-117` AI-PDM app-owned release lane、`DEV-003` 使用者身分與權限架構。

## 1. 問題與使用者價值

正式登入頁顯示可操作的「使用 Google 帳號登入」，但點擊後只回覆「登入未完成，請稍後再試」。使用者無法分辨是帳號未開通、瀏覽器問題、暫時性故障或系統設定缺漏，也沒有可採取的恢復動作。

本任務要恢復公司 Google 帳號的正式登入入口，並讓介面只在 Google provider 真正可用時宣告可用。完成後：

- 已開通的公司 Google 使用者可從 canonical production URL 啟動 Google 登入並回到原 `returnTo`。
- 未開通、停用或身分衝突仍由 PDM BFF fail closed，不因 provider 開通而自行註冊或取得角色。
- provider 未設定、網域未授權或入口能力未放行時，登入頁提供正確且可行動的狀態，不再要求使用者無效重試。
- release gate 會驗證 Google 登入的起始路徑，不再用既有 refresh token smoke 代替 provider 可用性。

## 2. 已確認事實與根因模型

### 2.1 2026-09-16 production read-only evidence

- Canonical：`https://ai-pdm-prod-9536592944.asia-east1.run.app/login`。
- `/api/auth/mode` 回傳 `authMode=firebase_bff`、Firebase web config 完整，並宣告 Google provider enabled。
- Identity Toolkit project readback顯示 canonical `run.app` host 已在 authorized domains；故本次不是 `auth/unauthorized-domain`。
- 以 production web config 對 Google provider 建立 authorization URI 時，provider 回覆：
  `OPERATION_NOT_ALLOWED: The identity provider configuration is not found.`
- production bundle沒有針對 `auth/operation-not-allowed` 的錯誤映射，因此落入「登入未完成，請稍後再試」。
- `DEV-117` authenticated smoke使用既有 Firebase refresh token取得 ID token，再測 session create／reload；它沒有執行 Google provider authorization start，所以 release PASS 未覆蓋這個失效機制。

### 2.2 最小充分因果鏈

1. `/api/auth/mode` 只以 Firebase web config 四欄是否存在判定 Google 可用。
2. web config 存在，但 production Google provider config 不存在。
3. UI 因錯誤的 capability 宣告顯示可點擊按鈕。
4. `signInWithPopup` 啟動 provider 時收到 `auth/operation-not-allowed`。
5. client error mapping將未知設定錯誤壓成可重試訊息。
6. release smoke繞過 provider start，使設定與 UI 的不一致沒有阻擋 activation。

系統性根因是「Firebase client 可初始化」被誤當成「Google provider 可登入」，且 release evidence 沒有驗證兩者之間的契約。

## 3. 修復原則

1. Identity Platform／Firebase provider readback是 Google provider 能力的外部事實；AI-PDM 不以 API key、`authDomain` 或按鈕存在推定 provider ready。
2. AI-PDM 必須有明確、預設關閉的 Google capability 宣告。只有 provider owner readback與 release gate 同時通過時，production 才可宣告 `googleOAuth.enabled=true`。
3. Google 只負責驗證身分。stable Firebase UID、active PDM principal、company、account lifecycle、session與角色權限仍由現行 BFF 契約決定。
4. 錯誤回饋必須指出「誰能處理」與「使用者下一步」，不得把永久設定錯誤包裝成暫時性重試。
5. provider mutation影響 shared `jenfu-platform-prod` identity project；AI-PDM只消費經核准的 provider readback，不自行取得或擴張 shared IAM authority。

## 4. Current Phase Scope

### 4.1 App capability與登入 UX

- 將 Firebase client config readiness 與 Google provider readiness拆成不同條件。
- Google capability預設關閉；缺少明確 release-approved capability時，登入頁顯示 disabled「未開放」狀態。
- provider已放行時維持現有 Google 按鈕為直接入口，不增加教學卡、第二個 Google 入口或額外確認。
- 明確處理 provider未啟用、網域未授權、popup被阻擋／關閉及 BFF principal拒絕等失敗類別。
- provider設定錯誤文案靠近 Google 動作；不得顯示在密碼欄位脈絡下，也不得要求使用者持續重試。

### 4.2 Shared provider prerequisite

- 由 shared identity／Platform owner在 exact production project確認或啟用 `google.com` provider。
- 核對 OAuth brand、support email、OAuth client與 redirect／authorized-domain binding；不把任何 secret寫入 repo、文件或 client response。
- provider write後必須由獨立 readback證明 `google.com` 可建立 authorization URI，且 canonical origin仍受允許。
- 若 provider write結果不明，先 readback；不得 blind retry、重建 OAuth client或切換 Firebase project。

### 4.3 Release verification

- 在 candidate activation前加入 provider-start smoke：以 candidate／canonical預期 origin建立 Google authorization URI，必須取得 `google.com` authorization start，且不得回 `OPERATION_NOT_ALLOWED` 或 unauthorized-domain。
- `/api/auth/mode` 不只要求 HTTP 200，還要核對 Google capability與 provider evidence一致。
- 保留既有 refresh-token session create／reload、permission 401與revoked-session smoke；provider-start evidence不能取代 authenticated BFF evidence，反之亦然。
- canonical post-deploy smoke至少覆蓋 enabled Google按鈕、provider start、無通用「請稍後再試」錯誤及原 `returnTo` 保留。

## 5. Out of Scope

- Google email或網域自動建立 PDM 使用者、自動連結既有帳號或自動給角色。
- 改變 stable PDM User ID、company／role／permission authority、session時限或 revocation規則。
- 改變 Workspace 2-Step Verification、TOTP、AAL1 privileged pilot或 MFA trust政策。
- 移除 email/password／工號登入、重做登入頁版型或新增自有密碼／recovery系統。
- 新增 database schema、migration、production data repair、custom domain、DNS、Hosting或 load balancer。
- 在本文件預寫 production command、credential、candidate、traffic switch或 rollback操作表。

## 6. 行為契約

### 6.1 Capability狀態

- `googleOAuth.enabled=true` 的必要條件是：`firebase_bff`、完整 Firebase web config、明確 Google capability開關，以及同一 release scope 的 provider-ready evidence。
- 任一條件缺少時回傳 disabled。公開 response可提供非敏感 reason code供 UI顯示，但不得洩漏 OAuth client secret、provider credential或內部 IAM資訊。
- 不允許用「web config存在」或「已有 refresh token」單獨推導 provider ready。

### 6.2 UI狀態

- Ready：按鈕文案為「使用 Google 帳號登入」，可啟動 provider flow。
- Not ready：按鈕 disabled並顯示最短必要狀態，例如「Google 登入尚未開放，請改用公司帳號或聯絡管理員」。
- Misconfigured at runtime：若 provider-start仍回設定錯誤，顯示「Google 登入目前未完成系統設定，請聯絡系統管理員」，同時解除 loading／popup wait狀態。
- User／browser recoverable：popup被阻擋或使用者關閉視窗時，保留現行可辨識訊息與再次操作能力。
- Principal rejected：沿用現有 BFF精確訊息，不把未開通、停用、email未驗證或 assurance不足改成 provider故障。

### 6.3 Security與permission

- Provider成功只產生可供 BFF驗證的 Firebase ID token；不得直接建立 app session、角色或 company scope。
- 未知 Google身分不得自動註冊，verified email或公司網域不得作 UID mapping fallback。
- client persistence仍維持 memory-only，BFF exchange完成後清除 Firebase client session。
- 所有 auth mode與錯誤 response維持 no-secret、同源與現行 CSRF／origin boundary。

## 7. RD／QA 分期計畫

### 118-A：本機 capability與錯誤契約

- 補 Google capability的 default-off設定與 auth-mode contract。
- 收斂登入頁 disabled／ready／misconfigured／recoverable error狀態。
- 補 focused contract、client error mapping、desktop／mobile rendered UI與鍵盤焦點驗證。
- Exit：本機在 capability off時不得顯示可用按鈕；on fixture可啟動 mocked provider；所有失敗都解除 loading且給正確恢復動作。

### 118-B：shared production provider readiness

- Shared identity／Platform owner確認 exact project與 Google provider現況、OAuth client與support email。
- 依受控變更啟用／修復 provider，取得 fresh provider readback與 canonical authorized-domain evidence。
- Exit：authorization start成功；unknown outcome=0；沒有新增自動註冊、跨app role mapping或過寬 IAM。

### 118-C：release gate與正式驗收

- 把 provider-start probe與 capability一致性加入 AI-PDM owner release的 pre-activation evidence。
- 以 exact candidate完成 provider start、既有 authenticated session、permission／revocation負例及 rendered login UI。
- Activation後執行 canonical feature smoke並保存 release receipt；任何 provider／capability drift必須 fail closed並維持或回復先前 serving revision。
- Exit：canonical Google登入入口可啟動、已開通測試 principal完成 BFF session與 `returnTo`，負向帳號不會取得 session。

## 8. 驗收標準

1. Provider未設定或 capability未放行時，`/api/auth/mode`不得宣告 Google enabled，登入頁不得提供可點擊的假入口。
2. `auth/operation-not-allowed`、`auth/unauthorized-domain`、popup blocked／closed與 BFF principal rejection各自呈現可區分、可行動的結果。
3. Provider ready時，canonical origin可建立 `google.com` authorization URI；authorized-domain readback包含 exact canonical host。
4. 已開通的 production test principal由 Google provider完成驗證後，BFF只依 immutable UID取得既有 active PDM principal，建立 session並回到安全的原 `returnTo`。
5. 未連結、停用、未驗證、跨公司或 assurance不足的身分皆不得建立 app session；不得自動建立、合併或授權帳號。
6. Existing email/password、工號 routing、logout、session reload／revoke與permission負例維持通過。
7. 1440×900與390×844的 ready／disabled／error畫面無裁切、重疊或焦點遺失；錯誤靠近 Google動作且不落在密碼欄脈絡。
8. Release gate在 provider缺失、authorized-domain漂移、capability與provider readback不一致或 generic error回歸時阻擋 activation。

## 9. Evidence Required

- Local：auth-mode與client error focused tests、provider-ready／missing mutants、rendered browser screenshots、console／network error sweep。
- Provider：exact project、provider ID、authorized domain、readback時間與不可變 evidence reference；不保存 secret值。
- Candidate：source／artifact／revision identity、provider-start response分類、capability response、authenticated session與負例結果。
- Canonical：post-deploy Google start、BFF session、safe `returnTo`與 error absence；證據只證明其實際環境與身份。

## 10. Stop Conditions

- Shared identity／Platform owner與 AI-PDM owner對 provider mutation責任不清。
- Exact OAuth client、support email、project或 canonical origin無法由 provider readback確認。
- Provider變更會影響其他 app但沒有 shared compatibility檢查或回復邊界。
- 實作企圖以 email／domain fallback建立 principal、放寬角色、開啟自動註冊或保存 provider token。
- 需要變更 MFA／AAL政策、Firebase project、custom domain、DNS、database schema或 production資料。
- Candidate無法在不切 traffic下取得 provider-start與 authenticated BFF evidence。

## 11. Release Impact Note

本任務觸及 production identity provider、runtime capability設定、登入 UI與 owner release驗證，風險等級為 High。正式 provider mutation與 production activation必須交既有 release gate；本文件只定義 prerequisite、行為與 evidence，不構成 provider write、deploy或 traffic授權。Database migration=`none`。

## 12. Spec Impact與ADR判定

- 分類：`Compatible amendment`。本任務恢復既有 Google登入承諾並補 capability／release control，不改 `SPEC-PDM-ACCESS-CONTROL-001` 的 stable UID、invite-only linking、PDM authorization與 fail-closed原則。
- `DEV-046`：補 provider rollout的 readiness與錯誤契約；不重開已完成的本機 Firebase BFF slice。
- `DEV-117`：補 production-only regression smoke；不改 app-owned artifact、candidate、activation或 rollback ownership。
- ADR：`Not needed`。provider／BFF／UID authority已由現行 identity ADR與spec決定；本次是缺漏控制與驗證修復，沒有新的長期架構替代方案。

## 13. RD Readiness與下一步

目前成熟度為 `RD Contract Ready`。產品行為、責任邊界、分期、驗收與 stop conditions已固定；升級到 `RD Implementation Ready` 前仍需：

1. Shared identity／Platform owner確認 production `google.com` provider的 exact mutation owner與回復責任。
2. 以 fresh readback確認 exact OAuth client／support email／authorized-domain狀態，但不得把 credential寫入文件。
3. RD固定 repo-level修改清單、capability wire shape、focused test命令與 candidate provider-start evidence schema。

上述缺口不改變本文件的產品方向，但在正式 provider mutation前皆為必要 gate。

使用思考習慣：#批判、#多層次分析、#可驗證性
