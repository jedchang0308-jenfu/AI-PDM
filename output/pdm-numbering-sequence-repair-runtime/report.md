# PDM Numbering Sequence Runtime Repair Report

- Checked at: 2026-07-07T08:03:32.948Z
- Mode: apply
- DB path: C:\VIBE CODING\AI_PDM\data\ai-pdm.sqlite
- Backup path: C:\VIBE CODING\AI_PDM\data\backups\pdm-numbering-sequence-repair-20260707-160332\ai-pdm.sqlite
- Formal kept roots: 00007, 00014, 00056, 00057, 00058
- Purged test roots: 53
- Deleted numbering.create audit rows: 53
- Deleted sequence keys: 125
- Root sequence next value: 59

## Counts Before

```json
{
  "numbering_sequences": 136,
  "part_roots": 5,
  "part_numbers": 5,
  "drawing_numbers": 5,
  "drawing_part_links": 5,
  "audit_logs": 709,
  "duplicate_check_events": 16,
  "warning_events": 1,
  "numbering_task_items": 1,
  "numbering_notifications": 1,
  "approval_requests": 1,
  "approval_decisions": 1,
  "approval_batches": 1,
  "approval_batch_items": 1,
  "import_batches": 0,
  "import_staging_rows": 0,
  "numbering_export_jobs": 2,
  "monthly_audit_reports": 2
}
```

## Counts After

```json
{
  "numbering_sequences": 11,
  "part_roots": 5,
  "part_numbers": 5,
  "drawing_numbers": 5,
  "drawing_part_links": 5,
  "audit_logs": 657,
  "duplicate_check_events": 0,
  "warning_events": 0,
  "numbering_task_items": 0,
  "numbering_notifications": 0,
  "approval_requests": 0,
  "approval_decisions": 0,
  "approval_batches": 0,
  "approval_batch_items": 0,
  "import_batches": 0,
  "import_staging_rows": 0,
  "numbering_export_jobs": 0,
  "monthly_audit_reports": 0
}
```
