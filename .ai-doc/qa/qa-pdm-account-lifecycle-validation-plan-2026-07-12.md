# QA-PDM-ACCOUNT-LIFECYCLE-001 - 帳號生命週期與安全管理台驗證計畫

日期：2026-07-12
狀態：Phase 1 QC Passed；Phase 2-3 尚未執行
DEV：`DEV-PDM-ACCOUNT-LIFECYCLE-001` / `DEV-045`
SPEC：`.ai-doc/specs/SPEC-PDM-ACCOUNT-LIFECYCLE-001-admin-account-security-console.md`
QC 證據：`.ai-doc/qc/qc-pdm-account-lifecycle-report-2026-07-13.md`

## Validation Objective

驗證 Admin 能透過 UI 安全管理已啟用帳號與角色有效期間，且停權、離職、identity 變更、session 撤銷、密碼重設與角色時間邊界不會破壞穩定 PDM ID、洩漏 secret、鎖死最後 Admin、恢復離職前權限或讓舊 session 在復權後重新有效。

## Risk Matrix

| Risk | Priority | Failure mode | Required control |
|---|---|---|---|
| ACL-R01 | P0 | 非 Admin 或跨公司操作帳號 | server role + membership/scope fail closed |
| ACL-R02 | P0 | 停權後舊 cookie/bearer 仍有效 | `session_invalid_before` checked on every auth path |
| ACL-R03 | P0 | 復權讓停權前 token 復活 | reactivation also advances invalidation timestamp |
| ACL-R04 | P0 | 自己／最後 Admin 被停權 | transactional self/last-admin guard |
| ACL-R05 | P0 | 最後 login identity 被停用 | active login identity guard |
| ACL-R06 | P0 | raw reset token/password/hash 洩漏 | hash-only storage, one-time response, payload scans |
| ACL-R07 | P0 | mutation 成功但 audit/outbox 失敗 | one transaction + forced rollback tests |
| ACL-R08 | P0 | duplicate request 產生多個有效 reset token | command receipt + one-pending-request constraint |
| ACL-R09 | P1 | UI 把 role expiry 當 account suspension | separate labels, status source and route ownership |
| ACL-R10 | P0 | lifecycle rewrite/delete breaks history | stable ID and historical attribution checks |
| ACL-R11 | P0 | production slice API gate誤開其他設定 | explicit account API allowlist/default deny regression |
| ACL-R12 | P0 | ProJED/live provider被意外修改 | Git/target boundary evidence |
| ACL-R13 | P0 | 離職或復職保留／恢復既有 system role、角色與代理 | system-role gate + atomic revoke + explicit role/identity re-enable + no silent privilege restore |
| ACL-R14 | P0 | role start/end 只顯示但權限仍可用 | fake clock + sync/async permission-path enforcement |
| ACL-R15 | P0 | reset 自動啟用刻意停用的 local identity | password update preserves identity status |
| ACL-R16 | P0 | recovery 被 CSRF、暴力猜測、referrer/history/log 洩漏利用 | fragment token, same-origin JSON, throttling and security headers |

## Required Fixtures

- Active Admin A、Active Admin B、Engineer、Google-only user、local-password user。
- Suspended、expired、offboarded accounts。
- User with local + Google identities；user with only one login identity。
- Pending/expired/revoked/consumed reset requests。
- Scheduled/active/expired/revoked role assignments，包含 `starts_at`、`review_due_at`、`hard_ends_at` boundary fixtures。
- Active/expired approval delegations and an offboard target that participates as delegator and delegate。
- Two valid pre-revocation tokens from different simulated devices and one bearer token。
- Disposable SQLite DB；可用時另加 disposable PostgreSQL shadow，禁止 production data。

## Phase 1 Acceptance Matrix

