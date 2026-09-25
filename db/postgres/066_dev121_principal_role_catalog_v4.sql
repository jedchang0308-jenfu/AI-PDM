-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: additive versioned role catalog publication
-- compatibility: new-version
-- governance-review: AIPDM/DEV-121#principal-owner-command-amendment
-- Owner release: apply after migration 065; publish v4 without service traffic.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev121-principal-role-catalog-v4'), hashtext(current_database()));
SET LOCAL ROLE jenfu_ai_pdm_migrator;

DO $dev121_catalog_upgrade$
DECLARE
  catalog jsonb := $dev121_catalog${"contractVersion":"jenfu.platform-entitlement.v1","applicationId":"ai-pdm","catalogVersion":"ai-pdm.role-catalog.2026-09-25.v4","publishedAt":"2026-09-25T00:00:00.000Z","roles":[{"stableRoleId":"role-rd","roleCode":"rd","displayName":"研發人員","assignable":true,"risk":"normal","subjectKind":"employee","recommendationAllowed":true,"delegationAllowed":true,"allowedScopeKinds":["workspace"],"assignmentTier":"app_admin","permissions":[{"code":"manufacturing.baseline.view","kind":"action","allowed":true},{"code":"numbering.candidate.review.submit","kind":"action","allowed":true},{"code":"numbering.workspace.cancel","kind":"action","allowed":true},{"code":"numbering.workspace.create","kind":"action","allowed":true},{"code":"numbering.workspace.update","kind":"action","allowed":true},{"code":"numbering.workspace.view","kind":"action","allowed":true},{"code":"pdm.file_metadata.detect","kind":"action","allowed":true},{"code":"pdm.shared_model.view","kind":"action","allowed":true},{"code":"submission.create","kind":"action","allowed":true},{"code":"submission.update","kind":"action","allowed":true},{"code":"submission.view","kind":"action","allowed":true},{"code":"numbering.request","kind":"page","allowed":true},{"code":"numbering.search","kind":"page","allowed":true}],"roleDefinitionHash":"59c34435adebc0d6c2536107fdc48a3cbfe6a56c5ba0f680df8767c2ca38bc70"},{"stableRoleId":"role-rd-manager","roleCode":"rd_manager","displayName":"研發主管","assignable":true,"risk":"high","subjectKind":"employee","recommendationAllowed":true,"delegationAllowed":true,"allowedScopeKinds":["workspace"],"assignmentTier":"app_admin","permissions":[{"code":"approval.inbox.view","kind":"action","allowed":true},{"code":"approval.request.apply","kind":"action","allowed":true},{"code":"approval.request.cleanup","kind":"action","allowed":true},{"code":"approval.request.decide","kind":"action","allowed":true},{"code":"integration.procurement.manage","kind":"action","allowed":true},{"code":"integration.procurement.view","kind":"action","allowed":true},{"code":"manufacturing.baseline.manage","kind":"action","allowed":true},{"code":"manufacturing.baseline.release","kind":"action","allowed":true},{"code":"manufacturing.baseline.view","kind":"action","allowed":true},{"code":"numbering.candidate.review.submit","kind":"action","allowed":true},{"code":"numbering.drawing_revision_lifecycle_review","kind":"action","allowed":true},{"code":"numbering.publish","kind":"action","allowed":true},{"code":"numbering.workspace.cancel","kind":"action","allowed":true},{"code":"numbering.workspace.create","kind":"action","allowed":true},{"code":"numbering.workspace.update","kind":"action","allowed":true},{"code":"numbering.workspace.view","kind":"action","allowed":true},{"code":"pdm.shared_model.manage","kind":"action","allowed":true},{"code":"pdm.shared_model.view","kind":"action","allowed":true},{"code":"submission.create","kind":"action","allowed":true},{"code":"submission.decide","kind":"action","allowed":true},{"code":"submission.lifecycle.decide","kind":"action","allowed":true},{"code":"submission.retry","kind":"action","allowed":true},{"code":"submission.review","kind":"action","allowed":true},{"code":"submission.share","kind":"action","allowed":true},{"code":"submission.update","kind":"action","allowed":true},{"code":"submission.view","kind":"action","allowed":true},{"code":"numbering.request","kind":"page","allowed":true},{"code":"numbering.search","kind":"page","allowed":true}],"roleDefinitionHash":"9cf4d425b47ea09da0789d92dd7be2131e726d9d19184283e046cf98754fe954"},{"stableRoleId":"role-qa","roleCode":"qa","displayName":"QA/QC","assignable":true,"risk":"normal","subjectKind":"employee","recommendationAllowed":true,"delegationAllowed":true,"allowedScopeKinds":["workspace"],"assignmentTier":"app_admin","permissions":[{"code":"numbering.drawing_revision_lifecycle_review","kind":"action","allowed":true},{"code":"numbering.search","kind":"page","allowed":true}],"roleDefinitionHash":"562f4a9cdf8861d2bdca08a70bdf66c82038f436ae29e56b552d9ed4caf4150a"},{"stableRoleId":"role-manufacturing","roleCode":"manufacturing","displayName":"生產人員","assignable":true,"risk":"normal","subjectKind":"employee","recommendationAllowed":true,"delegationAllowed":true,"allowedScopeKinds":["workspace"],"assignmentTier":"app_admin","permissions":[{"code":"handoff.published.view","kind":"action","allowed":true},{"code":"manufacturing.baseline.view","kind":"action","allowed":true},{"code":"pdm.shared_model.view","kind":"action","allowed":true},{"code":"numbering.drawings.view","kind":"page","allowed":true},{"code":"numbering.search","kind":"page","allowed":true}],"roleDefinitionHash":"15d1e433139893b502e3433f76809d62f5fc2a25d41a8f570fb2681ae2c9450e"},{"stableRoleId":"role-production-planning","roleCode":"production_planning","displayName":"生管人員","assignable":true,"risk":"normal","subjectKind":"employee","recommendationAllowed":true,"delegationAllowed":true,"allowedScopeKinds":["workspace"],"assignmentTier":"app_admin","permissions":[{"code":"handoff.published.view","kind":"action","allowed":true},{"code":"manufacturing.baseline.view","kind":"action","allowed":true},{"code":"pdm.shared_model.view","kind":"action","allowed":true},{"code":"numbering.drawings.view","kind":"page","allowed":true},{"code":"numbering.search","kind":"page","allowed":true},{"code":"numbering.tasks","kind":"page","allowed":true}],"roleDefinitionHash":"2f2833c7cbc6324e36fe2f9dcc23876c2e1b45ff83abe8afb7dd43b9888e0305"},{"stableRoleId":"role-procurement","roleCode":"procurement","displayName":"採購","assignable":true,"risk":"normal","subjectKind":"employee","recommendationAllowed":true,"delegationAllowed":true,"allowedScopeKinds":["workspace"],"assignmentTier":"app_admin","permissions":[{"code":"integration.procurement.view","kind":"action","allowed":true},{"code":"pdm.shared_model.view","kind":"action","allowed":true},{"code":"numbering.drawings.view","kind":"page","allowed":true},{"code":"numbering.search","kind":"page","allowed":true}],"roleDefinitionHash":"219aeffb8ddc42d8c0dfbce89c30487d5fc1af63a34d0b5234da7450601fc338"},{"stableRoleId":"role-external-specialist","roleCode":"external_specialist","displayName":"外部專員","assignable":true,"risk":"high","subjectKind":"employee","recommendationAllowed":false,"delegationAllowed":false,"allowedScopeKinds":["project"],"assignmentTier":"app_admin","permissions":[{"code":"numbering.search","kind":"page","allowed":true}],"metadata":{"requiresManualDirect":true,"requiresFiniteValidUntil":true},"roleDefinitionHash":"ec9cb497e7ae3c8984ab6d39d1f7e71e6410e1bc3b07fd3076bed562581464df"},{"stableRoleId":"role-pdm-admin","roleCode":"pdm_admin","displayName":"PDM管理員","assignable":true,"risk":"high","subjectKind":"employee","recommendationAllowed":true,"delegationAllowed":true,"allowedScopeKinds":["workspace"],"assignmentTier":"app_admin","permissions":[{"code":"accounts.identity.manage","kind":"action","allowed":true},{"code":"accounts.invitation.manage","kind":"action","allowed":true},{"code":"accounts.lifecycle.manage","kind":"action","allowed":true},{"code":"accounts.session.revoke","kind":"action","allowed":true},{"code":"approval.inbox.view","kind":"action","allowed":true},{"code":"approval.request.apply","kind":"action","allowed":true},{"code":"approval.request.cleanup","kind":"action","allowed":true},{"code":"approval.request.decide","kind":"action","allowed":true},{"code":"integration.procurement.manage","kind":"action","allowed":true},{"code":"integration.procurement.view","kind":"action","allowed":true},{"code":"manufacturing.baseline.manage","kind":"action","allowed":true},{"code":"manufacturing.baseline.release","kind":"action","allowed":true},{"code":"manufacturing.baseline.view","kind":"action","allowed":true},{"code":"numbering.candidate.review.submit","kind":"action","allowed":true},{"code":"numbering.drawing_revision_lifecycle_review","kind":"action","allowed":true},{"code":"numbering.publish","kind":"action","allowed":true},{"code":"numbering.workspace.cancel","kind":"action","allowed":true},{"code":"numbering.workspace.create","kind":"action","allowed":true},{"code":"numbering.workspace.update","kind":"action","allowed":true},{"code":"pdm.file_metadata.detect","kind":"action","allowed":true},{"code":"pdm.shared_model.manage","kind":"action","allowed":true},{"code":"pdm.shared_model.view","kind":"action","allowed":true},{"code":"settings.admin_matrix","kind":"action","allowed":true},{"code":"settings.integration.manage","kind":"action","allowed":true},{"code":"settings.manage","kind":"action","allowed":true},{"code":"settings.secret.manage","kind":"action","allowed":true},{"code":"settings.storage_evidence.view","kind":"action","allowed":true},{"code":"submission.create","kind":"action","allowed":true},{"code":"submission.decide","kind":"action","allowed":true},{"code":"submission.lifecycle.decide","kind":"action","allowed":true},{"code":"submission.retry","kind":"action","allowed":true},{"code":"submission.review","kind":"action","allowed":true},{"code":"submission.share","kind":"action","allowed":true},{"code":"submission.update","kind":"action","allowed":true},{"code":"submission.view","kind":"action","allowed":true},{"code":"numbering.search","kind":"page","allowed":true}],"roleDefinitionHash":"af111bc9b06358bec96b21bbd56d495eac2262e1a78b00376d825912206defbd"},{"stableRoleId":"role-system-admin","roleCode":"system_admin","displayName":"系統管理員","assignable":true,"risk":"critical","subjectKind":"principal","recommendationAllowed":false,"delegationAllowed":false,"allowedScopeKinds":["global"],"assignmentTier":"cross_app_override","permissions":[{"code":"accounts.identity.manage","kind":"action","allowed":true},{"code":"accounts.invitation.manage","kind":"action","allowed":true},{"code":"accounts.lifecycle.manage","kind":"action","allowed":true},{"code":"accounts.session.revoke","kind":"action","allowed":true},{"code":"approval.inbox.view","kind":"action","allowed":true},{"code":"approval.request.apply","kind":"action","allowed":true},{"code":"approval.request.cleanup","kind":"action","allowed":true},{"code":"approval.request.decide","kind":"action","allowed":true},{"code":"integration.procurement.manage","kind":"action","allowed":true},{"code":"integration.procurement.view","kind":"action","allowed":true},{"code":"manufacturing.baseline.manage","kind":"action","allowed":true},{"code":"manufacturing.baseline.release","kind":"action","allowed":true},{"code":"manufacturing.baseline.view","kind":"action","allowed":true},{"code":"numbering.candidate.review.submit","kind":"action","allowed":true},{"code":"numbering.drawing_revision_lifecycle_review","kind":"action","allowed":true},{"code":"numbering.publish","kind":"action","allowed":true},{"code":"numbering.workspace.cancel","kind":"action","allowed":true},{"code":"numbering.workspace.create","kind":"action","allowed":true},{"code":"numbering.workspace.update","kind":"action","allowed":true},{"code":"pdm.file_metadata.detect","kind":"action","allowed":true},{"code":"pdm.shared_model.manage","kind":"action","allowed":true},{"code":"pdm.shared_model.view","kind":"action","allowed":true},{"code":"settings.admin_matrix","kind":"action","allowed":true},{"code":"settings.integration.manage","kind":"action","allowed":true},{"code":"settings.manage","kind":"action","allowed":true},{"code":"settings.secret.manage","kind":"action","allowed":true},{"code":"settings.storage_evidence.view","kind":"action","allowed":true},{"code":"submission.create","kind":"action","allowed":true},{"code":"submission.decide","kind":"action","allowed":true},{"code":"submission.lifecycle.decide","kind":"action","allowed":true},{"code":"submission.retry","kind":"action","allowed":true},{"code":"submission.review","kind":"action","allowed":true},{"code":"submission.share","kind":"action","allowed":true},{"code":"submission.update","kind":"action","allowed":true},{"code":"submission.view","kind":"action","allowed":true}],"metadata":{"requiresHumanPrivilegedPrincipal":true,"forbidSelfAssignment":true},"roleDefinitionHash":"4b2ef5caa5327911c66ec0db7f2c2e7fc931853bc6688e6349f5275561aaed2d"}],"catalogSha256":"32f3593d7a0d2a5cad4875181a62b8f5c49a06c9cbba8835cd1b82e9b44ca08a"}$dev121_catalog$::jsonb;
  previous_version text := 'ai-pdm.role-catalog.2026-09-03.v3';
  previous_hash text := '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8';
  next_version text := catalog->>'catalogVersion';
  next_hash text := catalog->>'catalogSha256';
  current_version text;
  previous_status text;
  previous_observed_hash text;
  next_status text;
  next_observed_hash text;
  previous_count integer;
  next_count integer;
  mismatch_count integer;
  role_value jsonb;
  role_order bigint;
