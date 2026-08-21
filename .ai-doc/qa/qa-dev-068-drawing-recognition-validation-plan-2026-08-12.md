# QA DEV-068 - 圖面／CAD 全項辨識、同頁審核與正式化驗證計畫

Status: Focused Local QA Executed / Critical Path Passed / Extended Matrix & Production Evidence Gated
Date: 2026-08-12
Owner: QA
Related DEV: `DEV-068`
Implementation authority: `.ai-doc/specs/SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md`
Fixture authority: `.ai-doc/qa/fixtures/dev-068-a0005-fixture-manifest.md`

## 1. QA Objective

Verify that incomplete 3D properties do not block upload/management, every OCR/CAD/filename result remains a traceable candidate, users review all six categories on one page, multi-part baseline/differences remain correct, and only one authorized atomic formalization command can change formal PDM data.

This plan validates local Phase 1A～1D. It does not validate a paid/live OCR provider, production files, production migration, deployment or release.

## 2. Entry Criteria

- `PDM_DRAWING_RECOGNITION_V1=true` only in an isolated local environment with required unified drawing dependencies enabled.
- SQLite additive schema and PostgreSQL 033 pass dry-run/parity checks.
- recognition worker uses a disposable token and local repository; no production credential is present.
- A0005 source hashes match the fixture manifest.
- deterministic mock/fixture adapter identifies itself and is impossible to enable in production mode.
- RD supplies exact affected-file list, migration result, test commands and known limitations.

## 3. Evidence Standard

Each case records test ID, commit/worktree identity, DB provider, feature flags, actor/company, source hash, request/response status, before/after row counts or hashes, and result. Browser cases additionally record viewport, screenshot, console errors, failed network requests and focus/a11y observations. Secrets, raw customer text outside the fixture and local absolute provider paths are redacted.

## 4. Validation Matrix

### 4.1 Schema, parity and authority

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-001 | Fresh SQLite schema | All DEV-068 tables, constraints, indexes and append-only triggers exist. |
| DRR-002 | Existing SQLite dry-run/apply/reapply | Dry-run is zero-write; confirmed apply is additive; reapply is idempotent. |
| DRR-003 | PostgreSQL 033 clean apply/reapply guard | Logical schema matches SQLite; second unsafe apply is rejected or safely no-op per migration convention. |
| DRR-004 | Provider schema parity | Enum/check, unique, FK, index and immutable behavior produce equivalent outcomes. |
| DRR-005 | Feature off | Existing upload/revision behavior is unchanged; no session, route exposure or CTA appears. |
| DRR-006 | Canonical authority | Session references existing file assets/drawing/revision/parts and never copies or creates canonical identity. |
| DRR-007 | Legacy formal projection | Generic formal row wins; absent generic row falls back to `part_variant_attributes`; no double value appears. |
| DRR-008 | Append-only evidence/audit | Observation, decision, formalization event/link update/delete attempts fail in both providers. |

### 4.2 Session, source and worker

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-009 | Authorized automatic enqueue after first file | Upload succeeds and a queued session is returned/observable asynchronously. |
| DRR-010 | Sequential 3D＋2D upload | Complete source set creates/reuses one latest session; any earlier queued session is cancelled/superseded without rewriting its fingerprint. |
| DRR-011 | Duplicate hook/API retry | Same lineage/source fingerprint/idempotency does not duplicate sessions. |
| DRR-012 | Upload enqueue failure | File upload/submission still succeeds and returns a safe recognition warning. |
| DRR-013 | Claim concurrency | Two workers cannot claim the same session. |
| DRR-014 | Heartbeat and stale lock recovery | Active lock is retained; expired lock is retried within attempt limits with diagnostics. |
| DRR-015 | Source changed after create | Old session becomes stale and cannot formalize; successor uses new hash. |
| DRR-016 | One adapter unsupported | Visible unsupported diagnostic; successful adapters remain reviewable. |
| DRR-017 | One adapter timeout/failure | Session is `extraction_partial` when evidence exists; successful observations are preserved. |
| DRR-018 | All adapters fail | Queryable `extraction_failed`; no fabricated empty-success review. |
| DRR-019 | Worker token/lock/source validation | Missing/wrong token, worker ID, content hash or lock owner is rejected without stored observation. |
| DRR-020 | Payload bound/redaction | Oversized/malformed provider output is rejected; logs contain safe codes, not raw drawing text/secrets. |