### List and Detail UI

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ACL-UI-001 | P0 | Admin opens `/settings/accounts` | account table loads with status/provider/role/company/last-login |
| ACL-UI-002 | P0 | Non-Admin opens page/API | 403/blocked state; no account data |
| ACL-UI-003 | P1 | Search/filter/pagination | stable query; no row duplication or stale detail |
| ACL-UI-004 | P0 | Open detail drawer | identities, role summary, lifecycle audit and actions match target user |
| ACL-UI-005 | P0 | Inspect network/UI | no password/token hash/raw provider subject/session token |
| ACL-UI-006 | P1 | 1440x900 and 390x844 | table/drawer/modal usable; no overlap, clipping or horizontal page overflow |
| ACL-UI-007 | P1 | Account invitation entry | routes to existing invitation page; no duplicate creation form |
| ACL-UI-008 | P0 | Account role summary | scheduled/active/expired/revoked, start/end/review and scope match server authority |
| ACL-UI-009 | P0 | Select role-time action | deep-links to `/settings/workflow` with target user; no duplicate role writer in account drawer |
| ACL-UI-010 | P0 | Role assignment editor | start and end controls are both present; preview states exact effective interval |
| ACL-UI-011 | P1 | Keyboard-only drawer/modal | focus trap, visible focus, Escape policy and focus return are deterministic |
| ACL-UI-012 | P0 | Offboard confirmation | reason and typed target name/email required; disabled action explains unmet condition |

### Account Lifecycle and Session Invalidation

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ACL-LC-001 | P0 | Suspend active user | status suspended; all old cookie/bearer requests return 401 |
| ACL-LC-002 | P0 | Reactivate suspended user | user may login again; old tokens remain invalid |
| ACL-LC-003 | P0 | Offboard active/suspended user | system role disabled, all non-revoked roles/delegations including future schedules revoked, login identities disabled and sessions invalidated atomically; history/IDs retained |
| ACL-LC-004 | P0 | Return offboarded user to work | explicit reason/confirmation plus newly selected system role and identity; old sessions/additional roles/delegations remain invalid/revoked |
| ACL-LC-005 | P0 | Admin suspends/offboards self | denied with `self_lockout_denied`; no mutation/audit-success/outbox-success |
| ACL-LC-006 | P0 | Target is last active Admin | denied with `last_admin_denied` under concurrent requests |
| ACL-LC-007 | P0 | Stale integer `expectedVersion` | 409; UI refreshes and retains reason draft |
| ACL-LC-008 | P0 | Manual global session revoke | status remains active; all prior tokens fail; new login succeeds |
| ACL-LC-009 | P0 | Body actor/company spoof | ignored/denied; authenticated Admin/company remains authority |
| ACL-LC-010 | P0 | Admin revokes own sessions | succeeds, response clears current cookie, all old cookie/bearer tokens fail |

### Identity Management

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ACL-ID-001 | P0 | Disable one of two login identities | selected identity disabled; other identity still logs in |
| ACL-ID-002 | P0 | Disable only login identity on active account | denied with `identity_last_login_denied` |
| ACL-ID-003 | P0 | Disable identity on suspended/offboarded account | allowed with reason; account remains inaccessible |
| ACL-ID-004 | P0 | Re-enable identity for active account | identity works; audit references stable identity ID |
| ACL-ID-005 | P0 | Treat invite provenance as login identity | prohibited; it does not satisfy last-login guard |
| ACL-ID-006 | P0 | Return-to-work without selected system role or login identity | denied; account stays offboarded and all writes rollback |

