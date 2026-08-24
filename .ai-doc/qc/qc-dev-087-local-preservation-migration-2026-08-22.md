# DEV-087 本機 legacy preservation migration QC

Status: `PASS / Local Only / Canonical-only smoke passed / Independent QA and production release pending`

Date: 2026-08-22
Database: `data/ai-pdm.sqlite`
Provider: SQLite
Runtime: `local-dev`
Decision: Human decision `A` — 保留 legacy source，不進三工作臺、不刪除、不補假版次。

## Scope

本次只處理本機資料庫因 authority control=`legacy_only` 導致工作臺 API 503 的切換阻擋。不可唯一映射資料使用 `--retain-unmapped-legacy` 明示保留；不使用 discard flag，不建立假的 `0.1`，不將一份 mixed workspace 拆成多個 current work。

## Execution

```text
node scripts/migrate-dev-087-canonical-workbench.mjs \
  --db=data/ai-pdm.sqlite \
  --apply \
  --confirm-disposable-dev-087 \
  --retain-unmapped-legacy \
  --switch-canonical-only \
  --expected-commit=local-dev \
  --output-dir=output/qa/dev-087-local-preserve-apply
```

隔離副本先以相同參數完成 apply，再套用主本機 DB。`npm.cmd run qc:dev-087:migration` 為 24/24 PASS；最後 `npm.cmd run qc:dev-087` aggregate 為 8/8 PASS（contract 25、repository 17、commands 39、migration 24、retirement 30、browser 46、typecheck、isolated build）。最新 browser run `DEV087-2026-08-22T00-51-04-434Z` 為 46/46，temporary port 59098 已釋放；`npm.cmd run typecheck:app` PASS。

## Reconciliation

| 檢查 | 結果 |
|---|---:|
| unresolved before resolution | 56 |
| retained legacy source | 56 |
| unresolved after resolution | 0 |
| active legacy new-bundle | 55（保留） |
| cancelled legacy workspace | 3（保留） |
| canonical aggregates / states | 54 / 11 |
| open branches / claims / drawing works | 4 / 4 / 2 |
| migration quarantine total | 56 |
| foreign-key check | 0 |
| SQLite integrity check | `ok` |

Quarantine reason counts：`legacy_workspace_not_uniquely_mappable=44`、`explicit_unapproved_draft_disposal_required=9`、`legacy_cancelled_retained=3`。所有 resolution 均為 `retained_legacy_source`，並有 `resolved_at`；quarantine 不進一般 UI，也不被 canonical repository 查詢。

## Source preservation evidence

主 DB 套用前的備份：`tmp/local-dev/ai-pdm-dev087-preserve-pre-resolution.sqlite`。備份 SHA-256：`bc9edac2e67394149c70c144de48489b48e8be1fedc69132b382ba9dcd83b512`。

下列 legacy tables 套用前後 row count 與 deterministic SHA-256 完全相同：

```text
numbering_draft_workspaces     60  ffd823fea40f92f618373823016c4dfd531225ee39598b8a40e6690c0ef3a394
numbering_draft_roots           60  380a82717e57eb54c8ce389becee1723e26255a1dac212fec8b662aea0613791
numbering_draft_parts           60  2a608bdf7b183bc91e42bc7e55e42ff9d34a15f37efca9c7c779116d6ce418bf
numbering_draft_drawings        51  42cb82c08bee042150927350bb9e8686d90a2cc281efb5b5245bedd6d17ad1ac
numbering_draft_relations       51  08583721c42d43b27d44f6a0914a2621c8d513041c446223b96fa2961e74afce
drawings                        52  390043aa93df0177952853a799ec411240813620fac2a1d91987f761cca3746f
number_candidate_reservations  171  af1958092d14f42436eecf05f965cccc0802477f2550c3368f7eb97403745ba7
number_candidate_events        246  1bca6b9d658c743e3208a80a40b145d72241c3aeb0d3ffb7c653f2810876f054
```

## Runtime smoke

- `POST /api/auth/local-quick-login`（Admin）：HTTP 200。
- `GET /api/numbering/drawings/workbench?limit=20`：HTTP 200；A0002-M01 同時回傳量產版 1 與研發版 1.1。
- `GET /numbering/drawings`：HTTP 200，頁面含「圖號工作台」。
- Authority control：`canonical_only / local-dev / dev087-v1 / row_version=2`。

## Boundaries

此結果只證明本機 preservation migration 與 canonical read smoke。完整 `QA-087-001..165`、UI-only 67/67＋11/11、PostgreSQL rehearsal、retirement gate、deploy、production migration、DROP、physical GC 與 release 仍未通過；不得把本報告當成 production 授權。未來若要重新處理 retained source，必須另有明確 re-entry decision，不得猜測映射。
