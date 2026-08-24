# ADR-PDM-PART-ATTACHMENT-REUSE-002：以獨立 file_asset 快照沿用替代料號附件

Status: Accepted / Implemented Locally / Focused QA-QC PASS / Production Release Gated
Date: 2026-08-22
DEV: `DEV-088`
SPEC: `.ai-doc/specs/SPEC-PDM-PART-ATTACHMENT-REUSE-002-replacement-selection-snapshot.md`

## Context

核心需求只有建立替代料號時讓使用者快速選擇大多仍適用的來源附件。歷史 DEV-084 將此需求擴成五表附件平台、權限改寫、全生命週期版本／還原與整料號 lease，工程與遷移風險遠高於當期價值。DEV-087 已確認 Part 附件維持現行獨立即時 authority。

現行 `file_assets` 的 bytes 已由 storage adapter 以 SHA-256 重用；row 本身包含 owner與metadata。因此可以為target建立新row、共享immutable storage pointer，同時保有新舊owner獨立soft-delete與metadata snapshot，不需要先重建整個附件平台。

## Decision

- target draft建立自己的`file_assets` row；inherited row copy來源 storage pointer與metadata，不搬source owner、不複製bytes。
- 使用兩張小型稽核表記錄一次性snapshot與target/source origins；不建立content/binding/version/lease五表。
- source token在commit時重算，stale則整個draft＋snapshot transaction rollback。
- new upload先存object，再與draft／target rows同一DB transaction建立；transaction失敗時不留下可見row，physical orphan GC延後。
- replacement release只做target row draft→formal owner promotion，不重讀source。
- 維持現行permission與Part attachment lifecycle；本DEV不提供metadata版本、replace/delete/restore重寫或whole-part lock。

## Alternatives

- 完整複製bytes：拒絕，浪費空間且與現行storage hash reuse相衝。
- 搬移來源owner：拒絕，破壞舊料號。
- 動態繼承：拒絕，來源日後操作會靜默改變target。
- DEV-084五表＋lease：延後；只有日後出現跨owner附件版本／還原的實際需求再重開。
- 只存selected source IDs、release時再複製：拒絕，無法形成建立當下的獨立snapshot，來源變更會污染結果。

## Consequences

優點是 schema與query很小、沿用physical bytes成本接近零、與現行route/permission相容、rollback容易。限制是target仍使用現行`file_assets` row lifecycle，沒有獨立metadata版本中心；這是本期刻意縮編，不是漏做。