### 4.3 Classification, baseline and decisions

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-021 | Source is not category | OCR/CAD/filename evidence appears under its destination domain, not separate competing tabs. |
| DRR-022 | Open unknown field | Unknown label is retained and can map/create/defer/ignore without evidence loss. |
| DRR-023 | Company field collision | Exact key is DB-rejected; similar label warns and requires explicit reviewer choice. |
| DRR-024 | Multi-source same value | UI groups the candidate while every source observation remains queryable. |
| DRR-025 | Multi-source conflict | All conflicting values/current formal value are visible; confidence does not auto-select. |
| DRR-026 | Overall vs local scope | Overall roughness may be a part attribute; local roughness/GD&T stays engineering evidence. |
| DRR-027 | Missing is not clear | Unrecognized/missing value never emits clear/not-applicable. |
| DRR-028 | Explicit not applicable | Direct `無/取消/N/A/不適用` evidence plus reason can propose the explicit state. |
| DRR-029 | Baseline all equal/strict majority/tie | All-equal and unique >50% mode are proposed; tie/no majority has no automatic baseline. |
| DRR-030 | Human baseline correction | Recalculation preserves explicit per-part decisions and surfaces stale conflict. |
| DRR-031 | Decision optimistic concurrency | Stale expected session version returns 409 and preserves prior decisions. |
| DRR-032 | Decision recovery | Reload restores server-saved decisions; failed explicit actions remain visibly retryable and are never represented as saved/formal data. |

### 4.4 Permission and tenancy

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-033 | RD own/assigned scope | RD can run/review/formalize non-Released own/assigned objects only. |
| DRR-034 | RD cross-owner scope | Same-company unassigned object is denied without leaking evidence. |
| DRR-035 | Manager/admin scope | RD manager, PDM admin and system admin work company-wide subject to lifecycle guard. |
| DRR-036 | Read-only roles | Document admin/QA/manufacturing/procurement/external specialist cannot run/review/formalize. |
| DRR-037 | Cross-company session/source/target | GET and every command return 404/403 per convention with zero leaked raw text, formal value or existence hint. |
| DRR-038 | Released/controlled target | Recognition formalize alone is insufficient; `post_release_change` and reason are both required. |
| DRR-039 | Auto enqueue authority | Internal enqueue records initiating actor but does not grant review/formalize permission. |

### 4.5 Write impact and formalization

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-040 | Write-impact zero-write | Counts/hashes of every formal table remain unchanged. |
| DRR-041 | Actual-change projection | Only creates/updates/explicit clears/conflicts/blockers/exclusions appear; no inherited/no-op row. |
| DRR-042 | Return to review | `返回核對` preserves review state and produces zero formal change/event. |
| DRR-043 | Valid atomic formalization | All values/notes/evidence/event/links/session terminal state commit once and are traceable. |
| DRR-044 | Forced target failure | Both providers roll back every intended row, event/link and terminal session update. |
| DRR-045 | Repeated idempotency key/same payload | Original result is returned; no duplicate write/event. |
| DRR-046 | Same idempotency key/different payload | Platform receipt payload mismatch rejects the command. |
| DRR-047 | Stale target after impact | 409 before mutation; user must recalculate impact. |
| DRR-048 | Concurrent formalization | Exactly one command commits in SQLite and PostgreSQL; the other reuses or conflicts safely. |
| DRR-049 | Missing relation/owner/field | Affected intended item blocks at 422; recognition does not create canonical relation/identity. |
| DRR-050 | Rerun after formalization | Successor session is new and editable; prior session/event/evidence remain immutable. |

