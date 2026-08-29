# DEV-032 Production Activation Runbook

Status: active release runbook; Wave 0 validation retired on 2026-08-29; explicit candidate, Level 4, promotion and rollback gates retained
Scope: DEV-032 / DEV-046 Phase 3A.0 official-numbering and draft production slice
Production action authorized by this file: none

## Purpose

This runbook defines the sequence for turning the existing DEV-032 release gate package into a controlled production activation. It is a handoff checklist, not an approval. Every live write boundary still needs separate explicit authorization.

## Inputs

- `config/platform/production-target.template.json`
- `config/platform/clean-production-seed.template.json`
- `config/platform/production-activation-checklist.template.json`
- `config/platform/firebase-hosting.production.json`
- `infra/google-cloud/production/`
- `.ai-doc/runbooks/runbook-dev-032-production-canary-restore-reconciliation-2026-07-15.md`
- `output/dev-032-release-source/manifest.json`
- `output/dev-032-production-target-preflight/report.json`
- `output/dev-032-rollback-drill/v2-api-report.json`
- `output/dev-032-rollback-drill/v2-api-closure.json`
- `scripts/run-dev-032-production-traffic-rollback.mjs`

## Sequence

1. Reconfirm the exact release commit and source boundary. Stop if unknown-risk paths are not zero.
2. Read back `jenfu-ai-pdm-prod`, production Cloud Run, Cloud SQL and Secret Manager metadata. Names only; no secret values.
3. Review production Firebase/Auth and environment source. Stop if any staging project, `web.app` gateway, staging Cloud SQL, staging Cloud Run or staging secret value appears.
4. Run a credentialled Terraform plan for review only after explicit approval. Stop on any delete, replace, target drift or estimate above USD 240.
5. Apply production resources only after separate apply approval and the exact acknowledgement in the Terraform package.
6. Import or apply clean seed/admin bootstrap only after separate data-write approval. Seed must contain only new production IDs, minimum company/role/config, initial Admin, numbering sequence and non-reuse reservations.
7. Execute Cloud SQL migration only after backup, rollback and migration-history checks are present.
8. Complete `HD-8-4 / 1A`: restore a production recovery point to a separate isolated target and pass schema, account, audit, receipt, outbox, numbering sequence and non-reuse reconciliation.
9. Run Level 3 production-like smoke before production traffic.
10. Deploy the exact candidate at 0% traffic only after separate deploy approval; deployment does not authorize promotion.
11. Run candidate-bound authenticated Level 4 smoke for login, privacy acknowledgement, permissions, numbering, draft persistence, re-login persistence and fail-closed file/access paths.
12. Record zero open P0/P1, rollback readiness and Product Owner `go`; named-user Wave 0 testing and waiver evidence are not part of this decision.
13. Promote traffic only with the exact promotion token and the candidate revision still at 0% traffic with immutable provenance intact.
14. Run canonical post-promotion smoke at the production entrypoint. Roll back traffic to the pinned previous revision if it fails.

## Canonical Workbench Authority Repair Contract

Use this path only when the canonical authority guard blocks production because the runtime and the singleton control row are not bound to the same exact release commit.

1. The candidate deployment must set `PDM_BUILD_COMMIT` to the full release SHA and read it back from the inactive revision before any database repair.
2. The inactive revision must bind `PDM_WORKBENCH_CONTRACT_SECRET` to Secret Manager secret `pdm-workbench-contract:latest`; read back the secret name and version only. A missing binding is a mandatory stop because production token issuance fails closed.
3. Execute `npm run production:authority-repair -- --execute` only from the exact migration image for that SHA, through `ai-pdm-prod-migration-runner` and its production migration IAM identity.
4. Supply the explicit repair approval, exact project/region/database target, current `expected_commit`, current `row_version`, and the new full release SHA. The runner uses a serializable transaction, locks singleton row `id=1`, and applies a compare-and-swap update.
5. The update may change only `expected_commit`, `row_version`, and `switched_at`; `mode=canonical_only` and `schema_hash=dev090-v1` must remain unchanged. Any mismatch rolls back.
6. Keep candidate traffic at 0% after the repair. With an authenticated company session, require both the 料號工作台 and 圖號工作台 read APIs to return 200; unauthenticated 401 evidence is insufficient.
7. Run production read-only reconciliation, retain the authority repair receipt, and only then use the normal traffic-only promotion gate.
8. After promotion, repeat both authenticated workbench reads through `https://jenfu-ai-pdm-prod.web.app`. A 503 or `WORKBENCH_AUTHORITY_MISMATCH` is a mandatory rollback stop.

