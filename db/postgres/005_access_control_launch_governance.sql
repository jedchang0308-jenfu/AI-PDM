BEGIN;

ALTER TABLE user_role_assignments
  ADD COLUMN IF NOT EXISTS scope_template TEXT NOT NULL DEFAULT 'own_department',
  ADD COLUMN IF NOT EXISTS named_scope TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sponsor_user_id TEXT,
  ADD COLUMN IF NOT EXISTS starts_at TEXT,
  ADD COLUMN IF NOT EXISTS review_due_at TEXT,
  ADD COLUMN IF NOT EXISTS hard_ends_at TEXT;

ALTER TABLE user_role_assignments
  DROP CONSTRAINT IF EXISTS user_role_assignments_sponsor_user_id_fkey;

ALTER TABLE user_role_assignments
  ADD CONSTRAINT user_role_assignments_sponsor_user_id_fkey
  FOREIGN KEY (sponsor_user_id) REFERENCES users(id);

WITH launch_roles(id, role_code, title) AS (
  VALUES
    ('role-manufacturing', 'manufacturing', '製造'),
    ('role-procurement', 'procurement', '採購'),
    ('role-external-specialist', 'external_specialist', '外部專員')
)
INSERT INTO roles (id, role_code, title, system_defined, enabled, created_at, updated_at)
SELECT id, role_code, title, 1, 1, now(), now()
FROM launch_roles
ON CONFLICT (role_code) DO UPDATE SET
  title = EXCLUDED.title,
  system_defined = 1,
  enabled = 1,
  updated_at = now();

WITH launch_permissions(role_code, permission_kind, permission_code) AS (
  VALUES
    ('manufacturing', 'page', 'numbering.search'),
    ('manufacturing', 'page', 'numbering.drawings.view'),
    ('manufacturing', 'page', 'numbering.reports'),
    ('procurement', 'page', 'numbering.search'),
    ('procurement', 'page', 'numbering.drawings.view'),
    ('procurement', 'page', 'numbering.reports'),
    ('external_specialist', 'page', 'numbering.search'),
    ('external_specialist', 'page', 'numbering.drawings.view'),
    ('external_specialist', 'action', 'pdm.comment.create'),
    ('external_specialist', 'action', 'pdm.advice.create')
)
INSERT INTO role_permissions (id, role_id, permission_kind, permission_code, allowed, created_at, updated_at)
SELECT
  'default-perm-' || p.role_code || '-' || p.permission_kind || '-' || replace(replace(p.permission_code, '.', '-'), '_', '-'),
  r.id,
  p.permission_kind,
  p.permission_code,
  1,
  now(),
  now()
FROM launch_permissions p
JOIN roles r ON r.role_code = p.role_code
ON CONFLICT (role_id, permission_kind, permission_code) DO NOTHING;

COMMIT;