### 4.6 UI, A0005 and accessibility

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-051 | One-page six-section review | All sections exist in one scroll surface; navigator scrolls to anchors and shows complete blocker counts. |
| DRR-052 | Evidence drawer | Source/page/sheet/config/raw/extractor detail is protected; close restores focus and scroll position. |
| DRR-053 | Visual state semantics | Proposed/corrected/conflict/ignored/deferred/blocked use text/icon as well as color. |
| DRR-054 | Impact modal | CTA labels are exactly `確認寫入內容`, `返回核對`, `正式寫入 PDM`; no duplicate full preview page exists. |
| DRR-055 | Responsive 1440/1024/390 | No clipped blocker, owner, current value or intended change; narrow view remains operable. |
| DRR-056 | Keyboard/a11y | Logical tab order, named controls/regions, focus trap/return, Escape behavior and status announcements pass. |
| DRR-057 | A0005 source identity | Both file hashes, roles, lineage and three linked parts match the manifest. |
| DRR-058 | A0005 baseline/variants | Material/color/surface/note baseline and P02/P03 differences exactly match the manifest. |
| DRR-059 | A0005 partial capability | No real OCR/native adapter configured still yields a truthful filename/fixture/unsupported result and never reports OCR quality PASS. |
| DRR-060 | A0005 end-to-end no-write/write | Before final command zero formal rows change; valid command writes exact intended delta once with complete traceability. |

## 5. Browser Matrix

- viewports: `1440x900`, `1024x768`, `390x844`.
- states: queued, extracting, review-ready, partial, failed, conflict, blocked, stale, impact-ready, formalized.
- actors: RD owner, RD non-owner, RD manager, PDM admin, QA/read-only, cross-company user.
- mandatory sweeps: console errors, failed fetches, unexpected 5xx, horizontal overflow, hidden blockers, keyboard path, focus return and text alternatives.

## 6. Exit Criteria

Local QA can pass only when DRR-001～060 pass on the applicable provider/browser matrix, `build:isolated`, typecheck, affected ESLint and `git diff --check` pass, and reports prove zero formal mutation before confirmation plus zero partial mutation after forced failure.

The following remain separate release gates even after local QA PASS:

- approved real OCR/CAD executable/provider, license, cost and security review;
- representative production-safe gold set and measured field/owner correction rates;
- production migration artifact/dry-run and operator authorization;
- staging/production worker topology, protected object download and health monitoring;
- deploy, production smoke, rollback verification and release approval.

## 7. Stop Conditions

Stop and return to Dev PM/user if testing requires production/staging files or credentials, modifies the original A0005 bytes, installs/purchases a provider without authorization, finds a cross-company leak, observes any pre-confirmation/partial formal write, requires a distributed non-atomic target, creates canonical identity/relation through recognition, or can only pass by treating mock output as real OCR quality.

## 8. Focused Local Execution Result — 2026-08-12

Result: `PASS for authorized local critical path`; the full DRR-001～060 provider/actor/production matrix remains gated and is not claimed as executed.

Executed evidence:

| Evidence | Result | Covered facts |
|---|---|---|
| `npm run qc:dev-068:contract` | PASS | six categories, N/A vocabulary, missing-value safety marker, versioned/bounded external adapter, filename-only fixture rejection, governed open fields, `shell:false` |
| `npm run qc:dev-068:a0005-core` | PASS | verified A0005 hashes, 21 candidates, P01/P02/P03, baseline/variants, open field formalization, missing no-change, N/A reason, idempotency, append-only, stale target, atomic rollback |
| `npm run qc:dev-068:schema` | PASS | 14 SQLite + 14 PostgreSQL tables, PostgreSQL 18.4 disposable apply of 001 + 033, 3 permissions × 4 roles, 8 immutable-trigger tables, no destructive statement |
| `npm run qc:dev-068:browser` | PASS | actual Next login/API/worker flow, 401 worker guard, six sections, evidence drawer, desktop/mobile impact preview, Escape/Tab/focus return, no horizontal overflow, formalization |
| `npm run typecheck:app` | PASS | focused application TypeScript |
| `npm run build:isolated` | PASS | Next.js 16.3 production build, 127 pages, all recognition routes/page present |

Latest evidence directories:

- `output/qa/dev-068-drawing-recognition/contract-20260812102916-local-isolated/`
- `output/qa/dev-068-drawing-recognition/A0005-20260812102918-local-isolated/`
- `output/qa/dev-068-drawing-recognition/schema-20260812101840-postgres-local-isolated/`
- `output/qa/dev-068-drawing-recognition/browser-20260812103253-local-isolated/`

Known gates:

