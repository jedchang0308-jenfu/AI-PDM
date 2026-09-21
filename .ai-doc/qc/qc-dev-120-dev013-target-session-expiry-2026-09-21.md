# DEV-120 / DEV-013 P_BOTH target session expiry QC

- Native task: `DEV-120`
- Source task: Jenfu-Platform `DEV-013 / 013-R1-P_BOTH-AIPDM-SESSION-TTL`
- Status: `Local Fix Complete / Protected Production Release Pending`
- Production run: `DEV013-P-BOTH-CATALOG-R2-20260920T235541Z`
- Fixed production source observed: AI-PDM `c2e1790a2c80dd1a05e9116d842ff8f7a08b2450`、OrgMaster `beab21ed74640bc466e13a64755d3088019abae6`
- Production target: `jenfu-platform-prod / asia-east1 / ai-pdm-prod / jenfu-platform-prod-pg / jenfu_prod`

## Production finding and safe state

The fixed AI-PDM role catalog `ai-pdm.role-catalog.2026-09-03.v3` was published application-wide with a PASS, `APPLIED_ONCE` receipt. Its receipt self-hash is `3699aca7c50b1930c1403b591146624aa0599a38e47b93b0736fd401b0b1a383`; replay returned the same receipt and did not create a second publication.

The exact employee/application switch `employee-shijie / ai-pdm` then moved from `legacy_authority:3` to `orgmaster_authority:4`. The switch receipt passed every readback check, projected and effective `system_admin`, and has self-hash `029c9e274ceda27cfac3ac1d379f2d8cd5cd0952c985f183a7e559840d0607ac`. A task-owned browser proved Platform normal entry reached AI-PDM without a second password prompt and loaded the AI-PDM root.

After the short handoff assertion lifetime elapsed, AI-PDM protected requests returned 401 even though the source Platform session remained valid. The run did not claim Production L4 PASS. The single employee/application was safely rolled back from `orgmaster_authority:4` to `legacy_authority:5`. The rollback receipt is PASS, `APPLIED_ONCE`, has self-hash `2a0ad84db516b09723c4568df0feb85a4f49ea887cc206c83f4229533000ca97`, and readback proves effective roles are empty. Both exact temporary Cloud Run Jobs were deleted. No schema, migration, service, traffic, IAM or Secret mutation occurred.

Evidence is stored under Platform `output/dev-013/l4/DEV013-P-BOTH-CATALOG-R2-20260920T235541Z/`, including `catalog-receipt.json`, `authority-switch-receipt.json`, `authority-switch-verification.json`, `authority-rollback-receipt.json`, `authority-rollback-verification.json` and exact Job deletion readbacks.

## Root cause and contract decision

`jenfuSsoCallback` previously calculated the local target session expiry as the minimum of the app eight-hour limit, `sourceSessionExpiresAt`, and `handoff.expiresAt`. The last value is the short-lived one-time assertion freshness boundary, so the application session inherited an approximately five-minute lifetime.

Platform DEV-013 fixes the target rule as:

```text
expiresAt = min(now + appMaxAge, sourceSessionExpiresAt)
```

The signed handoff assertion `expiresAt` remains mandatory and is still rejected when stale during callback parsing. It does not cap the application session after a successful exchange. This keeps replay resistance at the exchange boundary while preserving the source-session and app-owned lifetime caps.

## Implementation

- `src/lib/jenfu-sso-handoff.ts`
  - adds one eight-hour application session maximum;
  - adds `resolveJenfuTargetSessionExpiry(nowSeconds, sourceSessionExpiresAt)`;
  - rejects invalid or non-future source expiry;
  - issues the target session from the app/source minimum only.
- `src/lib/jenfu-sso-handoff.test.ts`
  - proves the eight-hour app cap;
  - proves an earlier source session cap;
  - proves an expired source session fails closed.

## Verification

| Gate | Result |
|---|---:|
| `npm run test:dev-013` | 4／4 PASS |
| `npm run test:dev-013:l3` | 17／17 PASS |
| `npm run typecheck:app` | PASS |
| `npm run check:db-boundary` | PASS |
| `npm run build:isolated` | PASS; artifact=true, primary=true, cleanup=true |
| `git diff --check` for implementation files | PASS; only existing LF→CRLF notices |

The build used a task-owned isolated source/data copy, opened no port, did not create or mutate the primary PDM database, and removed its runtime directory before exit.

## Remaining release gate

The local fix does not authorize or represent a production deployment. Completion still requires a clean exact merge revision, one owner-native protected AI-PDM release, provider readback of the immutable artifact and canonical revision, then a new single-employee authority switch from the current `legacy_authority:5`. Full Platform→AI-PDM normal entry must remain valid beyond the assertion lifetime, the permission surface must succeed, global logout must revoke both sessions, and rollback/readback must remain available. Until those cells pass, DEV-013 remains open.