## Cloud Run Traffic Rollback Contract

The production service rollback changes traffic only. Do not use `gcloud run services update-traffic` for `ai-pdm-prod`; the 2026-07-16 drill proved that restoring traffic through that command can create a new revision by changing the service template. Use the guarded runner, which calls Cloud Run v2 with `updateMask=traffic`, or an equivalent reviewed REST request whose body contains only `traffic`.

1. Run `npm run dev-032:production-traffic-rollback -- --mode validate --rollback-revision <previous-ready-revision>` first. This sends both rollback and latest-restore requests with `validateOnly=true` and performs no traffic mutation.
2. Before execute mode, pin the exact project, region, service and current latest-ready revision in the required environment gates. A stale latest revision is a mandatory stop.
3. Roll back to one explicit previous ready revision at 100%. Do not use tags, splits or an unspecified revision.
4. Read back the service and require the template SHA-256, `latestCreatedRevision` and `latestReadyRevision` to remain unchanged. Only the service generation and traffic target may change.
5. Restore 100% traffic with `TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST`. Cloud Run v2 intentionally omits the `revision` field for a LATEST target; validate the target type and compare `latestCreatedRevision` and `latestReadyRevision` to the pinned revision instead.
6. Read back the restored state and repeat the template/revision invariants. Any mismatch is a release stop, not a warning.
7. Run a credentialled Terraform plan after the drill and require Terraform no-drift evidence with zero add, change and destroy before closing rollback readiness.

The accepted 2026-07-16 evidence is `v2-api-closure.json` with `allChecksPassed=true`, followed by `v2-post-drill-plan.txt` proving no Terraform drift. The earlier CLI-path attempt is retained as negative evidence and must not be repeated.

## Firebase Hosting Production Pilot Contract

The current production pilot intentionally does not wait for DNS. Use only `https://jenfu-ai-pdm-prod.web.app` with the reviewed rewrite to `ai-pdm-prod` in `asia-east1`.

1. Terraform must set the canonical public URL, session issuer and Firebase Auth domain to the same production `web.app` origin.
2. Cloud Run may use all ingress and an enabled default URL only while the exact Hosting acknowledgement is present. Direct `run.app` origin session exchange must remain denied.
3. Deploy with `config/platform/firebase-hosting.production.json`; do not deploy the root staging `firebase.json` to production.
4. Hosting must use private/no-store headers, `pinTag=false` and no Firebase Functions, Firestore or Firebase Storage.
5. Read back the Hosting release, `/login`, `/api/auth/mode`, `/__/auth/handler` and an unauthenticated protected API. A direct `run.app` session-exchange request must fail closed.
6. DNS, custom-domain managed TLS and LB-only ingress are deferred. Existing ALB resources remain untouched and must not be deleted merely because the pilot uses Hosting.

## Mandatory Stops

- Plan contains delete or replace.
- Monthly estimate is above USD 240.
- Production project or active gcloud project is ambiguous.
- Production env source is missing or contains staging values.
- Any secret value appears in files, reports or terminal output intended for evidence.
- Clean seed includes source business, draft, demo, test, credential, session or historical actor rows.
- `HD-8-4 / 1A` restore/reconciliation is missing or failed.
- Level 3 or Level 4 smoke is missing or failed.
- A rollback or restore changes the Cloud Run template, creates a revision, changes the latest-ready revision, or leaves Terraform drift.

## Explicit Non-Scope

- This runbook does not authorize production apply, deploy, SQL import, Cloud Run Job execution or traffic cutover.
- This runbook does not activate GCS file authority.
- This runbook does not start DEV-047 schema migration.
- This runbook does not replace full PDM/GCS/offline restore drills deferred under DEV-037.
