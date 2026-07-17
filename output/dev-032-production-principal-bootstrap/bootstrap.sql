-- DEV-032 production initial principal bootstrap
-- Status: proposal_only_not_approved_for_live_apply
-- Canonical role/permission source: db/schema.sql
-- Canonical source SHA-256: 499c33e5f10272fad8c8c352cf5fa2edfaceddc9a3e424576cd5dd70c685cea0
-- This package never stores a password, MFA secret, recovery code or Google credential.

BEGIN;
SET LOCAL search_path = public;
SELECT pg_advisory_xact_lock(7104604602);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM companies
    WHERE (id = 'company-jenfu' OR company_code = 'JENFU')
      AND (id IS DISTINCT FROM 'company-jenfu' OR company_code IS DISTINCT FROM 'JENFU')
  ) THEN RAISE EXCEPTION 'DEV046_COMPANY_IDENTITY_COLLISION'; END IF;

  IF EXISTS (
    SELECT 1 FROM users
    WHERE (id = 'prod-pdm-admin-001' OR lower(email) = 'jedchang0308@jenfu.com.tw')
      AND (id IS DISTINCT FROM 'prod-pdm-admin-001' OR lower(email) IS DISTINCT FROM 'jedchang0308@jenfu.com.tw')
  ) THEN RAISE EXCEPTION 'DEV046_USER_IDENTITY_COLLISION'; END IF;

  IF EXISTS (
    SELECT 1 FROM platform_principal_mappings
    WHERE (platform_principal_id = 'iam:principal:prod-pdm-admin-001'
        OR pdm_user_id = 'prod-pdm-admin-001'
        OR (mapping_source = 'shared_iam' AND external_subject = 'U57t2eIOzLdhAmNDUbFyOz3fdMm2'))
      AND (platform_principal_id, pdm_user_id, mapping_source, external_subject)
        IS DISTINCT FROM ('iam:principal:prod-pdm-admin-001', 'prod-pdm-admin-001', 'shared_iam', 'U57t2eIOzLdhAmNDUbFyOz3fdMm2')
  ) THEN RAISE EXCEPTION 'DEV046_PRINCIPAL_MAPPING_COLLISION'; END IF;

  IF EXISTS (
    SELECT 1 FROM auth_identities
    WHERE (id = 'auth-google-prod-pdm-admin-001'
        OR (provider = 'google_oauth' AND provider_subject = 'U57t2eIOzLdhAmNDUbFyOz3fdMm2')
        OR (user_id = 'prod-pdm-admin-001' AND provider = 'google_oauth'))
      AND (id, user_id, provider, provider_subject)
        IS DISTINCT FROM ('auth-google-prod-pdm-admin-001', 'prod-pdm-admin-001', 'google_oauth', 'U57t2eIOzLdhAmNDUbFyOz3fdMm2')
  ) THEN RAISE EXCEPTION 'DEV046_AUTH_IDENTITY_COLLISION'; END IF;

  IF EXISTS (
    SELECT 1 FROM platform_organization_mappings
    WHERE (platform_organization_id = 'iam:organization:jenfu'
        OR pdm_company_id = 'company-jenfu'
        OR (mapping_source = 'shared_core' AND external_organization_key = 'jenfu'))
      AND (platform_organization_id, pdm_company_id, mapping_source, external_organization_key)
        IS DISTINCT FROM ('iam:organization:jenfu', 'company-jenfu', 'shared_core', 'jenfu')
  ) THEN RAISE EXCEPTION 'DEV046_ORGANIZATION_MAPPING_COLLISION'; END IF;

  IF EXISTS (
    SELECT 1
    FROM roles r
    JOIN (VALUES
    ('role-rd', 'rd', 'RD', 1),
    ('role-rd-manager', 'rd_manager', 'RD 主管', 1),
    ('role-pdm-admin', 'pdm_admin', 'PDM 管理員', 1),
    ('role-document-admin', 'document_admin', '文件管理員', 1),
    ('role-qa', 'qa', 'QA / 品保', 1),
    ('role-manufacturing', 'manufacturing', '製造', 1),
    ('role-procurement', 'procurement', '採購', 1),
    ('role-external-specialist', 'external_specialist', '外部專員', 1),
    ('role-system-admin', 'system_admin', '系統管理員', 1)
    ) AS expected(id, role_code, title, system_defined)
      ON r.id = expected.id OR r.role_code = expected.role_code
    WHERE r.id IS DISTINCT FROM expected.id OR r.role_code IS DISTINCT FROM expected.role_code
  ) THEN RAISE EXCEPTION 'DEV046_CANONICAL_ROLE_COLLISION'; END IF;
END
$$;

INSERT INTO companies (id, company_code, display_name, created_at, updated_at)
VALUES ('company-jenfu', 'JENFU', '鉦富', now(), now())
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  updated_at = now();

