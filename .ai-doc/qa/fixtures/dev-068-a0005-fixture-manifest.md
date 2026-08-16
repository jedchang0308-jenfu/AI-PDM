# DEV-068 A0005 Isolated Fixture Manifest

Status: Fixture Contract Ready / Source Hash Verified / Execution Not Started
Date: 2026-08-12
Related DEV: `DEV-068`
Authority: `.ai-doc/specs/SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md`

## 1. Purpose And Boundary

This manifest turns the user's selected A0005 3D＋2D example into a deterministic local QA fixture for recognition workflow, baseline/variant review and atomic formalization.

- Source CAD files remain in the existing local canonical repository and are read-only.
- QA copies verified bytes into a disposable temporary repository; it never modifies or overwrites the originals.
- Existing local PDM rows provide the expected identity/relation and attribute snapshot. They are evidence for the fixture, not permission to mutate the working database.
- No external OCR/CAD provider result is represented as verified. Provider accuracy remains a separate release gate.

## 2. Canonical Source Inventory

| Role | Local source | Source asset / candidate file | Bytes | SHA-256 |
|---|---|---|---:|---|
| `cad_3d` | `data/repository/candidate-revisions/company-jenfu/NCR-bc054ee8-88a2-4a04-96ef-e0ef0a007426/NCRF-5321ca6e-3084-4738-95d1-20776a45962a-A0005.SLDPRT` | `FA-9e293a17-6e2a-474e-a91b-b6cad2c7c793` / `NCRF-5321ca6e-3084-4738-95d1-20776a45962a` | 67,405 | `e2060691a2e02c285d04c56d1d17da3ef40c9ae17fd2ee11d2ccf96e5f4328f2` |
| `drawing_2d` | `data/repository/candidate-revisions/company-jenfu/NCR-bc054ee8-88a2-4a04-96ef-e0ef0a007426/NCRF-2463a3af-6c59-4ee5-acd4-d26c2381d8f7-A0005-M01.SLDDRW` | `FA-feda9679-3b03-418a-92b9-0431ee2761a4` / `NCRF-2463a3af-6c59-4ee5-acd4-d26c2381d8f7` | 131,931 | `0dc8d2b64736c67c035237d9dccf515a65c90a58c089029f801390ec7462337e` |

Source lineage key: `NCR-bc054ee8-88a2-4a04-96ef-e0ef0a007426`.

If either file is absent or its hash differs, `qc:dev-068:a0005` must stop with `FIXTURE_SOURCE_MISMATCH`; it must not silently accept a replacement with the same filename.

## 3. Identity And Relation Ground Truth

Repository snapshot verified on 2026-08-12:

- company: `company-jenfu`
- part root: `A0005`
- drawing: `A0005-M01`
- canonical drawing ID: `drawing-draft-drawing-2219671e-8325-49c5-b409-dd793cb2d6f5`
- candidate revision: `NCR-bc054ee8-88a2-4a04-96ef-e0ef0a007426`
- canonical revision used by the fixture: `0.1` / `drawing-revision-NCR-bc054ee8-88a2-4a04-96ef-e0ef0a007426`
- linked part numbers: `A0005-P01`, `A0005-P02`, `A0005-P03`
- common part name: `馬達_JF_2HP_B`
- every part is already linked to `A0005-M01` with `primary_manufacturing`.

The isolated database may use deterministic QA IDs instead of the working-database IDs, but the codes, link cardinality and source hashes must remain identical.

## 4. Formal Attribute Ground Truth

| Part number | Material | Color | Surface treatment | Variant note |
|---|---|---|---|---|
| `A0005-P01` | `SUS304` | `無` | `無` | `無` |
| `A0005-P02` | `SUS301` | `無` | `無` | `無` |
| `A0005-P03` | `SUS304` | `黑` | `無` | `無` |

Expected deterministic review projection:

- material baseline proposal: `SUS304`; `A0005-P02` is `changed -> SUS301`.
- color baseline proposal: explicit `無`; `A0005-P03` is `changed -> 黑`.
- surface-treatment baseline: explicit `無`; no per-part difference.
- variant-note baseline: explicit `無`; no per-part difference.
- the visible value `無` is direct not-applicable evidence in this fixture. A missing observation is still `unrecognized` and must never be converted to `無` or a clear operation.

Baseline selection for this fixture uses the contract algorithm: all-equal wins; otherwise a unique normalized value present in more than half of linked parts may be proposed as the baseline. A tie or no strict majority has no automatic baseline proposal.

## 5. Deterministic Adapter Expectations

`filename.v1` must emit traceable observations for the file stem and role without claiming OCR. `fixture-marker.v1` or `scripts/mock-drawing-recognition-extractor.mjs` may use the verified content hashes to emit the following isolated observations:

- drawing/root/part identity candidates for `A0005-M01`, `A0005`, `P01`, `P02`, `P03`;
- common part name `馬達_JF_2HP_B`;
- the four attribute columns and per-part values in section 4;
- at least one `controlled_note`, one `engineering_evidence` and one `unclassified` observation so all six review sections are exercised;
- one controlled CAD/OCR conflict and one low-confidence item for conflict/evidence UI validation.

These deterministic outputs validate the product workflow, not OCR accuracy. The mock must identify itself as `fixture-marker.v1`, be disabled outside isolated test mode and never be included in a production health claim.

When a real OCR command is evaluated later, raw line breaks, punctuation and confidence may vary. Release acceptance must define a separate reviewed gold set and measure normalized field/owner correctness; this manifest does not allow a real provider to pass solely because it produced some text.

## 6. Isolation And Cleanup

1. Verify both hashes before opening the disposable database.
2. Copy source bytes to an OS temporary directory created for the test run.
3. Seed one disposable company, authorized/unauthorized actors, one drawing/revision, three parts and three relations.
4. Seed the formal values in section 4, then run candidate extraction/review against a separate proposed-value set so conflict and no-op behavior are observable.
5. Record pre/post formal-table counts and row hashes.
6. Remove the disposable database and temporary copied files at test completion; preserve only redacted reports/screenshots under `output/qa/dev-068-drawing-recognition/`.
7. Never delete or modify the two source paths in section 2.

## 7. Approval Result

The fixture is ready for local implementation and QA because source bytes, source lineage, canonical relations and expected formal values are all fixed and independently queryable. It does not authorize production/staging access, source-file mutation, provider purchase, license activation or a claim that real OCR quality has passed.