### Password Reset

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ACL-RST-001 | P0 | Admin creates reset link | raw URL returned once; DB stores 64-char hash only |
| ACL-RST-002 | P0 | Create second reset | prior pending request revoked atomically; only one valid token |
| ACL-RST-003 | P0 | Lookup valid token | masked identity only; no user enumeration fields |
| ACL-RST-004 | P0 | Weak password | denied; token remains usable until expiry |
| ACL-RST-005 | P0 | Complete valid reset for active local identity | password updated, token consumed, identity remains active, old sessions invalid |
| ACL-RST-006 | P0 | Reuse/expired/revoked token | stable generic failure; no mutation |
| ACL-RST-007 | P0 | Reset inactive account | denied until explicit lifecycle reactivation |
| ACL-RST-008 | P0 | Duplicate idempotency retry after timeout | no second token/event; raw token is not replayed |
| ACL-RST-009 | P0 | Admin requests reset for Google-only account | denied/disabled; no local identity or password hash created |
| ACL-RST-010 | P0 | Inspect command receipt after reset | safe request ID/status/expiry only; no raw token or reset URL |
| ACL-RST-011 | P0 | Complete reset for disabled local identity | password updated and token consumed, but identity remains disabled until separate audited enable |
| ACL-RST-012 | P0 | Recovery URL handling | token is fragment-only, read into memory, immediately scrubbed; never appears in request URL/referrer/history snapshot |
| ACL-RST-013 | P0 | Cross-site/form content-type request | rejected before lookup/complete mutation; no token state change |
| ACL-RST-014 | P0 | Burst invalid token/password attempts | generic response and deterministic IP/token/request throttling; no user enumeration |
| ACL-RST-015 | P0 | Recovery headers/resources | no-store/no-referrer/noindex; no analytics, third-party script/image or token-bearing log |

### Role and Delegation Effective Windows

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ACL-TIME-001 | P0 | Role has future `starts_at` | no role permission before boundary; UI shows `未生效` |
| ACL-TIME-002 | P0 | Clock equals `starts_at` | role permission becomes active on inclusive boundary |
| ACL-TIME-003 | P0 | Clock equals `hard_ends_at` | role permission is denied on exclusive boundary; UI shows `已到期` |
| ACL-TIME-004 | P0 | Blank start/end | role is immediately active with no hard expiry |
| ACL-TIME-005 | P0 | `starts_at >= hard_ends_at` or malformed date | save fails with stable error; prior assignment unchanged |
| ACL-TIME-006 | P0 | `review_due_at` passes | reminder/overdue state only; role remains governed by hard effective window |
| ACL-TIME-007 | P0 | Same fixture through sync/async/numbering/approval guards | every path returns the same allow/deny result |
| ACL-TIME-008 | P0 | Existing session crosses role end boundary | session may remain authenticated but expired role action is immediately denied |
| ACL-TIME-009 | P0 | Delegation before/at/after start/end | project/action delegation applies only inside its effective window |
| ACL-TIME-010 | P1 | Taipei date input around UTC day boundary | displayed inclusive dates and stored UTC exclusive end remain deterministic |

### Atomicity, Audit and Outbox

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ACL-TX-001 | P0 | Lifecycle mutation succeeds | user/session timestamp/audit/outbox/receipt commit once |
| ACL-TX-002 | P0 | Forced audit failure | all domain/session/outbox/receipt changes rollback |
| ACL-TX-003 | P0 | Forced outbox failure | all domain/session/audit/receipt changes rollback |
| ACL-TX-004 | P0 | Concurrent last-admin actions | at most one safe action; never zero active Admin |
| ACL-TX-005 | P0 | Concurrent reset requests | one pending token; deterministic conflict/reuse |
| ACL-TX-006 | P0 | Event payload scan | stable IDs/status/reasonCode only; no free-text reason/secret/token/hash/raw subject |
| ACL-TX-007 | P0 | Forced system-role/role/delegation/identity failure during offboard | account/system-role/session/role/delegation/identity/audit/outbox/receipt all rollback |

### Migration and Security Boundary

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ACL-DB-001 | P0 | SQLite additive migration | existing users/identities unchanged; new fields/table available |
| ACL-DB-002 | P0 | PostgreSQL/Supabase migration QC | ordered source hash, indexes/FKs/checks and parity pass |
| ACL-DB-003 | P0 | anon/authenticated direct table access | RLS/default-deny blocks recovery/session lifecycle tables |
| ACL-DB-004 | P0 | Legacy session before migration | remains valid until revoked because existing `createdAt` is compared with nullable invalid-before |
| ACL-DB-005 | P0 | No production target configured | QC fails closed for live apply; static/shadow validation remains explicit |
| ACL-DB-006 | P0 | Version defaults/backfill | every existing user/identity gets integer version `0`; concurrent mutation increments once |