- No real OCR/native CAD extraction quality is claimed; the A0005 adapter is hash-locked local fixture evidence.
- Full fresh PostgreSQL chain is blocked by pre-existing migration 004 `approval_rules.phase` drift outside DEV-068; isolated PostgreSQL 001 + 033 semantic schema was executed successfully.
- Production/staging files, credentials, migration, distributed concurrency, deployment, rollback and representative user/gold-set validation remain release work.

## 9. DEV-082 PDF Browser OCR Validation Amendment — 2026-08-20

Status: `RD Implemented / Local QA-QC Complete / OCR-082-001..044 PASS / Production Release Gated`

This amendment validates the reopened real-PDF-content gap under DEV-068. The §8 evidence remains the Phase 1A～1D baseline, but it does not pass DEV-082 and must not be presented as proof that browser PDF OCR works.

### 9.1 Entry Criteria

- SPEC §0.12 remains the passed cross-source／geometry baseline and §0.13 is `RD Implementation Ready` for the active magnifier-readability slice; `config/drawing-ocr-field-priorities.json` and SolidWorks alias mapping continue to share the canonical revision semantic contract.
- The PDF.js and Tesseract.js packages, Traditional Chinese and English language assets, licenses and hashes are pinned and recorded in the lockfile/SBOM.
- A production-safe fixture set exists for text-layer PDF, scanned Traditional Chinese／English PDF, mixed PDF, conflicting title blocks, missing fields, encrypted/corrupt PDF and over-capacity keyword content. Gold labels are reviewed by a human and contain no production secret or personal data.
- Test runtime confirms browser OCR creates no third-party network request and requires no user installation, API key, OCR host or worker-local environment variable.
- Tests use disposable local data and an authorized actor; production/staging files, live schema, traffic and release remain out of scope.

### 9.2 Required Test Matrix

