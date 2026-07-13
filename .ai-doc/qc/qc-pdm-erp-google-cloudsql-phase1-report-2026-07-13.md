# DEV-046 Phase 1 QC Report

Date: 2026-07-13
QC boundary: Local Phase 1A-1E only
Verdict: PASS for local implementation; NOT READY for staging or production

## Evidence matrix

| Evidence | Result |
|---|---|
| `npm run qc:dev-046-phase1` | PASS, 86/86 focused assertions |
| `npm run qc:dev-046-phase1a` | PASS, 16/16 |
| `npm run qc:dev-046-phase1b` | PASS, 15/15 |
| `npm run qc:dev-046-phase1c` | PASS, 17/17 |
| `npm run qc:dev-046-phase1d` | PASS, 14/14 |
| `npm run qc:dev-046-phase1e` | PASS, 24/24 |
| `npm run qc:pdm-erp-module-foundation` | PASS |
| `npm run qc:postgres-shadow` and `npm run qc:supabase-runtime-migrations` | PASS; generated migration/mirror trace aligned |
| Managed auth, invitation and account-lifecycle suites | PASS |
| Production-slice numbering/draft suite | PASS |
| File-storage contract and local-provider regression | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS with zero errors and three existing warnings |
| `docker build -t ai-pdm:dev046-phase1 .` | PASS; isolated Next production build and TypeScript completed |
| Non-root container HTTP/API smoke | PASS; login page, password login and authenticated user endpoint returned 200 |
| Playwright standalone browser smoke | PASS; `/login` -> `/`, Engineer workbench and logout control visible |

## Security and authority checks

- Static database passwords and service-account key files fail closed for `cloud_sql_postgres`.
- Cloud SQL runtime accepts only the localhost proxy boundary and preserves at least 30 percent connection capacity under the declared rollout budget.
- Browser source has no database authority; app transport source is scanned for inline provider protocol/business persistence.
- GCS Phase 1 adapter is deliberately disabled for live I/O. Formal pointers require provider/bucket/key/generation/hash/size semantics.
- Operational log fixtures reject secrets, credentials, tokens, provider subjects, PII and business payload fields.
- Clean-production fixtures reject source business rows, drafts, demo/test rows, historical rows, credentials and sessions.
- Phase 1 scanners reject Firestore, Firebase Storage, Firebase Functions, Callable and trigger authorities.
- No live resource, credential, billing, DNS, migration, deletion, deployment or ProJED action occurred.

## Observed non-blocking issues

- Next build reports the existing Next.js middleware-to-proxy deprecation warning.
- ESLint reports two `useMemo` dependency warnings and one `no-img-element` warning in `src/components/master-attachment-panel.tsx`.
- The unauthenticated login shell requests the permission endpoint and receives 401; it also requests a missing favicon. After Engineer login, the dashboard requests an approval inbox that correctly returns 403 for that role. These do not break the tested flow, but the UI should suppress requests that the current page/role cannot use.

## QC conclusion

Phase 1A-1E satisfy the local implementation contract. The templates intentionally retain `releaseReady: false` or equivalent placeholders where real project IDs, owners, measured costs, backup responder and provider evidence are absent. No Phase 2 staging, pre-canary restore/reconciliation, deployment, production smoke or `DEV-FIELD-001` credit is granted by this report.
