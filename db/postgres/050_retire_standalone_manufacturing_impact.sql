-- Retire the standalone manufacturing-impact workbench permissions.
-- Formal obsolete dependency snapshots and drawing-revision F/F/F impact remain authoritative.

DELETE FROM public.role_permissions
WHERE permission_code IN (
  'numbering.impact',
  'numbering.impact.analyze',
  'numbering.impact.apply'
);