WITH canonical_roles(id, role_code, title, system_defined) AS (
  VALUES
    ('role-rd', 'rd', 'RD', 1),
    ('role-rd-manager', 'rd_manager', 'RD 主管', 1),
    ('role-pdm-admin', 'pdm_admin', 'PDM 管理員', 1),
    ('role-document-admin', 'document_admin', '文件管理員', 1),
    ('role-qa', 'qa', 'QA / 品保', 1),
    ('role-manufacturing', 'manufacturing', '製造', 1),
    ('role-procurement', 'procurement', '採購', 1),
    ('role-external-specialist', 'external_specialist', '外部專員', 1),
    ('role-system-admin', 'system_admin', '系統管理員', 1)
)
INSERT INTO roles (id, role_code, title, system_defined, enabled, created_at, updated_at)
SELECT id, role_code, title, system_defined, 1, now(), now()
FROM canonical_roles
ON CONFLICT (role_code) DO UPDATE SET
  title = EXCLUDED.title,
  system_defined = 1,
  enabled = 1,
  updated_at = now();

WITH canonical_permissions(id, role_code, permission_kind, permission_code, allowed) AS (
  VALUES
    ('default-perm-system_admin-page-numbering-request', 'system_admin', 'page', 'numbering.request', 1),
    ('default-perm-system_admin-page-numbering-search', 'system_admin', 'page', 'numbering.search', 1),
    ('default-perm-system_admin-page-numbering-drawings-view', 'system_admin', 'page', 'numbering.drawings.view', 1),
    ('default-perm-system_admin-page-numbering-dvt', 'system_admin', 'page', 'numbering.dvt', 1),
    ('default-perm-system_admin-page-numbering-approvals', 'system_admin', 'page', 'numbering.approvals', 1),
    ('default-perm-system_admin-page-numbering-impact', 'system_admin', 'page', 'numbering.impact', 1),
    ('default-perm-system_admin-page-numbering-tasks', 'system_admin', 'page', 'numbering.tasks', 1),
    ('default-perm-system_admin-page-numbering-imports', 'system_admin', 'page', 'numbering.imports', 1),
    ('default-perm-system_admin-page-numbering-reports', 'system_admin', 'page', 'numbering.reports', 1),
    ('default-perm-system_admin-page-settings-admin-matrix', 'system_admin', 'page', 'settings.admin_matrix', 1),
    ('default-perm-system_admin-action-numbering-create', 'system_admin', 'action', 'numbering.create', 1),
    ('default-perm-system_admin-action-numbering-duplicate-check', 'system_admin', 'action', 'numbering.duplicate_check', 1),
    ('default-perm-system_admin-action-numbering-link-variant', 'system_admin', 'action', 'numbering.link_variant', 1),
    ('default-perm-system_admin-action-numbering-dvt-submit', 'system_admin', 'action', 'numbering.dvt.submit', 1),
    ('default-perm-system_admin-action-numbering-approval-request', 'system_admin', 'action', 'numbering.approval.request', 1),
    ('default-perm-system_admin-action-numbering-approval-batch-create', 'system_admin', 'action', 'numbering.approval.batch.create', 1),
    ('default-perm-system_admin-action-numbering-approval-batch-decide', 'system_admin', 'action', 'numbering.approval.batch.decide', 1),
    ('default-perm-system_admin-action-numbering-approval-batch-resubmit', 'system_admin', 'action', 'numbering.approval.batch.resubmit', 1),
    ('default-perm-system_admin-action-numbering-impact-analyze', 'system_admin', 'action', 'numbering.impact.analyze', 1),
    ('default-perm-system_admin-action-numbering-impact-apply', 'system_admin', 'action', 'numbering.impact.apply', 1),
    ('default-perm-system_admin-action-numbering-import-stage', 'system_admin', 'action', 'numbering.import.stage', 1),
    ('default-perm-system_admin-action-numbering-import-confirm', 'system_admin', 'action', 'numbering.import.confirm', 1),
    ('default-perm-system_admin-action-numbering-export-create', 'system_admin', 'action', 'numbering.export.create', 1),
    ('default-perm-system_admin-action-numbering-audit-report-generate', 'system_admin', 'action', 'numbering.audit_report.generate', 1),
    ('default-perm-system_admin-action-numbering-task-update', 'system_admin', 'action', 'numbering.task.update', 1),
    ('default-perm-system_admin-action-numbering-notification-update', 'system_admin', 'action', 'numbering.notification.update', 1),
    ('default-perm-system_admin-action-numbering-attachments-manage', 'system_admin', 'action', 'numbering.attachments.manage', 1),
    ('default-perm-system_admin-action-settings-admin-matrix', 'system_admin', 'action', 'settings.admin_matrix', 1),
    ('default-perm-system_admin-action-numbering-draft-update', 'system_admin', 'action', 'numbering.draft.update', 1),
    ('default-perm-system_admin-action-numbering-draft-obsolete', 'system_admin', 'action', 'numbering.draft.obsolete', 1),
    ('default-perm-system_admin-action-numbering-draft-admin-confirm', 'system_admin', 'action', 'numbering.draft.admin_confirm', 1),
    ('default-perm-system_admin-action-update-name', 'system_admin', 'action', 'update_name', 1),
    ('default-perm-system_admin-action-update-spec', 'system_admin', 'action', 'update_spec', 1),
    ('default-perm-system_admin-action-obsolete-part-number', 'system_admin', 'action', 'obsolete_part_number', 1),
    ('default-perm-system_admin-action-obsolete-ma-drawing', 'system_admin', 'action', 'obsolete_ma_drawing', 1),
    ('default-perm-system_admin-action-obsolete-part-root', 'system_admin', 'action', 'obsolete_part_root', 1),
    ('default-perm-system_admin-action-merge-part-number', 'system_admin', 'action', 'merge_part_number', 1),
    ('default-perm-system_admin-action-dvt-missing-ma-override', 'system_admin', 'action', 'dvt_missing_ma_override', 1),
    ('default-perm-system_admin-action-dvt-promotion', 'system_admin', 'action', 'dvt_promotion', 1),
    ('default-perm-system_admin-action-release-missing-ma-confirm', 'system_admin', 'action', 'release_missing_ma_confirm', 1),
    ('default-perm-system_admin-action-release', 'system_admin', 'action', 'release', 1),
    ('default-perm-system_admin-action-pdm-shared-model-release', 'system_admin', 'action', 'pdm.shared_model.release', 1),
    ('default-perm-system_admin-action-pdm-drawing-package-model-exception-confirm', 'system_admin', 'action', 'pdm.drawing_package.model_exception.confirm', 1),
    ('default-perm-system_admin-action-pdm-manufacturing-baseline-release', 'system_admin', 'action', 'pdm.manufacturing_baseline.release', 1),
    ('default-perm-system_admin-action-post-release-change', 'system_admin', 'action', 'post_release_change', 1),
    ('default-perm-system_admin-action-same-drawing-variant-after-release', 'system_admin', 'action', 'same_drawing_variant_after_release', 1),
    ('default-perm-system_admin-action-main-drawing-restore', 'system_admin', 'action', 'main_drawing_restore', 1),
    ('default-perm-pdm_admin-page-numbering-request', 'pdm_admin', 'page', 'numbering.request', 1),
    ('default-perm-pdm_admin-page-numbering-search', 'pdm_admin', 'page', 'numbering.search', 1),
    ('default-perm-pdm_admin-page-numbering-drawings-view', 'pdm_admin', 'page', 'numbering.drawings.view', 1),
    ('default-perm-pdm_admin-page-numbering-dvt', 'pdm_admin', 'page', 'numbering.dvt', 1),
    ('default-perm-pdm_admin-page-numbering-approvals', 'pdm_admin', 'page', 'numbering.approvals', 1),
    ('default-perm-pdm_admin-page-numbering-impact', 'pdm_admin', 'page', 'numbering.impact', 1),
    ('default-perm-pdm_admin-page-numbering-tasks', 'pdm_admin', 'page', 'numbering.tasks', 1),
    ('default-perm-pdm_admin-page-numbering-imports', 'pdm_admin', 'page', 'numbering.imports', 1),
    ('default-perm-pdm_admin-page-numbering-reports', 'pdm_admin', 'page', 'numbering.reports', 1),
    ('default-perm-pdm_admin-page-settings-admin-matrix', 'pdm_admin', 'page', 'settings.admin_matrix', 1),
    ('default-perm-pdm_admin-action-numbering-create', 'pdm_admin', 'action', 'numbering.create', 1),
    ('default-perm-pdm_admin-action-numbering-duplicate-check', 'pdm_admin', 'action', 'numbering.duplicate_check', 1),
    ('default-perm-pdm_admin-action-numbering-link-variant', 'pdm_admin', 'action', 'numbering.link_variant', 1),
    ('default-perm-pdm_admin-action-numbering-dvt-submit', 'pdm_admin', 'action', 'numbering.dvt.submit', 1),
    ('default-perm-pdm_admin-action-numbering-approval-request', 'pdm_admin', 'action', 'numbering.approval.request', 1),
    ('default-perm-pdm_admin-action-numbering-approval-batch-create', 'pdm_admin', 'action', 'numbering.approval.batch.create', 1),
    ('default-perm-pdm_admin-action-numbering-approval-batch-decide', 'pdm_admin', 'action', 'numbering.approval.batch.decide', 1),
    ('default-perm-pdm_admin-action-numbering-approval-batch-resubmit', 'pdm_admin', 'action', 'numbering.approval.batch.resubmit', 1),
    ('default-perm-pdm_admin-action-numbering-impact-analyze', 'pdm_admin', 'action', 'numbering.impact.analyze', 1),
    ('default-perm-pdm_admin-action-numbering-impact-apply', 'pdm_admin', 'action', 'numbering.impact.apply', 1),
    ('default-perm-pdm_admin-action-numbering-import-stage', 'pdm_admin', 'action', 'numbering.import.stage', 1),
    ('default-perm-pdm_admin-action-numbering-import-confirm', 'pdm_admin', 'action', 'numbering.import.confirm', 1),
    ('default-perm-pdm_admin-action-numbering-export-create', 'pdm_admin', 'action', 'numbering.export.create', 1),
    ('default-perm-pdm_admin-action-numbering-audit-report-generate', 'pdm_admin', 'action', 'numbering.audit_report.generate', 1),
    ('default-perm-pdm_admin-action-numbering-task-update', 'pdm_admin', 'action', 'numbering.task.update', 1),
    ('default-perm-pdm_admin-action-numbering-notification-update', 'pdm_admin', 'action', 'numbering.notification.update', 1),
    ('default-perm-pdm_admin-action-numbering-attachments-manage', 'pdm_admin', 'action', 'numbering.attachments.manage', 1),
    ('default-perm-pdm_admin-action-settings-admin-matrix', 'pdm_admin', 'action', 'settings.admin_matrix', 1),
    ('default-perm-pdm_admin-action-numbering-draft-update', 'pdm_admin', 'action', 'numbering.draft.update', 1),
    ('default-perm-pdm_admin-action-numbering-draft-obsolete', 'pdm_admin', 'action', 'numbering.draft.obsolete', 1),
    ('default-perm-pdm_admin-action-numbering-draft-admin-confirm', 'pdm_admin', 'action', 'numbering.draft.admin_confirm', 1),
    ('default-perm-pdm_admin-action-update-name', 'pdm_admin', 'action', 'update_name', 1),
    ('default-perm-pdm_admin-action-update-spec', 'pdm_admin', 'action', 'update_spec', 1),
    ('default-perm-pdm_admin-action-obsolete-part-number', 'pdm_admin', 'action', 'obsolete_part_number', 1),
    ('default-perm-pdm_admin-action-obsolete-ma-drawing', 'pdm_admin', 'action', 'obsolete_ma_drawing', 1),
    ('default-perm-pdm_admin-action-obsolete-part-root', 'pdm_admin', 'action', 'obsolete_part_root', 1),
    ('default-perm-pdm_admin-action-merge-part-number', 'pdm_admin', 'action', 'merge_part_number', 1),
    ('default-perm-pdm_admin-action-dvt-missing-ma-override', 'pdm_admin', 'action', 'dvt_missing_ma_override', 1),
    ('default-perm-pdm_admin-action-dvt-promotion', 'pdm_admin', 'action', 'dvt_promotion', 1),
    ('default-perm-pdm_admin-action-release-missing-ma-confirm', 'pdm_admin', 'action', 'release_missing_ma_confirm', 1),
    ('default-perm-pdm_admin-action-release', 'pdm_admin', 'action', 'release', 1),
    ('default-perm-pdm_admin-action-pdm-shared-model-release', 'pdm_admin', 'action', 'pdm.shared_model.release', 1),
    ('default-perm-pdm_admin-action-pdm-drawing-package-model-exception-confirm', 'pdm_admin', 'action', 'pdm.drawing_package.model_exception.confirm', 1),
    ('default-perm-pdm_admin-action-pdm-manufacturing-baseline-release', 'pdm_admin', 'action', 'pdm.manufacturing_baseline.release', 1),
    ('default-perm-pdm_admin-action-post-release-change', 'pdm_admin', 'action', 'post_release_change', 1),
    ('default-perm-pdm_admin-action-same-drawing-variant-after-release', 'pdm_admin', 'action', 'same_drawing_variant_after_release', 1),
    ('default-perm-pdm_admin-action-main-drawing-restore', 'pdm_admin', 'action', 'main_drawing_restore', 1),
    ('default-perm-rd_manager-page-numbering-request', 'rd_manager', 'page', 'numbering.request', 1),
    ('default-perm-rd_manager-page-numbering-search', 'rd_manager', 'page', 'numbering.search', 1),
    ('default-perm-rd_manager-page-numbering-drawings-view', 'rd_manager', 'page', 'numbering.drawings.view', 1),
    ('default-perm-rd_manager-page-numbering-dvt', 'rd_manager', 'page', 'numbering.dvt', 1),
    ('default-perm-rd_manager-page-numbering-approvals', 'rd_manager', 'page', 'numbering.approvals', 1),
    ('default-perm-rd_manager-page-numbering-impact', 'rd_manager', 'page', 'numbering.impact', 1),
    ('default-perm-rd_manager-page-numbering-tasks', 'rd_manager', 'page', 'numbering.tasks', 1),
    ('default-perm-rd_manager-page-numbering-reports', 'rd_manager', 'page', 'numbering.reports', 1),
    ('default-perm-rd_manager-action-numbering-create', 'rd_manager', 'action', 'numbering.create', 1),
    ('default-perm-rd_manager-action-numbering-duplicate-check', 'rd_manager', 'action', 'numbering.duplicate_check', 1),
    ('default-perm-rd_manager-action-numbering-link-variant', 'rd_manager', 'action', 'numbering.link_variant', 1),
    ('default-perm-rd_manager-action-numbering-dvt-submit', 'rd_manager', 'action', 'numbering.dvt.submit', 1),
    ('default-perm-rd_manager-action-numbering-approval-request', 'rd_manager', 'action', 'numbering.approval.request', 1),
    ('default-perm-rd_manager-action-numbering-approval-batch-create', 'rd_manager', 'action', 'numbering.approval.batch.create', 1),
    ('default-perm-rd_manager-action-numbering-approval-batch-decide', 'rd_manager', 'action', 'numbering.approval.batch.decide', 1),
    ('default-perm-rd_manager-action-numbering-approval-batch-resubmit', 'rd_manager', 'action', 'numbering.approval.batch.resubmit', 1),
    ('default-perm-rd_manager-action-numbering-impact-analyze', 'rd_manager', 'action', 'numbering.impact.analyze', 1),
    ('default-perm-rd_manager-action-numbering-impact-apply', 'rd_manager', 'action', 'numbering.impact.apply', 1),
    ('default-perm-rd_manager-action-numbering-export-create', 'rd_manager', 'action', 'numbering.export.create', 1),
    ('default-perm-rd_manager-action-numbering-task-update', 'rd_manager', 'action', 'numbering.task.update', 1),
    ('default-perm-rd_manager-action-numbering-notification-update', 'rd_manager', 'action', 'numbering.notification.update', 1),
    ('default-perm-rd_manager-action-numbering-attachments-manage', 'rd_manager', 'action', 'numbering.attachments.manage', 1),
    ('default-perm-rd_manager-action-numbering-draft-update', 'rd_manager', 'action', 'numbering.draft.update', 1),
    ('default-perm-rd_manager-action-numbering-draft-obsolete', 'rd_manager', 'action', 'numbering.draft.obsolete', 1),
    ('default-perm-rd_manager-action-dvt-promotion', 'rd_manager', 'action', 'dvt_promotion', 1),
    ('default-perm-rd_manager-action-release', 'rd_manager', 'action', 'release', 1),
    ('default-perm-rd_manager-action-pdm-shared-model-release', 'rd_manager', 'action', 'pdm.shared_model.release', 1),
    ('default-perm-rd_manager-action-pdm-drawing-package-model-exception-confirm', 'rd_manager', 'action', 'pdm.drawing_package.model_exception.confirm', 1),
    ('default-perm-rd_manager-action-pdm-manufacturing-baseline-release', 'rd_manager', 'action', 'pdm.manufacturing_baseline.release', 1),
    ('default-perm-rd_manager-action-obsolete-ma-drawing', 'rd_manager', 'action', 'obsolete_ma_drawing', 1),
    ('default-perm-rd_manager-action-post-release-change', 'rd_manager', 'action', 'post_release_change', 1),
    ('default-perm-rd-page-numbering-request', 'rd', 'page', 'numbering.request', 1),
    ('default-perm-rd-page-numbering-search', 'rd', 'page', 'numbering.search', 1),
    ('default-perm-rd-page-numbering-drawings-view', 'rd', 'page', 'numbering.drawings.view', 1),
    ('default-perm-rd-page-numbering-dvt', 'rd', 'page', 'numbering.dvt', 1),
    ('default-perm-rd-page-numbering-impact', 'rd', 'page', 'numbering.impact', 1),
    ('default-perm-rd-page-numbering-tasks', 'rd', 'page', 'numbering.tasks', 1),
    ('default-perm-rd-page-numbering-imports', 'rd', 'page', 'numbering.imports', 1),
    ('default-perm-rd-action-numbering-create', 'rd', 'action', 'numbering.create', 1),
    ('default-perm-rd-action-numbering-duplicate-check', 'rd', 'action', 'numbering.duplicate_check', 1),
    ('default-perm-rd-action-numbering-link-variant', 'rd', 'action', 'numbering.link_variant', 1),
    ('default-perm-rd-action-numbering-draft-update', 'rd', 'action', 'numbering.draft.update', 1),
    ('default-perm-rd-action-numbering-draft-obsolete', 'rd', 'action', 'numbering.draft.obsolete', 1),
    ('default-perm-rd-action-numbering-dvt-submit', 'rd', 'action', 'numbering.dvt.submit', 1),
    ('default-perm-rd-action-numbering-approval-request', 'rd', 'action', 'numbering.approval.request', 1),
    ('default-perm-rd-action-numbering-approval-batch-create', 'rd', 'action', 'numbering.approval.batch.create', 1),
    ('default-perm-rd-action-numbering-approval-batch-resubmit', 'rd', 'action', 'numbering.approval.batch.resubmit', 1),
    ('default-perm-rd-action-numbering-impact-analyze', 'rd', 'action', 'numbering.impact.analyze', 1),
    ('default-perm-rd-action-numbering-import-stage', 'rd', 'action', 'numbering.import.stage', 1),
    ('default-perm-rd-action-numbering-task-update', 'rd', 'action', 'numbering.task.update', 1),
    ('default-perm-rd-action-numbering-notification-update', 'rd', 'action', 'numbering.notification.update', 1),
    ('default-perm-rd-action-numbering-attachments-manage', 'rd', 'action', 'numbering.attachments.manage', 1),
    ('default-perm-document_admin-page-numbering-search', 'document_admin', 'page', 'numbering.search', 1),
    ('default-perm-document_admin-page-numbering-drawings-view', 'document_admin', 'page', 'numbering.drawings.view', 1),
    ('default-perm-document_admin-page-numbering-tasks', 'document_admin', 'page', 'numbering.tasks', 1),
    ('default-perm-document_admin-page-numbering-reports', 'document_admin', 'page', 'numbering.reports', 1),
    ('default-perm-document_admin-action-numbering-task-update', 'document_admin', 'action', 'numbering.task.update', 1),
    ('default-perm-document_admin-action-numbering-notification-update', 'document_admin', 'action', 'numbering.notification.update', 1),
    ('default-perm-qa-page-numbering-search', 'qa', 'page', 'numbering.search', 1),
    ('default-perm-qa-page-numbering-drawings-view', 'qa', 'page', 'numbering.drawings.view', 1),
    ('default-perm-qa-page-numbering-tasks', 'qa', 'page', 'numbering.tasks', 1),
    ('default-perm-qa-page-numbering-reports', 'qa', 'page', 'numbering.reports', 1),
    ('default-perm-qa-action-numbering-task-update', 'qa', 'action', 'numbering.task.update', 1),
    ('default-perm-qa-action-numbering-notification-update', 'qa', 'action', 'numbering.notification.update', 1),
    ('default-perm-manufacturing-page-numbering-search', 'manufacturing', 'page', 'numbering.search', 1),
    ('default-perm-manufacturing-page-numbering-drawings-view', 'manufacturing', 'page', 'numbering.drawings.view', 1),
    ('default-perm-manufacturing-page-numbering-reports', 'manufacturing', 'page', 'numbering.reports', 1),
    ('default-perm-procurement-page-numbering-search', 'procurement', 'page', 'numbering.search', 1),
    ('default-perm-procurement-page-numbering-drawings-view', 'procurement', 'page', 'numbering.drawings.view', 1),
    ('default-perm-procurement-page-numbering-reports', 'procurement', 'page', 'numbering.reports', 1),
    ('default-perm-external_specialist-page-numbering-search', 'external_specialist', 'page', 'numbering.search', 1),
    ('default-perm-external_specialist-page-numbering-drawings-view', 'external_specialist', 'page', 'numbering.drawings.view', 1),
    ('default-perm-external_specialist-action-pdm-comment-create', 'external_specialist', 'action', 'pdm.comment.create', 1),
    ('default-perm-external_specialist-action-pdm-advice-create', 'external_specialist', 'action', 'pdm.advice.create', 1),
    ('default-perm-system_admin-action-numbering-workspace-view', 'system_admin', 'action', 'numbering.workspace.view', 1),
    ('default-perm-system_admin-action-numbering-workspace-create', 'system_admin', 'action', 'numbering.workspace.create', 1),
    ('default-perm-system_admin-action-numbering-workspace-update', 'system_admin', 'action', 'numbering.workspace.update', 1),
    ('default-perm-system_admin-action-numbering-workspace-cancel', 'system_admin', 'action', 'numbering.workspace.cancel', 1),
    ('default-perm-system_admin-action-numbering-candidate-acquire', 'system_admin', 'action', 'numbering.candidate.acquire', 1),
    ('default-perm-system_admin-action-numbering-candidate-recycle', 'system_admin', 'action', 'numbering.candidate.recycle', 1),
    ('default-perm-system_admin-action-numbering-candidate-review-submit', 'system_admin', 'action', 'numbering.candidate.review.submit', 1),
    ('default-perm-system_admin-action-numbering-candidate-review-withdraw', 'system_admin', 'action', 'numbering.candidate.review.withdraw', 1),
    ('default-perm-system_admin-action-numbering-candidate-review-decide', 'system_admin', 'action', 'numbering.candidate.review.decide', 1),
    ('default-perm-system_admin-action-numbering-publish', 'system_admin', 'action', 'numbering.publish', 1),
    ('default-perm-pdm_admin-action-numbering-workspace-view', 'pdm_admin', 'action', 'numbering.workspace.view', 1),
    ('default-perm-pdm_admin-action-numbering-workspace-create', 'pdm_admin', 'action', 'numbering.workspace.create', 1),
    ('default-perm-pdm_admin-action-numbering-workspace-update', 'pdm_admin', 'action', 'numbering.workspace.update', 1),
    ('default-perm-pdm_admin-action-numbering-workspace-cancel', 'pdm_admin', 'action', 'numbering.workspace.cancel', 1),
    ('default-perm-pdm_admin-action-numbering-candidate-acquire', 'pdm_admin', 'action', 'numbering.candidate.acquire', 1),
    ('default-perm-pdm_admin-action-numbering-candidate-recycle', 'pdm_admin', 'action', 'numbering.candidate.recycle', 1),
    ('default-perm-pdm_admin-action-numbering-candidate-review-submit', 'pdm_admin', 'action', 'numbering.candidate.review.submit', 1),
    ('default-perm-pdm_admin-action-numbering-candidate-review-withdraw', 'pdm_admin', 'action', 'numbering.candidate.review.withdraw', 1),
    ('default-perm-pdm_admin-action-numbering-candidate-review-decide', 'pdm_admin', 'action', 'numbering.candidate.review.decide', 1),
    ('default-perm-pdm_admin-action-numbering-publish', 'pdm_admin', 'action', 'numbering.publish', 1),
    ('default-perm-rd_manager-action-numbering-workspace-view', 'rd_manager', 'action', 'numbering.workspace.view', 1),
    ('default-perm-rd_manager-action-numbering-workspace-create', 'rd_manager', 'action', 'numbering.workspace.create', 1),
    ('default-perm-rd_manager-action-numbering-workspace-update', 'rd_manager', 'action', 'numbering.workspace.update', 1),
    ('default-perm-rd_manager-action-numbering-workspace-cancel', 'rd_manager', 'action', 'numbering.workspace.cancel', 1),
    ('default-perm-rd_manager-action-numbering-candidate-acquire', 'rd_manager', 'action', 'numbering.candidate.acquire', 1),
    ('default-perm-rd_manager-action-numbering-candidate-recycle', 'rd_manager', 'action', 'numbering.candidate.recycle', 1),
    ('default-perm-rd_manager-action-numbering-candidate-review-submit', 'rd_manager', 'action', 'numbering.candidate.review.submit', 1),
    ('default-perm-rd_manager-action-numbering-candidate-review-withdraw', 'rd_manager', 'action', 'numbering.candidate.review.withdraw', 1),
    ('default-perm-rd_manager-action-numbering-candidate-review-decide', 'rd_manager', 'action', 'numbering.candidate.review.decide', 1),
    ('default-perm-rd-action-numbering-workspace-view', 'rd', 'action', 'numbering.workspace.view', 1),
    ('default-perm-rd-action-numbering-workspace-create', 'rd', 'action', 'numbering.workspace.create', 1),
    ('default-perm-rd-action-numbering-workspace-update', 'rd', 'action', 'numbering.workspace.update', 1),
    ('default-perm-rd-action-numbering-workspace-cancel', 'rd', 'action', 'numbering.workspace.cancel', 1),
    ('default-perm-rd-action-numbering-candidate-acquire', 'rd', 'action', 'numbering.candidate.acquire', 1),
    ('default-perm-rd-action-numbering-candidate-recycle', 'rd', 'action', 'numbering.candidate.recycle', 1),
    ('default-perm-rd-action-numbering-candidate-review-submit', 'rd', 'action', 'numbering.candidate.review.submit', 1),
    ('default-perm-rd-action-numbering-candidate-review-withdraw', 'rd', 'action', 'numbering.candidate.review.withdraw', 1),
    ('default-perm-system_admin-action-transfer-package-view', 'system_admin', 'action', 'transfer.package.view', 1),
    ('default-perm-system_admin-action-transfer-package-create', 'system_admin', 'action', 'transfer.package.create', 1),
    ('default-perm-system_admin-action-transfer-package-update', 'system_admin', 'action', 'transfer.package.update', 1),
    ('default-perm-system_admin-action-transfer-package-review-submit', 'system_admin', 'action', 'transfer.package.review.submit', 1),
    ('default-perm-system_admin-action-transfer-package-review-withdraw', 'system_admin', 'action', 'transfer.package.review.withdraw', 1),
    ('default-perm-system_admin-action-transfer-package-review-decide', 'system_admin', 'action', 'transfer.package.review.decide', 1),
    ('default-perm-system_admin-action-transfer-package-publish', 'system_admin', 'action', 'transfer.package.publish', 1),
    ('default-perm-system_admin-action-handoff-published-view', 'system_admin', 'action', 'handoff.published.view', 1),
    ('default-perm-pdm_admin-action-transfer-package-view', 'pdm_admin', 'action', 'transfer.package.view', 1),
    ('default-perm-pdm_admin-action-transfer-package-create', 'pdm_admin', 'action', 'transfer.package.create', 1),
    ('default-perm-pdm_admin-action-transfer-package-update', 'pdm_admin', 'action', 'transfer.package.update', 1),
    ('default-perm-pdm_admin-action-transfer-package-review-submit', 'pdm_admin', 'action', 'transfer.package.review.submit', 1),
    ('default-perm-pdm_admin-action-transfer-package-review-withdraw', 'pdm_admin', 'action', 'transfer.package.review.withdraw', 1),
    ('default-perm-pdm_admin-action-transfer-package-review-decide', 'pdm_admin', 'action', 'transfer.package.review.decide', 1),
    ('default-perm-pdm_admin-action-transfer-package-publish', 'pdm_admin', 'action', 'transfer.package.publish', 1),
    ('default-perm-pdm_admin-action-handoff-published-view', 'pdm_admin', 'action', 'handoff.published.view', 1),
    ('default-perm-rd_manager-action-transfer-package-view', 'rd_manager', 'action', 'transfer.package.view', 1),
    ('default-perm-rd_manager-action-transfer-package-create', 'rd_manager', 'action', 'transfer.package.create', 1),
    ('default-perm-rd_manager-action-transfer-package-update', 'rd_manager', 'action', 'transfer.package.update', 1),
    ('default-perm-rd_manager-action-transfer-package-review-submit', 'rd_manager', 'action', 'transfer.package.review.submit', 1),
    ('default-perm-rd_manager-action-transfer-package-review-withdraw', 'rd_manager', 'action', 'transfer.package.review.withdraw', 1),
    ('default-perm-rd_manager-action-transfer-package-review-decide', 'rd_manager', 'action', 'transfer.package.review.decide', 1),
    ('default-perm-rd_manager-action-transfer-package-publish', 'rd_manager', 'action', 'transfer.package.publish', 1),
    ('default-perm-rd_manager-action-handoff-published-view', 'rd_manager', 'action', 'handoff.published.view', 1),
    ('default-perm-rd-action-transfer-package-view', 'rd', 'action', 'transfer.package.view', 1),
    ('default-perm-rd-action-transfer-package-create', 'rd', 'action', 'transfer.package.create', 1),
    ('default-perm-rd-action-transfer-package-update', 'rd', 'action', 'transfer.package.update', 1),
    ('default-perm-rd-action-transfer-package-review-submit', 'rd', 'action', 'transfer.package.review.submit', 1),
    ('default-perm-rd-action-transfer-package-review-withdraw', 'rd', 'action', 'transfer.package.review.withdraw', 1),
    ('default-perm-rd-action-handoff-published-view', 'rd', 'action', 'handoff.published.view', 1),
    ('default-perm-manufacturing-action-handoff-published-view', 'manufacturing', 'action', 'handoff.published.view', 1),
    ('default-perm-procurement-action-handoff-published-view', 'procurement', 'action', 'handoff.published.view', 1)
)
INSERT INTO role_permissions (
  id, role_id, permission_kind, permission_code, allowed, created_at, updated_at
)
SELECT p.id, r.id, p.permission_kind, p.permission_code, p.allowed, now(), now()
FROM canonical_permissions p
JOIN roles r ON r.role_code = p.role_code
ON CONFLICT (role_id, permission_kind, permission_code) DO UPDATE SET
  allowed = EXCLUDED.allowed,
  updated_at = now();

