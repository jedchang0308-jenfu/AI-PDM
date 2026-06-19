# SPEC-SW-LICENSE-PDM-001: SW License 與 PDM 公司歸屬分離

狀態: Planned
日期: 2026-06-18
專案: AI_PDM
文件類型: PM / RD 規格
關聯任務: DEV-SW-LICENSE-PDM-001
關聯決策: ADR-SW-LICENSE-PDM-001

## 1. 目標

讓使用者可在不頻繁切換 SolidWorks license / 序號的情況下操作 CAD 檔，同時仍能把資料明確上傳到指定的 PDM 公司資料域。

首版正式採用 `operational_shared` 策略:

- SW license 使用狀態不強制等於 PDM 資料公司。
- PDM 資料歸屬、查詢、送審、下載與管理權限仍依 `pdm_company` 控制。
- 一般員工只能操作自己所屬 PDM 公司。
- Admin 可在上傳或管理流程中指定 PDM 目標公司。

## 2. 問題定義

目前使用者有鉦富與久方兩家公司情境，且 SW license 切換有次數或操作限制。真正交付問題不是「如何讓 SW 自動切序號」，而是:

- 避免因 PDM 公司切換造成 SW license 反覆切換。
- 避免鉦富員工操作久方 PDM 資料，或久方員工操作鉦富 PDM 資料。
- 讓 Admin 可在同一套 AI_PDM 中選擇資料要進入鉦富或久方 PDM。
- 技術上允許「目前啟用的 SW license」與「PDM 資料公司」分離。

## 3. 名詞

| 名詞 | 定義 |
|---|---|
| `pdm_company` | PDM 資料歸屬公司，例如 `JENFU` 或 `MAXIMA`。 |
| `sw_license_profile` | CAD / Document Manager 執行時使用的 SW license profile。首版不拿它阻擋 PDM 公司操作。 |
| `operational_shared` | 允許 SW license 與 PDM 公司不一致，但 PDM 公司權限仍強制檢查。 |
| company membership | 使用者可操作的 PDM 公司清單。一般員工預設單公司，Admin 可多公司。 |

## 4. 範圍

首版包含:

- 新增公司資料模型與使用者公司 membership。
- 核心 PDM 資料新增 `company_id` 或等效公司 scope。
- Admin 在 Web / Add-in 上傳流程可選 PDM 目標公司。
- 一般員工自動套用自己的 PDM 公司，不提供跨公司切換。
- API 強制檢查使用者是否可操作目標 `pdm_company`。
- 現有資料 migration 預設回填為鉦富 `JENFU`。

首版不包含:

- 自動切換 SolidWorks license。
- 在 CAD add-in 保存 SW license key。
- 將 SW license key 存入資料庫或 repository。
- 強制檢查 `sw_license_profile.company_id === pdm_company.company_id`。
- Supabase production cutover 或 production migration。

## 5. 功能需求

### 5.1 公司與使用者

- 系統需內建公司代碼:
  - `JENFU`: 鉦富
  - `MAXIMA`: 久方
- 使用者需能關聯一個或多個可操作 PDM 公司。
- 一般員工只能有一個 active PDM 公司。
- Admin 可具備多公司操作權限。
- `PDM_BOOTSTRAP_USERS` 與 user creation tooling 需支援指定 `companyCode` 或 `companyCodes`。

### 5.2 PDM 公司 scope

- 新增送審資料時必須決定 `pdm_company`。
- 查詢清單、搜尋、明細、檔案下載、BOM、numbering、附件、release package 需依 `pdm_company` 過濾。
- 唯一鍵需改為公司範圍，例如同一圖號/料號可同時存在於鉦富與久方資料域。
- 既有資料導入後預設屬於 `JENFU`。

### 5.3 上傳流程

- Web upload:
  - Admin 需能選擇 PDM 目標公司。
  - 一般員工不顯示公司選擇，server 自動套用使用者公司。
- SW Add-in:
  - 顯示登入者與 PDM 目標公司。
  - Admin 可選 PDM 目標公司後送出。
  - 一般員工自動套用使用者公司。
- Client 傳入的 `pdm_company_code` 不能被信任，server 必須重新以 session user 驗證。

### 5.4 SW license policy

- 新增 system setting: `sw_license_policy`。
- 首版預設值: `operational_shared`。
- `operational_shared` 行為:
  - 不因 SW license profile 與 PDM 公司不一致而阻擋上傳。
  - 可記錄目前 SW license profile label 或來源，但不得記錄序號值。
  - PDM 寫入的公司歸屬完全由 `pdm_company` 決定。
- 保留未來策略:
  - `strict_match`
  - `admin_override`

### 5.5 安全與秘密邊界

- SW license key 不得回傳前端。
- SW license key 不得寫入 add-in setting。
- SW license key 不得寫入 DB、QC report、PM report、probe output 或 log。
- 若需要 Document Manager extractor profile resolver，應作為第二階段交付點，並只透過 server-side environment / OS secret 注入。

## 6. 建議資料模型

最低資料結構:

- `companies`
  - `id`
  - `company_code`
  - `display_name`
  - `enabled`
- `user_company_memberships`
  - `id`
  - `user_id`
  - `company_id`
  - `is_default`
  - `assigned_by`
  - `revoked_at`
- `sw_license_profiles`
  - `id`
  - `profile_code`
  - `company_id`
  - `display_name`
  - `secret_env_name`
  - `enabled`
  - `notes`

核心 PDM tables 需新增 `company_id` 或透過 parent relation 可確定公司 scope。不可留下可跨公司查詢或下載的孤立路徑。

## 7. API 規格

新增或調整:

- `GET /api/auth/me`
  - 回傳使用者可操作公司清單與預設公司。
- `POST /api/auth/token`
  - 回傳 add-in 需要的可操作公司清單，不回傳 secret。
- `POST /api/file-metadata/detect`
  - 接受 `pdm_company_code`，server 驗證後才執行偵測。
- `POST /api/submissions`
  - 接受 `pdm_company_code`，server 驗證後寫入公司 scope。
- 其他 PDM read/write API
  - 須套用 company filter，避免跨公司資料讀取。

## 8. 驗收標準

- Admin 使用目前 SW license，可選 `JENFU` 作為 PDM 目標公司並成功上傳鉦富圖檔。
- Admin 可選 `MAXIMA` 作為 PDM 目標公司並成功上傳久方圖檔。
- 鉦富一般員工無法上傳到 `MAXIMA`，API 回 403。
- 久方一般員工無法上傳到 `JENFU`，API 回 403。
- 同一圖號/料號/版次可在不同公司資料域各自存在，不互相衝突。
- 前端、add-in、API response、log、QC output 不出現 SW license key。
- 現有資料 migration 後可被鉦富 company scope 查詢。

## 9. 風險與限制

- 此規格不處理商務或法務授權適用性，只定義技術行為。
- `operational_shared` 會讓 SW license profile 與 PDM 資料公司可能不一致，因此報表欄位需避免暗示 license 合規結論。
- 若未完整套用 company scope，可能造成跨公司查詢、下載或 numbering 衝突。
- 若未更新 add-in token DTO，CAD 端可能無法顯示或提交 PDM 目標公司。

