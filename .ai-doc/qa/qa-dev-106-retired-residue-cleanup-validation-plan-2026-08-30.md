# DEV-106 Retired Residue Cleanup Validation Plan

Authority：`SPEC-PDM-RETIREMENT-RESIDUE-CLEANUP-001`

Risk：High / production schema and bounded JSON cleanup

Fixed denominator：`QA-106-001..016`

| ID | 驗證項目 | PASS 條件 |
|---|---|---|
| QA-106-001 | Source boundary | release branch從現行production SHA建立且worktree clean |
| QA-106-002 | PostgreSQL fail closed | Relation work/state/aggregate/review/quarantine任一非0時052 rollback |
| QA-106-003 | Relation schema cleanup | 052後 `relation_change_works` 不存在 |
| QA-106-004 | Guard cleanup | `dev087_guard_company_reference` 不引用 Relation work table |
| QA-106-005 | BOM JSON cleanup | 所有 Part work payload無 `bomUsagePolicy` |
| QA-106-006 | Future-write guard | PostgreSQL/SQLite再次寫入該key均拒絕 |
| QA-106-007 | Formal relation preservation | `drawing_part_links` count/fingerprint前後相同 |
| QA-106-008 | Identity/data preservation | root/part/drawing、work identities與非退役payload前後相同 |
| QA-106-009 | FK integrity | PostgreSQL所有FK validated且無orphan；SQLite foreign_key_check=0 |
| QA-106-010 | Idempotence | 同一exact migration runner第二次無新migration／資料差異 |
| QA-106-011 | Recovery mapper | 不重播042，未套用052或stale mapping時fail closed |
| QA-106-012 | Validation retirement | current mapper/QC不再產生或期待退役欄位/table |
| QA-106-013 | Package identity | 50筆ordered migration，last=052，遠端migration digest可驗證 |
| QA-106-014 | Restore rehearsal | production backup的獨立restore target完成兩次migration與reconciliation |
| QA-106-015 | Candidate | exact app artifact以0% revision通過basic/authenticated read smoke |
| QA-106-016 | Production effectiveness | 正式migration、唯讀reconciliation與切換後canonical smoke均PASS；失敗則依pinned prior revision/backup處理 |

本計畫不包含已退役 Relation工作臺 positive flow、BOM欄位/route/schema positive flow、具名Wave 0或固定觀察期。歷史證據只供追溯，不得補入current denominator。
