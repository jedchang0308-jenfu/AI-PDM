# QA Plan — DEV-094 SQLite Migration Integrity CAPA

Status: `Executed / QA-QC PASS / 12 of 12 Closed / CAPA Effective / Production Release Gated`

Authority: `.ai-doc/specs/SPEC-PDM-SQLITE-MIGRATION-INTEGRITY-CAPA-001-root-recovery-and-runtime-isolation.md`

| Case | Independent oracle | Expected |
|---|---|---|
| QA-094-001 | 唯讀主DB inventory | roots=0、parts=0、candidate=3/3、FK=15；原始失敗證據不可改寫 |
| QA-094-002 | recovery dry-run before/after fingerprint | 無 mutation；candidate 可唯一覆蓋所有 dangling references |
| QA-094-003 | disposable apply + second run | 0→3/3、FK 15→0、staging 2→0；第二次 no-op |
| QA-094-004 | candidate missing/duplicate/hash drift/extra final row | 全部 fail closed、target fingerprint不變 |
| QA-094-005 | apply failure injection | transaction rollback，final/candidate/FK與before完全一致 |
| QA-094-006 | 2／5／11 fresh process legacy initialization | 所有process成功；final counts/IDs/hash一致、FK=0、staging=0 |
| QA-094-007 | lock owner/stale/timeout fixture | 不刪除live owner lock；dead stale lock可診斷恢復；只清理owned lock |
| QA-094-008 | isolated build main pre/post snapshot | child data/repository均在task-owned temp；主DB identity/FK不變 |
| QA-094-009 | orphan root detail API/UI | fields/files/previews可讀；stable anomaly；relation mutation/create action=0 |
| QA-094-010 | repaired A0002/A0005 + A0003/A0006 browser | 五個已知state與兩個regression皆可開；console/unexpected HTTP/visible fatal error=0 |
| QA-094-011 | DEV-087 browser pre-seed source guard negative | source損壞時runner在seed前FAIL，mutation ledger=empty |
| QA-094-012 | fresh aggregate/typecheck/build/completion audit | 全部PASS；不得引用舊14/14或seeded fixture作CAPA closure |

執行規則：RD完成後code freeze，QA以disposable DB產生首敗與PASS artifacts；QC不得修改程式或expected。主SQLite apply另依SPEC §3.1 backup＋fingerprint＋confirmation gate執行。正式PostgreSQL／deploy／release不在本計畫授權內。

## Execution Result（2026-08-24）

`QA-094-001..012`全部關閉：PASS=12、FAIL=0、Blocked=0、Not Run=0、P0/P1 open=0。主DB recovery與第二次NO_OP、failure rollback、missing candidate fail-close、2／5／11 fresh process、live/stale lock、build isolation、orphan局部降級、affected rendered UI、pre-seed source guard及fresh parent aggregate均已執行。

| Evidence | Result |
|---|---:|
| `output/qa/dev-094/DEV094-2026-08-24T05-53-07-356Z/manifest.json` | focused CAPA PASS |
| `output/qa/dev-094-browser/DEV094-browser-2026-08-24T05-53-25-049Z/manifest.json` | rendered browser 31/31 PASS；runtime dist removed |
| `output/qa/dev-087/DEV087-2026-08-24T05-55-12-088Z/manifest.json` | affected browser 91/91 PASS；source guard before mutation；runtime dist removed |
| `output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-24T05-53-07-065Z/manifest.json` | fresh aggregate 16/16 PASS |
| `output/qa/dev-094-main-recovery/apply/manifest.json` | roots/parts 0→3、FK 15→0、staging 2→0 |
| `output/qa/dev-094-main-recovery/post-apply-noop/manifest.json` | NO_OP；healthy fingerprint stable |

獨立QC結論與SHA-256見`.ai-doc/qc/qc-dev-094-sqlite-migration-integrity-capa-2026-08-24.md`。production未連線、未遷移、未部署、未release。