BEGIN
  SELECT catalog_version INTO current_version
    FROM ai_pdm_core.active_role_catalog
    WHERE application_id = 'ai-pdm' FOR UPDATE;
  SELECT status, catalog_sha256 INTO previous_status, previous_observed_hash
    FROM ai_pdm_core.role_catalog_publications
    WHERE catalog_version = previous_version AND application_id = 'ai-pdm' FOR UPDATE;
  SELECT status, catalog_sha256 INTO next_status, next_observed_hash
    FROM ai_pdm_core.role_catalog_publications
    WHERE catalog_version = next_version AND application_id = 'ai-pdm' FOR UPDATE;
  SELECT count(*) INTO previous_count FROM ai_pdm_core.role_catalog_entries
    WHERE catalog_version = previous_version;
  SELECT count(*) INTO next_count FROM ai_pdm_core.role_catalog_entries
    WHERE catalog_version = next_version;
  IF previous_observed_hash IS DISTINCT FROM previous_hash OR previous_count <> 9 THEN
    RAISE EXCEPTION 'DEV121_CATALOG_V3_BASELINE_MISMATCH';
  END IF;
  IF current_version = previous_version AND previous_status = 'active'
     AND next_status IS NULL AND next_count = 0 THEN
    UPDATE ai_pdm_core.role_catalog_publications
       SET status = 'retired', retired_at = clock_timestamp()
     WHERE catalog_version = previous_version AND application_id = 'ai-pdm';
    INSERT INTO ai_pdm_core.role_catalog_publications
      (catalog_version, contract_version, application_id, published_at,
       catalog_sha256, status, published_by)
    VALUES (next_version, catalog->>'contractVersion', 'ai-pdm',
            (catalog->>'publishedAt')::timestamptz, next_hash, 'active',
            'AIPDM/DEV-121 principal-first catalog v4');
    FOR role_value, role_order IN
      SELECT value, ordinality FROM jsonb_array_elements(catalog->'roles') WITH ORDINALITY
    LOOP
      INSERT INTO ai_pdm_core.role_catalog_entries
        (catalog_version, display_order, stable_role_id, role_code, display_name,
         assignable, risk, subject_kind, recommendation_allowed, delegation_allowed,
         allowed_scope_kinds, assignment_tier, permissions, metadata, role_definition_hash)
      VALUES (next_version, (role_order - 1)::integer,
              role_value->>'stableRoleId', role_value->>'roleCode', role_value->>'displayName',
              (role_value->>'assignable')::boolean, role_value->>'risk',
              role_value->>'subjectKind', (role_value->>'recommendationAllowed')::boolean,
              (role_value->>'delegationAllowed')::boolean,
              role_value->'allowedScopeKinds', role_value->>'assignmentTier',
              role_value->'permissions', role_value->'metadata',
              role_value->>'roleDefinitionHash');
    END LOOP;
    UPDATE ai_pdm_core.active_role_catalog
       SET catalog_version = next_version, activated_at = clock_timestamp(),
           activated_by = 'AIPDM/DEV-121',
           activation_reason = 'principal-first explicit DEV-087 capabilities'
     WHERE application_id = 'ai-pdm' AND catalog_version = previous_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEV121_CATALOG_POINTER_UPDATE_FAILED'; END IF;
  ELSIF current_version <> next_version OR previous_status <> 'retired'
     OR next_status <> 'active' OR next_observed_hash <> next_hash THEN
    RAISE EXCEPTION 'DEV121_CATALOG_STATE_MISMATCH';
  END IF;
  SELECT count(*) INTO next_count FROM ai_pdm_core.role_catalog_entries
    WHERE catalog_version = next_version;
  SELECT count(*) INTO mismatch_count
    FROM jsonb_array_elements(catalog->'roles') WITH ORDINALITY AS expected(role, ordinal)
    LEFT JOIN ai_pdm_core.role_catalog_entries AS observed
      ON observed.catalog_version = next_version
     AND observed.stable_role_id = expected.role->>'stableRoleId'
    WHERE observed.stable_role_id IS NULL
       OR observed.display_order <> expected.ordinal - 1
       OR observed.role_code <> expected.role->>'roleCode'
       OR observed.role_definition_hash <> expected.role->>'roleDefinitionHash'
       OR observed.permissions IS DISTINCT FROM expected.role->'permissions';
  IF next_count <> 9 OR mismatch_count <> 0 OR
     (SELECT count(*) FROM ai_pdm_contract.v_application_role_catalog_v1
       WHERE application_id = 'ai-pdm' AND catalog_version = next_version
         AND catalog_sha256 = next_hash) <> 9 THEN
    RAISE EXCEPTION 'DEV121_CATALOG_V4_READBACK_FAILED';
  END IF;
END;
$dev121_catalog_upgrade$;
COMMIT;
