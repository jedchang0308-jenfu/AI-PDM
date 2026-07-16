# QA Plan - PDM Research / Technical Transfer Submission Gate

Spec: `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
DEV: `DEV-PDM-SUBMISSION-GATE-001`
Status: Phase 1 Local QC Passed; Phase 2 and Parent Phase 4 QA Contract Ready / Not Requested This Turn; Technical Transfer Phase 3 delegated to DEV-041 child QA plan
Created: 2026-07-07
Phase 1 evidence: `.ai-doc/qc/qc-pdm-submission-gate-phase1-report-2026-07-10.md`

## 1. Objective

Validate that PDM separates research submission from technical-transfer submission and prevents false transfer readiness from a single drawing or single part.

## 2. Primary Risks

| Risk | Failure mode | Required QA response |
|---|---|---|
| False readiness | one part passes but package is not manufacturable | single-item technical transfer must be blocked |
| Overblocking research | early RD cannot review concept due to missing transfer-only data | research warnings/exceptions must work where allowed |
| Rule drift | required fields change without audit | rule set version must be captured |
| Owner confusion | user sees missing data but not where to fix it | blocker must include owner role and remediation route |
| Integration blind spot | BOM, drawing, cost or QA/QC data missing from transfer review | package readiness must aggregate all affected items |
| Scope ambiguity | one real affected item is confused with direct single-item transfer | one-item transfer package must require case reason, no-other-items declaration and reviewer scope confirmation |
| Exception misuse | missing required transfer data is bypassed by an exception | technical transfer missing-required exception must be denied |
| Lifecycle confusion | transfer approval is treated as formal release | `ApprovedForTransfer` must not mutate master records to `Released / Release` |
| Stale approval reuse | package content changes after readiness/sign-off | stale readiness and affected sign-offs must block approval until re-resolved |
| Accidental Draft creation | opening/refreshing create page writes empty package | GET/open must be read-only; explicit create is required |
| Revision synchronization | package integer baseline promotes all child revisions | baseline stores exact independent item revisions/hashes and mutates no master revision |
| Role mismatch | implementation invents `QC` role while system uses `QA/QC` | data/API checks must use existing `QA/QC` role code |

## 3. Acceptance Matrix

| Scenario | Expected result |
|---|---|
| User starts from drawing and chooses `研發送審` | item-centric research flow may continue if minimum review evidence is present |
| User starts from drawing and chooses `技術移轉送審` | system opens or creates a transfer package and pre-adds the drawing |
| User starts from part and chooses `技術移轉送審` | system blocks direct single-part transfer and routes to transfer package |
| User opens/refreshes transfer-package create page | no persistent Draft exists until explicit `建立技轉包` |
| User explicitly creates package with required header | one idempotent persistent Draft and stable package ID are returned |
| One-item transfer package lacks `無其他受影響項` declaration | package cannot submit |
| One-item transfer package has declaration but no reviewer scope confirmation | package cannot be approved for transfer |
| Research item lacks standard cost | warning or exception request path if rule allows |
| Research exception reason is provided by submitter | submission may enter review, but exception remains pending until reviewer/supervisor decision |
| Technical-transfer package has part lacking standard cost | hard blocker with `補標準成本` remediation route |
| Technical-transfer package lacks manufacturing drawing attachment | hard blocker with drawing attachment remediation route |
| Technical-transfer package lacks material/surface for manufactured part | hard blocker with part master data remediation route |
| User attempts transfer exception for missing required field | denied and audited as blocker override attempt |
| Package item set changes after readiness | readiness snapshot becomes stale; submit requires re-resolution |
| Readiness-driving field changes after sign-off | affected role sign-offs are invalidated and must be re-signed |
| Package reaches `ApprovedForTransfer` | drawing, part and root master records remain at their existing lifecycle until formal release workflow runs |
| Package baseline is confirmed | baseline gets next package integer; all controlled item revisions/statuses remain unchanged |
| RD Manager/Admin creates release work from approved transfer package | release work items route to existing release workflow; package approval does not bypass release transaction |
| Rule matrix marks Procurement not applicable | Procurement sign-off is not required only when rule source or RD Manager/Admin reason/audit exists |
| Rule set changes after package was submitted | historical package keeps captured rule-set version |

## 4. Test Data Requirements

Minimum local fixture set:

- one root with one manufacturing drawing and one part
- one root with multiple drawings and multiple parts
- one part with missing material/surface
- one part with missing standard cost
- one drawing with missing reviewable attachment
- one package with complete data
- one package with blocker data
- one approved transfer package fixture whose linked master records are not yet formally released
- one package with a stale readiness snapshot after item or field change
- one package where Procurement or QA/QC is not applicable by rule / approved reason

## 5. QA Gates By Phase

### Phase 1 - Rule Resolver And Mode Entry

Required checks:

- mode selector renders `研發送審` and `技術移轉送審`
- resolver returns `required`, `warning`, `optional`, `not_applicable`
- technical transfer from item source redirects to package context
- no single-item technical-transfer formal submission can be created
- blocker payload includes field, owner role, blocker code and remediation route

Evidence:

- static QC for resolver rule coverage
- API smoke for resolver sample payloads
- browser smoke for item-origin technical-transfer redirect

### Phase 2 - Research Submission Redesign

Required checks:

- research submission can continue with allowed warning exception
- exception reason is required where exception is used
- reviewer can see exception reason and approve/reject the exception
- final approval is blocked while exception decision is pending
- hard identity/evidence blockers still block research submission

Evidence:

- browser screenshot for warning exception
- API evidence for exception request and reviewer/supervisor decision audit

### Phase 3 - Technical Transfer Package Builder

Detailed Phase 3A-0/3A-1/3A-2/3B/3C fixtures, archive security, baseline version, RLS/grants, concurrency, browser and evidence gates are authoritative in `.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`. This parent section preserves end-to-end submission/sign-off/release acceptance and must not be used to bypass a child phase entry gate.

Required checks:

- package can contain roots, drawings, parts and BOM context
- opening the create route creates no record; explicit create returns one stable idempotent Draft
- package must capture case/change reason
- package with only one affected item must require `無其他受影響項` declaration
- one-item package must require reviewer scope confirmation before transfer approval
- missing drawing attachment blocks transfer submit
- missing part master data blocks transfer submit
- missing standard cost blocks transfer submit
- missing required blockers cannot be bypassed by transfer exception
- package with all required items can submit
- submit references an immutable current integer package baseline; item revisions are not synchronized or mutated
- adding/removing item after readiness invalidates prior readiness
- applicable Manufacturing/Procurement/QA/QC sign-offs are captured before `ApprovedForTransfer`
- not-applicable sign-off has rule source or RD Manager/Admin reason/audit
- `ApprovedForTransfer` does not set drawing/part/root records to `Released / Release`
- formal release work item creation is available only after `ApprovedForTransfer` and routes to existing release workflow
- readiness-driving field edits invalidate affected sign-offs and approval state

Evidence:

- browser screenshot for package readiness dashboard
- API smoke for blocker and pass cases
- DB/API check that master lifecycle is unchanged after `ApprovedForTransfer`
- API/DB check that release work items are created without direct master lifecycle mutation
- stale snapshot/sign-off invalidation evidence
- visible-error sweep: no raw API errors or undefined status text
- child phase evidence required by the DEV-041 QA plan

### Phase 4 - Rule Matrix Admin Governance

Required checks:

- PDM Admin can create draft rule set
- preview shows effective field states for sample cases
- activation requires reason and audit
- retired rule set no longer applies to new packages
- historical packages keep captured rule set version

Evidence:

- admin UI browser smoke
- audit row checks
- rule version regression QC

## 6. Negative Tests

- open/refresh `/transfer-packages/new` and verify no Draft write
- replay explicit package create and verify one stable package ID
- attempt direct technical-transfer submit from a single part
- attempt one-item transfer package submit without `無其他受影響項`
- attempt one-item transfer package approval without reviewer scope confirmation
- attempt technical-transfer submit with missing standard cost
- attempt technical-transfer missing-required exception
- attempt technical-transfer submit with missing manufacturing drawing
- attempt baseline with incomplete manual/file-composition BOM or unmapped formal assembly
- confirm baseline and verify no controlled item revision/status changes
- attempt technical-transfer submit after package item changed but readiness not refreshed
- attempt transfer approval after stale readiness snapshot
- attempt transfer approval with stale affected sign-off
- attempt transfer approval with role `QC` instead of existing `QA/QC`
- attempt automatic master release as part of `ApprovedForTransfer`
- attempt final research approval while exception decision is still pending
- attempt unauthorized rule activation
- attempt to mutate active rule set without new version

## 7. Stop Conditions

- implementation requires production deploy, live schema migration or direct DB mutation without explicit authorization
- technical-transfer workflow cannot prevent single-item submit
- technical-transfer workflow cannot distinguish direct single-item transfer from a one-item package with declared/confirmed scope
- implementation needs missing-required transfer exception
- research exception can pass final approval without reviewer/supervisor decision
- blocker cannot route user to a concrete remediation page
- rule-set version cannot be captured in readiness snapshot
- transfer package state cannot invalidate readiness after item changes
- `ApprovedForTransfer` mutates drawing/part/root master lifecycle directly
- implementation cannot create release work items through existing release workflow
- implementation cannot distinguish `QA/QC` role from display label `品保`
- visible UI shows raw API error, raw enum, undefined status or unexpected alert in normal submission/transfer flows
