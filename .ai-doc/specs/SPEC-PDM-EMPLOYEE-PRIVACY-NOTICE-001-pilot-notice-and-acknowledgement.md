# SPEC-PDM-EMPLOYEE-PRIVACY-NOTICE-001

Status: Pilot v1.0 Company Approved / Local UI and Acknowledgement Implemented / Effective Timestamp Pending Staging
Version: 1.0
Owner: `jedchang0308@jenfu.com.tw`
Scope: AI PDM internal pilot, official numbering and draft creation only

## 1. Purpose and authority boundary

This engineering notice was approved by the company owner for the AI PDM pilot on 2026-07-13. It becomes effective when staging is opened to the first employee. It is not legal advice and approval alone is not evidence that any employee has acknowledged it. Activation, permanent-access and Admin evidence UI are implemented and locally verified; no employee acknowledgement or staging-effective timestamp exists until the migration and provider-backed staging flow run.

The draft follows the disclosure categories in Taiwan Personal Data Protection Act Article 8 and preserves the access/correction/cessation/deletion rights listed in Article 3. Source: https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021

## 2. Employee notice draft

### AI PDM 員工個人資料告知事項（Pilot v1.0）

1. 蒐集者：鉦富機械有限公司。
2. 蒐集目的：建立與驗證 AI PDM 帳號、執行權限控管與多因素驗證、提供正式領號及草稿作業、維護資安與系統穩定、追查異常操作、履行內部管理及法令義務。
3. 個人資料類別：姓名或顯示名稱、公司電子郵件、員工工號／登入別名、Firebase 身分識別碼與登入方式、帳號／角色／權限／在離職狀態、MFA 狀態、登入與 session 安全紀錄、使用者執行的領號／草稿／管理操作及其稽核識別資料。工號只用於尋找受管理帳號及 PDM User ID 映射，不是密碼或授權依據。系統不得保存使用者密碼、MFA secret、復原碼，也不得在一般應用程式 log 記錄密碼、驗證碼、session token 或完整工作內容 payload。
4. 利用期間：離職時立即停用帳號，Firebase identity 原則上於離職後 30 日刪除；邀請、復原及 session 安全事件保存 180 日；應用程式安全 log 保存 365 日；Google `_Required` 系統 log 依供應商固定政策保存 400 日。正式圖號與防止重複使用所需的最小台帳永久保存，不永久保存與此目的無關的完整內容；已關閉或取消的草稿保存 3 年；操作稽核保存 3 年，稽核主體使用穩定 PDM User ID，不以電子郵件作永久識別；已退役的工號／登入別名映射保存 3 年後移除原始別名，歷史操作仍只指向穩定 PDM User ID。若有具名、具理由及到期日的法律或資安保全要求，得暫緩刪除。
5. 利用地區：正式業務資料預定存放於 Google Cloud 台灣 `asia-east1`；Firebase Authentication 身分資料可能由 Google 在美國或其服務地區處理；Google Cloud 的系統必要 log 可能位於全球服務位置；Google Workspace 核准副本依 Workspace 服務位置處理。
6. 利用對象：公司內經授權的管理、資訊、稽核及業務必要人員；受公司委託提供身分、雲端、監控或支援服務的 Google／Firebase；依法有權要求提供之主管機關或司法機關。不得用於未告知的行銷、員工績效自動評分或與本系統目的無關的監控。
7. 利用方式：透過帳號登入、權限檢查、系統交易、稽核紀錄、備份、異常調查及必要的人工查核處理。所有商業邏輯只經可移植 HTTP/BFF；Firestore、Firebase Storage、Firebase Functions、Callable 與 Firestore trigger 不作正式資料權威。
8. 當事人權利：可聯絡 `jedchang0308@jenfu.com.tw` 請求查詢或閱覽、製給複製本、補充或更正、停止蒐集／處理／利用或刪除；`dani@jenfu.com.tw` 為備援窗口。公司得依適用法令、保存義務與業務必要性回覆。
9. 不提供的影響：必要帳號與安全資料若不提供，將無法啟用或繼續使用 AI PDM；非必要欄位不得成為使用條件。
10. 版本與變更：本版為 Pilot v1.0，生效日為 staging 開放給第一位員工之日，實際日期須由系統在發布時寫入並顯示；涉及目的、資料類別、跨境處理或保存期間的重大變更，使用者下次進入時須重新閱讀確認。

UI 上使用「我已閱讀並了解」，不把此 checkbox 宣稱為所有處理活動的概括同意；實際法源與必要性由公司在發布前確認。

## 3. UI placement contract

### 3.1 First activation gate