| ID | Test | Expected evidence / pass condition |
|---|---|---|
| OCR-082-001 | Adapter-plan extension matrix | Only canonical `.pdf` sources receive `browser-pdf-ocr.v1`; SolidWorks native formats retain DEV-035, while JPG／JPEG／PNG／DWG／other files remain filename-only. |
| OCR-082-002 | Native text-layer PDF | PDF.js extracts sufficient text and Tesseract invocation count is zero. |
| OCR-082-003 | Scanned `chi_tra+eng` PDF | Only pages below the text-layer threshold are rasterized and OCR produces traceable page evidence. |
| OCR-082-004 | Mixed PDF | Text pages bypass OCR, scanned pages use OCR, and the document produces one merged deterministic result. |
| OCR-082-005 | Tier 0 outcome completeness | `drawing_number`、`revision`、`part_number`、`title`、`material`、`scale`、`drawn_by` each reports `found`、`conflict` or `not_found`; no required field is silently omitted. |
| OCR-082-006 | Required fields under cap pressure | All retained Tier 0 values are selected before Tier 1～3; lower tiers cannot evict them from the 50/source or 100/session capacity. |
| OCR-082-007 | Required-field conflicts | Up to five distinct normalized values retain best evidence; a sixth distinct value emits partial/conflict diagnostics and blocks that field from formalization. |
| OCR-082-008 | Missing required field | Stable `not_found` diagnostic is returned; no blank observation, invented value, auto-clear or formal overwrite occurs. |
| OCR-082-009 | Tier 1 and Tier 2 fill | Remaining capacity is filled by deterministic utility order using the configured field tier, business value, label match, confidence, location, corroboration, duplicate and noise terms. |
| OCR-082-010 | Deterministic ranking | Same source hash, config version and engine version produce the same normalized observations and tie-break order across repeated runs. |
| OCR-082-011 | Tier 3 bound | Unclassified engineering keyword blocks never exceed ten per PDF and cannot displace Tier 0～2 selected records. |
| OCR-082-012 | Hard capacity | Persisted browser-PDF observations are at most 50/source and total selected observations are at most 100/session, with counts reported by tier and discard reason. |
| OCR-082-013 | Data minimization | DB, API response, logs and diagnostics contain only selected field evidence and aggregate discard counts; no full OCR word array, page bitmap, raw PDF/base64 or discarded customer text is persisted. |
| OCR-082-014 | Policy/config fail-close | Missing, invalid, duplicate or unknown config version prevents adapter completion with a stable safe error; it does not fall back to uncontrolled ranking. |
| OCR-082-015 | Authorized content GET | Correct company, session, source and actor can stream the source with expected hash, MIME, no-store headers and bounded range/size behavior. |
| OCR-082-016 | Tenant/actor isolation | Wrong company, actor, session/source pair or expired authorization is denied without metadata or byte leakage. |
| OCR-082-017 | Source integrity | Extension, MIME, PDF magic bytes and content hash mismatch returns terminal `failed/pdf_source_invalid`; no image or OCR fallback runs. |
| OCR-082-018 | Single completion write | One PDF produces one bounded `client-adapter-results` POST; no per-page result write or unbounded retry stream occurs. |
| OCR-082-019 | Idempotent duplicate | Same session/source/adapter/fingerprint is accepted once and replayed safely through the existing unique adapter-result authority. |
| OCR-082-020 | Stale/race handling | Different fingerprint, stale session row version, finalized session or concurrent completion returns stable conflict and does not partially append observations. |
| OCR-082-021 | Formalization gate | Planned client adapter pending/failed blocks recognition formalization only; drawing save, upload and lifecycle submit retain the existing DEV-079/068 behavior. |
| OCR-082-022 | Invalid/encrypted PDF | Corrupt, encrypted, password-protected and unsupported PDF failures become visible terminal errors with sanitized diagnostics and no infinite spinner. |
| OCR-082-023 | Resource bounds | 12 MP page raster, concurrency 1, 60-second page, 10-minute document and 20 OCR-page limits are enforced and released after completion/failure. |
| OCR-082-024 | Interruption/re-entry | Closing or reloading the tab leaves no false success; reopening the recognition workspace derives pending state and permits a clean idempotent rerun. |
| OCR-082-025 | UX truthfulness | Progress differentiates text extraction, OCR, ranking, upload and terminal failure; screen-reader status, retry, focus return and error help are usable. |
| OCR-082-026 | Static assets and licensing | Worker/WASM/language assets load from approved same-origin immutable URLs, cache safely, match pinned hashes and have license/SBOM evidence. |
| OCR-082-027 | Network/privacy sweep | Browser trace shows no OCR payload or customer document reaches a third-party domain; logs and analytics contain no extracted content. |
| OCR-082-028 | Server-cost envelope | Per PDF, normal completion uses one authorized content GET and one completion POST, persists no more than 50 selected observations and runs no server-side OCR compute. |
| OCR-082-029 | Responsive browser evidence | Desktop、tablet、mobile show no hidden blocking state, horizontal overflow, console error, unexpected 4xx/5xx or inaccessible progress/control. |
| OCR-082-030 | Regression aggregate | DEV-035 native reader, DEV-068 candidate/review/formalization and DEV-079 workspace/submit behavior pass their affected focused suites. |
| OCR-082-031 | Canonical revision alignment | SOLIDWORKS「版次」與 PDF `revision` both normalize to semantic key `revision`、category `identity_relation` and evidence-only policy before `group_key`; no new `source_revision` candidate is produced. |
| OCR-082-032 | Same-value corroboration | CAD `0.1` and PDF `0.1` for the same owner/scope render one review field with both source evidences; input、pending count and save command are not duplicated. |
| OCR-082-033 | Cross-source conflict | CAD `0.1` and PDF `0.2` render one unresolved conflict group with each value/file/location visible; no confidence/order-based silent winner and formalization remains blocked until human resolution. |
| OCR-082-034 | Normalized geometry contract | PDF.js text-layer and Tesseract fixtures both persist finite 0..1 top-left page geometry with page/rotation evidence. Consumer anchors the box to the measurable rendered PDF paper element—not an iframe/browser viewer frame containing toolbar, thumbnail sidebar or margins—and the title-block box stays inside the expected cell at all supported viewports. |
| OCR-082-035 | Evidence resolver and truthful fallback | Default focus selects locatable PDF evidence over earlier CAD property evidence; explicit CAD selection names the CAD file and no-coordinate state, while legacy/unlocatable PDF names the PDF/page and never claims `cad_property` or `not_found`. |
| OCR-082-036 | Identity-only formalization | Accepted/corrected drawing number and revision review groups are excluded as identity evidence; impact contains no revision metadata write and cannot raise `RECOGNITION_DRAWING_FIELD_INVALID`. |
| OCR-082-037 | Legacy append-only compatibility | Existing sessions containing `source_revision` and raw point/pixel geometry remain readable without row mutation; projection canonicalizes semantics and successor rerun produces new normalized geometry. |
| OCR-082-038 | A0002 single-surface workspace regression | In an isolated copy/successor of the real A0002 source set, the PDF tile reports revision found and the visible revision group is singular with CAD/PDF sources. Focusing it reuses the existing 2D preview surface to show one exact PDF.js page without a browser PDF iframe. The evidence marker is a borderless translucent yellow highlighter inside the actual page with stable normalized coordinates; a same-canvas magnifier contains non-white drawing pixels, remains inside the rendered page and does not overlap the marker at desktop/tablet/mobile. Same-page focus only adds this evidence treatment, cross-file/page focus temporarily switches that same viewer, multi-page focus navigates to the exact page, and `返回原圖面`／clear focus restores the captured preview kind/source/page. CAD source switching shows the precise nonspatial fallback without pretending the visible PDF is CAD evidence. DOM/route/network/readback assert zero new PDF tab, second viewer, attachment, revision or recognition source; console/network/unexpected-response counts remain zero. |
| OCR-082-039 | Adaptive full-field coverage | A known long material field and boundary fixtures expose the normalized evidence region、padded `targetRect`、crop rect and effective zoom. Horizontal padding is at least `max(30% region width, 0.5% page width)` per side, vertical padding at least `max(50% region height, 0.5% page height)` per side, `coverageRatio=1`, and the entire target lies inside the circular 78% safe content area after page-edge clamp. Fixed `3×` must not clip long text. |
| OCR-082-040 | Direct high-resolution PDF crop | Normal magnifier state reports `resolutionMode=pdf_high_res_crop` and reuses the currently loaded PDF page proxy; backing scale is `2.5..3`, the backing canvas is rendered directly at target resolution, and the normal path never resamples `mainPreviewCanvas`. Switching evidence after page load adds no PDF content GET, iframe, second viewer, route or derivative file. |
| OCR-082-041 | Minimal single-yellow-frame UI | The evidence marker remains a borderless translucent yellow highlighter and the magnifier has exactly one yellow outer ring. No highlighter outline、green ring、double ring、zoom control、mode control、new card、popover or extra explanatory panel is rendered; value／file／page remain available through the existing caption and accessible name. |
| OCR-082-042 | Responsive placement and long-content resilience | At `1440x900`、`1024x768` and `390x844`, lens size respects the 200／168／140 px caps, the target and lens remain inside the actual PDF paper element, the lens does not overlap the marker, and long text／page-edge／rapid focus changes produce no crop、overflow、stale image、unexpected scroll or duplicate magnifier. |
| OCR-082-043 | Bounded performance and recovery | Each backing canvas edge is `<=1024 px`, estimated RGBA memory is `<=4 MiB`, LRU size is `<=4`, stale render tasks are cancelled and unmount releases canvases. Reference-device P95 after page-ready is `<=150 ms`, cache hit is `<=16 ms`, and console/network errors remain zero. Forced high-resolution-render failure clears stale pixels, retains the marker/source caption, shows the short existing-caption recovery message and marks fallback so it cannot pass 040/044. |
| OCR-082-044 | A0002 material readability regression | In a real Chromium run against the isolated A0002 source set, focusing material evidence shows the complete text `不鏽鋼SUS304` plus visible safety margin at browser 100% without clipping to `不鏽鋼SUS…`. Screenshot/manual QC proves the glyphs are readable at normal viewing distance, while DOM/canvas evidence proves `coverageRatio=1`、`resolutionMode=pdf_high_res_crop` and backing scale `>=2.5`; desktop／laptop／mobile all pass with one yellow ring and no console/network failure. |