## Regression Gate

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-account-lifecycle
npm.cmd run qc:pdm-account-invitations
npm.cmd run qc:pdm-google-identity
npm.cmd run qc:managed-auth
npm.cmd run qc:pdm-production-slice-numbering-draft
npm.cmd run qc:pdm-erp-module-foundation
npm.cmd run qc:supabase-runtime-migrations
npm.cmd run qc:postgres-shadow
```

Phase 1 focused QC 必須包含真實 API/session flow，不得只做字串掃描。若沒有 disposable PostgreSQL URL，報告必須分開標示 SQLite runtime proof 與 PostgreSQL schema/RLS static proof。

## 2026-07-13 QC Result

Phase 1 本機驗證已執行：

- `npm run qc:pdm-account-lifecycle`：通過 26/26。
- `npm run qc:pdm-account-invitations`：通過 25/25。
- `npm run qc:pdm-google-identity`：通過 19/19。
- `npm run qc:pdm-production-slice-numbering-draft`：通過 27/27。
- `npm run qc:supabase-runtime-migrations`：通過 39/39。
- `npx tsc --noEmit`：通過。
- `npm run lint`：0 errors；剩餘 3 個 `master-attachment-panel.tsx` 既有 warning，非本 DEV 修改範圍。
- `npm run build`：被專案 `prebuild` guard 擋下，原因是 `127.0.0.1:3000` 已有 `node.exe` dev server；未停用 server，未使用 bypass。

判定：Phase 1 本機帳號生命週期、session invalidation、reset token redaction、identity status、角色時間區間與 migration parity 通過 focused QC；release gate 前需補 build evidence。

## No-Go Criteria

- 任一舊 session 在 suspend/offboard/revoke/reset 後仍可通過。
- 復權讓舊 token 恢復有效。
- 可停用自己、最後 Admin 或 active account 的最後 login identity。
- raw token、password、hash、provider subject 或 secret 出現在 list/log/audit/outbox。
- lifecycle mutation與audit/outbox非 atomic。
- UI 將角色到期、identity disabled、account suspended 混成同一狀態。
- 角色開始／到期時間只影響顯示，任一同步或非同步 permission path 仍忽略時間區間。
- offboard 後 `system_role_enabled=true`、仍有 non-revoked role/delegation/login identity，或 return-to-work 未經明確重選就恢復離職前權限。
- disabled local identity 因 password reset completion 被自動啟用。
- recovery token 出現在 query string、request/access log、referrer、analytics、audit 或瀏覽器歷史快照。
- Admin mutation 可被 cross-site cookie request 或非 JSON form submission 執行。
- 需要 live migration、provider cutover、production deploy、資料修復或 ProJED 修改。

## Evidence Required

- API/state/permission/transaction focused QC report。
- 兩裝置 cookie + bearer token invalidation evidence。
- reset token hash、one-time、expiry/reuse evidence。
- recovery fragment scrubbing、CSRF/rate-limit/security-header/log-redaction evidence。
- role/delegation effective-window fake-clock matrix，涵蓋同步／非同步與 boundary before/at/after。
- offboard atomic role/delegation/identity revoke 與 return-to-work no-privilege-restore evidence。
- forced audit/outbox rollback及 concurrent last-admin/reset evidence。
- RLS/grant/migration parity report。
- desktop/mobile screenshots、keyboard focus、typed confirmation與無 overflow 檢查。
- invitation/Google/managed-auth/production-slice/DEV-044 regressions。
- Git evidence showing no ProJED、production data、live provider or release operations。

## Release Boundary

通過本 QA 計畫不代表 production ready。DEV-046 `HD-8-1..4` 已關閉，但 Merge、PR、live migration、deploy、rollback、production smoke、Firebase Auth with Identity Platform/MFA rollout 仍需完成 `HD-8-4 / 1A` pre-canary Cloud SQL restore/reconciliation evidence、release 型指令與既有 DEV-030/031/032 gate。完整 PDM/GCS/offline restore 仍不納入本帳號 QA。
