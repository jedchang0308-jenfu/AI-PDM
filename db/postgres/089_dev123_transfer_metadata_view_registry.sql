-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: initial registry payload binding; versioned shape unchanged
-- compatibility: backward-compatible
-- governance-review: AIPDM/DEV-123
-- Metadata GET uses transfer.view; bytes still require view AND download.
-- The domain-builder regression binds the new semantic registry hash.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtext('dev123-role-policy-editor-v1'),hashtext(current_database()));
SET LOCAL ROLE jenfu_ai_pdm_migrator;

DO $initial_only$
BEGIN
  PERFORM 1 FROM ai_pdm_core.role_policy_state
    WHERE application_id='ai-pdm' AND mode='DISABLED' AND activation_generation=0
      AND registry_hash='fb824e6ddedc5d0590bef6f1bed730bd579d27e11af89b5a8760a5d6a426239c'
    FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM ai_pdm_core.role_catalog_publications
      WHERE application_id='ai-pdm' AND publication_format='dynamic-policy-v1')
    OR EXISTS(SELECT 1 FROM ai_pdm_core.role_policy_drafts) THEN
    RAISE EXCEPTION 'DEV123_REGISTRY_CORRECTION_REQUIRES_UNENABLED_BASELINE' USING ERRCODE='55000';
  END IF;
END;
$initial_only$;

UPDATE ai_pdm_core.role_policy_state
SET registry_hash='c2340c96a64004538b11fd59b1a1c4f03a88779c7db722f583037b4dc6c49869',
    registry_payload=jsonb_set(registry_payload,'{registryHash}',
      to_jsonb('c2340c96a64004538b11fd59b1a1c4f03a88779c7db722f583037b4dc6c49869'::text)),
    updated_at=clock_timestamp()
WHERE application_id='ai-pdm';

UPDATE ai_pdm_core.contract_manifest
SET payload_sha256='c2340c96a64004538b11fd59b1a1c4f03a88779c7db722f583037b4dc6c49869',
    published_at=clock_timestamp()
WHERE contract_id='ai-pdm.role-policy-catalog-v2'
  AND contract_version='ai-pdm.role-policy-catalog.v2';

COMMIT;