INSERT INTO users (
  id, display_name, email, password_hash, role, company_id,
  account_status, account_lifecycle_version, system_role_enabled,
  account_status_changed_at, account_status_changed_by, account_status_reason,
  created_at, updated_at
)
VALUES (
  'prod-pdm-admin-001', '[鉦富]張仕杰 Jed', 'jedchang0308@jenfu.com.tw', NULL,
  'Admin', 'company-jenfu', 'active', 1, 1,
  now(), NULL, 'DEV-032 production initial Google Admin bootstrap', now(), now()
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  email = EXCLUDED.email,
  password_hash = NULL,
  role = EXCLUDED.role,
  company_id = EXCLUDED.company_id,
  account_status = 'active',
  system_role_enabled = 1,
  account_status_changed_at = now(),
  account_status_changed_by = NULL,
  account_status_reason = EXCLUDED.account_status_reason,
  updated_at = now();

INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
VALUES ('prod-pdm-admin-001', 'company-jenfu', 1, now())
ON CONFLICT (user_id, company_id) DO UPDATE SET is_default = 1;

INSERT INTO auth_identities (
  id, user_id, provider, provider_subject, login_identifier, email_normalized,
  verified_at, status, identity_lifecycle_version, created_at, updated_at
)
VALUES (
  'auth-google-prod-pdm-admin-001', 'prod-pdm-admin-001', 'google_oauth',
  'U57t2eIOzLdhAmNDUbFyOz3fdMm2', 'jedchang0308@jenfu.com.tw', 'jedchang0308@jenfu.com.tw',
  now(), 'active', 1, now(), now()
)
ON CONFLICT (provider, provider_subject) DO UPDATE SET
  login_identifier = EXCLUDED.login_identifier,
  email_normalized = EXCLUDED.email_normalized,
  verified_at = EXCLUDED.verified_at,
  status = 'active',
  updated_at = now();

INSERT INTO platform_organization_mappings (
  platform_organization_id, pdm_company_id, mapping_source, mapping_status,
  external_organization_key, created_at, updated_at
)
VALUES (
  'iam:organization:jenfu', 'company-jenfu',
  'shared_core', 'active', 'jenfu', now(), now()
)
ON CONFLICT (pdm_company_id) DO UPDATE SET
  platform_organization_id = EXCLUDED.platform_organization_id,
  mapping_source = 'shared_core',
  mapping_status = 'active',
  external_organization_key = EXCLUDED.external_organization_key,
  updated_at = now();

INSERT INTO platform_principal_mappings (
  platform_principal_id, pdm_user_id, mapping_source, mapping_status,
  external_subject, created_at, updated_at
)
VALUES (
  'iam:principal:prod-pdm-admin-001', 'prod-pdm-admin-001',
  'shared_iam', 'active', 'U57t2eIOzLdhAmNDUbFyOz3fdMm2', now(), now()
)
ON CONFLICT (pdm_user_id) DO UPDATE SET
  platform_principal_id = EXCLUDED.platform_principal_id,
  mapping_source = 'shared_iam',
  mapping_status = 'active',
  external_subject = EXCLUDED.external_subject,
  updated_at = now();

COMMIT;