### 9.3 Commands and Evidence

DEV-082 使用獨立 contract／repository、runtime-generated production-safe PDF 真實 Chromium suite 與 affected parent regression；browser 實證不可由手寫 JSON、source assertion 或單一客戶檔替代：

- `npm run qc:dev-082:contract`
- `npm run qc:dev-082:repository`
- `npm run qc:dev-082:browser`
- `npm run qc:dev-082:regression`
- `npm run qc:dev-082:gate`
- `npm run qc:dev-082`
- `npm run qc:dev-035`
- 以隔離 runtime 執行文字層、中英掃描、mixed、缺漏、衝突、大頁面、21頁、損毀與加密 PDF；包含 reload/re-entry、三 viewport、console／network、API header 與 DB readback
- `npm run qc:dev-068`（以通過 preflight 的唯讀 A0005 source fixture 建立隔離副本）
- `npm run qc:dev-079:contract`、`npm run qc:dev-079:layout-browser`、`npm run qc:dev-079:recognition-layout-browser`
- `npm run typecheck:app`、affected ESLint、`npm run build:isolated` and `git diff --check`

Evidence root: `output/qa/dev-082-browser-pdf-ocr/<runId>/`. Each run manifest must record source fixture hash, policy version, PDF.js/Tesseract.js/language-data versions, browser version, viewport, selected/discarded counts by tier, OCR invocation/page counts, elapsed time, request count, console/network failures and pass/fail per `OCR-082-*` case. For `039..044`, also record normalized region、target/crop rect、coverage ratio、effective zoom、resolution mode、backing scale／canvas dimensions、render/cache elapsed time、cache size、cancel/cleanup result and screenshot path. Raw customer files, persisted bitmaps and full OCR word arrays are prohibited evidence; QA screenshots may remain only in the bounded local evidence root.

