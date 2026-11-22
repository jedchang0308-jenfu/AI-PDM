// Reviewed ai_pdm_core names from the source-bound DEV-126 baseline. Each
// subsequent group is one complete, forward-only PostgreSQL migration.
const initialBusinessRelations = Object.freeze([
  'account_invitations', 'account_recovery_requests', 'account_session_records',
  'active_role_catalog', 'approval_batch_items', 'approval_batches', 'approval_decisions',
  'approval_delegations', 'approval_matrix_requirements', 'approval_platform_actions',
  'approval_platform_decisions', 'approval_platform_events',
  'approval_platform_impact_snapshots', 'approval_platform_legacy_links',
  'approval_platform_package_items', 'approval_platform_packages', 'approval_platform_requests',
  'approval_platform_targets', 'approval_requests', 'approval_rules', 'approval_steps',
  'audit_logs', 'auth_identities', 'canonical_workbench_states', 'change_requests', 'companies',
  'contract_manifest', 'discussion_comments', 'drawing_numbers', 'drawing_part_links',
  'drawing_rd_branches', 'drawing_recognition_adapter_results',
  'drawing_recognition_candidate_observations', 'drawing_recognition_candidates',
  'drawing_recognition_decisions', 'drawing_recognition_formalization_events',
  'drawing_recognition_formalization_links', 'drawing_recognition_observations',
  'drawing_recognition_owner_reconciliations', 'drawing_recognition_sessions',
  'drawing_recognition_sources', 'drawing_revision_claims', 'drawing_revision_fff_assessments',
  'drawing_revision_files', 'drawing_revision_lifecycle_command_tokens',
  'drawing_revision_lifecycle_reviewers', 'drawing_revision_lifecycle_workflows',
  'drawing_revision_package_files', 'drawing_revision_package_model_links',
  'drawing_revision_package_part_scopes', 'drawing_revision_package_review_approvals',
  'drawing_revision_package_supplement_files', 'drawing_revision_package_supplements',
  'drawing_revision_packages', 'drawing_revision_work_files', 'drawing_revision_works',
  'drawing_revisions', 'drawings', 'duplicate_check_events', 'employee_login_aliases',
  'employee_login_intents', 'employee_login_rate_limits', 'file_assets', 'file_derivatives',
  'file_references', 'firebase_identity_invitations', 'item_locks', 'items',
  'llm_conversations', 'llm_messages', 'manufacturing_baseline_items',
  'manufacturing_baselines', 'monthly_audit_reports', 'number_candidate_events',
  'number_candidate_reservations', 'numbering_candidate_revision_drafts',
  'numbering_candidate_revision_files', 'numbering_draft_drawings', 'numbering_draft_parts',
  'numbering_draft_relations', 'numbering_draft_roots', 'numbering_draft_workspaces',
  'numbering_export_jobs', 'numbering_notifications', 'numbering_publication_evidence',
  'numbering_recovery_reservations', 'numbering_rule_versions', 'numbering_sequences',
  'numbering_task_items', 'openswx_metadata_jobs', 'part_approved_change_snapshots',
  'part_change_works', 'part_number_drafts', 'part_number_events', 'part_numbers',
  'part_replacement_links', 'part_roots', 'part_variant_attributes', 'pdf_markups',
  'pdm_attribute_definitions', 'pdm_controlled_notes', 'pdm_drawing_revision_metadata_values',
  'pdm_engineering_evidence', 'pdm_local_data_migrations', 'pdm_part_attribute_values',
  'pdm_review_traces', 'pdm_work_review_requests', 'pdm_work_review_terminal_receipts',
  'pdm_workbench_aggregates', 'pdm_workbench_migration_quarantine', 'platform_command_receipts',
  'platform_organization_mappings', 'platform_outbox_events', 'platform_principal_mappings',
  'preview_jobs', 'principal_accounts', 'principal_approval_delegations',
  'principal_identity_cutovers', 'principal_identity_operations', 'principal_role_assignments',
  'privacy_notice_acknowledgements', 'privacy_notice_versions', 'procurement_sync_runs',
  'readonly_shares', 'relation_approved_change_snapshots', 'release_packages',
  'review_confirmation_events', 'review_issues', 'role_capability_display_snapshots',
  'role_catalog_entries', 'role_catalog_publications', 'role_permissions',
  'role_policy_commands', 'role_policy_drafts', 'role_policy_role_identities',
  'role_priority_versions', 'role_scope_rules', 'roles', 'rule_templates',
  'same_drawing_variants', 'sandbox_branches', 'secret_references', 'setting_activation_events',
  'setting_test_runs', 'settings_secret_activation_intents', 'settings_secret_probe_jobs',
  'shared_cad_model_versions', 'submission_attempts', 'submission_files',
  'submission_lifecycle_requests', 'submission_part_scopes', 'submission_snapshots',
  'submissions', 'supplier_portal_responses', 'system_settings', 'transfer_package_counters',
  'transfer_package_draft_items', 'transfer_package_events', 'transfer_package_items',
  'transfer_packages', 'user_company_memberships', 'user_role_assignments', 'users',
  'warning_events', 'windows_service_devices', 'windows_service_enrollments',
  'worker_capability_heartbeats',
])

const addedByMigration = [
  ['part_preview_settings'], // 103
  ['principal_session_revocation_events', 'principal_session_issuance_controls'], // 104
  ['role_policy_session_authority'], // 105
  ['reviewer_authority_state', 'reviewer_authority', 'reviewer_authority_intervals'], // 106
  [], // 107: shared review changes existing relations
  [], // 108: shared review guards change existing relations
  ['drawing_assembly_packages', 'drawing_assembly_analysis', 'drawing_assembly_review_snapshots'], // 109
]

const layouts = [initialBusinessRelations]
for (const additions of addedByMigration) {
  layouts.push(Object.freeze([...layouts.at(-1), ...additions].sort()))
}

export const reviewedBusinessLayouts = Object.freeze(layouts)