- Route: existing `/account-invitation/firebase` for non-Google activation; Google first-link flow uses a shared `/privacy/acknowledgement` gate before the first BFF session becomes usable.
- Display: a concise three-line summary covering purpose, Taiwan business-data location and Firebase US identity processing, followed by a visible `查看完整告知` link.
- Control: unchecked `我已閱讀並了解 AI PDM 員工個人資料告知事項（版本 X）` checkbox. `啟用帳號` remains disabled until checked.
- Evidence: successful activation atomically records exact notice version, content SHA-256, PDM user ID, timestamp and activation source. It must not store password, token, MFA code or full browser fingerprint.
- Failure: acknowledgement write failure blocks activation and tells the user to retry or contact the system administrator; it must not create an active PDM principal with missing evidence.

### 3.2 Permanent employee access

- Public/readable route: `/privacy`, titled `隱私與資料使用`.
- Discovery points: login and activation footers link to `/privacy`; authenticated sidebar adds `管理 > 隱私與資料使用`, visible to every enabled user.
- Normal login does not show a repeated modal. A published material new version redirects once to `/privacy/acknowledgement`, then returns to the original safe destination.
- The existing `/policy` page remains `PDM 管理辦法`; privacy notice is not merged into it.

### 3.3 Admin evidence

- Route: `/settings/accounts`, account detail and audit view.
- Fields: latest required notice version, acknowledged version, acknowledged time and status (`已確認`, `需重新確認`, `尚未確認`).
- Admin may inspect evidence but cannot acknowledge on another employee's behalf or edit historical evidence.

## 4. Data contract

- `privacy_notice_versions`: `version`, `status`, `effective_at`, `content_sha256`, `published_by`, `published_at`.
- `privacy_notice_acknowledgements`: `user_id`, `notice_version`, `acknowledged_at`, `source`, `request_id`; unique on `user_id + notice_version`.
- Draft records never satisfy the runtime gate. Only one published required version may be active per company.
- Historical published text and acknowledgement rows are immutable; corrections publish a new version.

## 5. Human decisions

- `HD-PRIV-1`: Closed `2A` - disable immediately and delete Firebase identity after 30 days unless a documented hold applies.
- `HD-PRIV-2`: Closed `2A` - invitation, recovery and session-security events retain for 180 days.
- `HD-PRIV-3`: Closed `2A` - application security logs retain for 365 days; disclose Google `_Required` global 400-day provider retention separately.
- `HD-PRIV-4`: Closed `1A` - permanently retain only the minimum official-number/non-reuse ledger; retain closed or cancelled drafts for 3 years and operation audit for 3 years using stable PDM User ID rather than email.
- `HD-PRIV-5`: Closed `3C` - `jedchang0308@jenfu.com.tw` primary and `dani@jenfu.com.tw` backup.
- `HD-PRIV-6`: Closed `2A` - company owner approved Pilot v1.0 on 2026-07-13; effective on staging opening. This is company approval, not external legal review.

Remaining live gate: apply the reviewed immutable v1.0 schema to Cloud SQL, record the actual staging-opening effective timestamp, verify Google and controlled non-Google provider-backed acknowledgement flows, and pass staging/release QA/QC before activating an employee account.

## 6. Acceptance criteria

- Both Google and non-Google first-activation paths fail closed without the current published acknowledgement.
- Full notice is reachable before activation and after login at desktop and mobile viewports.
- The activation CTA cannot be enabled by UI-only tampering; BFF rechecks the published version and records evidence transactionally.
- Version change produces exactly one re-acknowledgement gate and preserves the original safe destination.
- Admin evidence shows version/time/status without exposing credentials or authentication secrets.
- QA/QC covers keyboard, focus, checkbox label, disabled reason, failed acknowledgement, stale version, concurrent activation and visible-error states.

## 7. Local implementation evidence

- Canonical content hash: `94eccfc2b519db02e410c9fa057f582fae2f057eb03ce37cf0a77df4697b0d6d`.
- Schema: `db/schema.sql` plus provider-neutral PostgreSQL migration `db/postgres/015_employee_privacy_notice_acknowledgements.sql`; the Supabase migration is a local compatibility mirror only.
- Runtime: first-session pending cookie, exact-version acknowledgement API, protected BFF recheck, transactional invitation activation, permanent `/privacy`, `/privacy/acknowledgement`, and read-only Admin evidence at `/settings/accounts`.
- Focused QC: `npm run qc:dev-046-privacy-ack` passed 20/20; migration mirror QC passed 56/56; Phase 2A and Phase 2B regressions passed 20/20 and 14/14.
- Production build and desktop/mobile browser checks passed. Missing/expired acknowledgement is fail closed and visibly recoverable; no cloud credential, live migration, Firebase user, billable resource or deployment was used.
- Detailed evidence: `.ai-doc/reports/rd/rd-dev-046-privacy-notice-acknowledgement-local-slice-2026-07-13.md` and `.ai-doc/qc/qc-dev-046-privacy-notice-acknowledgement-local-slice-2026-07-13.md`.