### 9.4 Exit and Stop Conditions

DEV-082 may reach local QA/QC complete only when `OCR-082-001..044` all pass, Tier 0 missing/conflict behavior is human-reviewed, privacy/network evidence proves same-origin processing, and affected DEV-035／068／079 regressions pass. Accuracy reporting must separate each Tier 0 field; one aggregate average cannot hide a failed required field. For PDF evidence, a generic property flash、non-empty low-resolution crop or fallback mode cannot substitute for complete high-resolution field evidence.

Current execution result（2026-08-21）：`OCR-082-001..044` 已由 contract、repository、runtime-generated synthetic PDF Chromium、A0002 successor recognition-layout、DEV-035／DEV-068／DEV-079 affected regression 與 completion gate 全數 PASS。082-I RD 實作已落地：`PdfPageViewport` 以同一 `PDFPageProxy` direct clipped render 取代主 preview canvas 二次放大，採 adaptive target/crop、78% safe lens、2.5..3x backing、200／168／140px lens caps、1024px canvas cap、四筆 LRU、stale/unmount cleanup、fallback 與 diagnostics；082-J contract runner 已增加 `OCR-082-039..044` 對應案例與 browser DOM/canvas 斷言。最新 gate `output/qa/dev-082-browser-pdf-ocr/gate-20260820163042-local-isolated/` 的 executable matrix 為 44/44 PASS；其引用 contract `contract-20260820162258-local-isolated/`、repository `repository-20260820162258-local-isolated/`、browser `browser-20260820162922-local-isolated/`、regression `regression-20260820161721-local-isolated/` 與 recognition layout `output/qa/dev-079-recognition-layout/20260820161949-browser/`。A0002 三 viewport 已證明完整 `不鏽鋼SUS304`、`coverageRatio=1`、`resolutionMode=pdf_high_res_crop`、backing scale `2.5`、單一黃色鏡框、螢光筆無外框、無綠框／雙環／第二 viewer／新增 content GET。canonical `revision` 已取代 fixture 舊 `source_revision`；gate 亦已分離 synthetic OCR 與 recognition-layout evidence。DEV-082 與父 DEV-068 已達 local QA/QC complete，production representative gold set、正式檔案存取、部署與 release 仍 gated。PDF 定位仍沿用既有 2D preview surface，不增加 PDF 頁籤、第二 viewer、server compute或第三方流量。

Stop and return to Dev PM if implementation requires a paid/cloud OCR service, a user installation, a maintained OCR host, a new recognition-status table, per-page server writes, persistence of raw OCR text/bitmaps, OCR for non-PDF attachments, weakening tenant/actor checks, raising the documented caps, blocking drawing submit on OCR, or production/staging access, migration, deploy or release. A future background/checkpoint architecture requires the trigger in SPEC §0.11 and a new amendment; it must not be smuggled into DEV-082.
