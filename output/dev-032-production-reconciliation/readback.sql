-- DEV-032 production/restore read-only reconciliation
-- No mutation statement is permitted in this artifact.
WITH
expected_migrations(version, checksum) AS (
  VALUES
    ('001', '309039c3f931a269e42a4350c9295e795eb3e494f6e4ad54abb10e40a90aa387'),
    ('003', '0cb8e323e4fa00cc231b2930cfa87cffcd9c9a522f4973590293b0871da10743'),
    ('004', '0d21f0ec57d1bdca2c609f1cd40beee0a0f7362072f8632aa32c29ec868d45ee'),
    ('005', '5ef797abb496b4c0754ddc9a4774cdc9637554ec2e2bc15aff759a8507b90efc'),
    ('006', 'baf05c57641da97af592fc5914930d27cab649cd93ad5285c371eb6531809aae'),
    ('007', '53aab1893c5ee26144f8ae39367b33eedb6b586b5dee949b191ebff3928d5077'),
    ('008', '9feaf35ea0ba8a45f001bbb4e04112c938bb1935cbc807b1d20e2cf3771322a7'),
    ('009', '70a31ad24f51b2b7d6009b9416d02a814d2861850e92ede13552e6a476f47705'),
    ('010', '6c650f75c27999ff7a5a061197eda05e82260e40bee81f3664fd586b648c9630'),
    ('012', '275a0d501314bf9c8b09651b2eee448d6ff4f16944777c75d5922d51441bae11'),
    ('013', 'aac0a765cafda2410504b0e53747cb6435c8ee9fbe7a05d870e730fee37e4937'),
    ('014', 'c5275315edef9b578e66192a551f09e0a1524f869b1a39724880924961acc554'),
    ('015', '5c833c2534a51ac8710e438b9cbb256d2ed4d63d6d84bfbda4a593cb9043fc1c'),
    ('016', '057fb1df516fea7eb80c890ed7df708cdc3868ce32c34038848aa51b3fba8ad2'),
    ('017', '0a8be1220b832ec633c679367869e722bd500ca73acf89468115d7cf7f24f366'),
    ('018', 'd7072c20f89cc75d955886456f1e708298a5ef3a02c2334f05ebdc7b759198fe'),
    ('019', '11299ce7ed84fae7c9817f195f67379913f2a6a5d7457794e23c78a64cd3c73a'),
    ('020', '41f53f2f7e703bc64c3ae5207de82de713e3d6d4ab2e6ad015237b966b43ae8e')
),
official_codes(number_kind, company_id, number_value) AS (
  SELECT 'root', company_id, root_code FROM part_roots
  UNION ALL SELECT 'part', company_id, part_number FROM part_numbers
  UNION ALL SELECT 'drawing', company_id, drawing_number FROM drawing_numbers
),
reserved_codes(number_kind, company_id, number_value) AS (
  SELECT draft_item_type, company_id, candidate_code
  FROM number_candidate_reservations
  WHERE reservation_state IN ('active', 'review_locked', 'approved_locked')
  UNION ALL
  SELECT number_kind, company_id, number_value
  FROM numbering_recovery_reservations
  WHERE reservation_status = 'reserved'
),
reservation_max AS (
  SELECT company_id, sequence_scope_key, MAX(sequence_no) AS max_sequence_no
  FROM number_candidate_reservations
  WHERE reservation_state IN ('active', 'review_locked', 'approved_locked', 'promoted')
  GROUP BY company_id, sequence_scope_key
),
snapshot AS (
  SELECT jsonb_build_object(
    'sequences', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence_key) FROM (
      SELECT sequence_key, company_id, next_value FROM numbering_sequences
    ) s), '[]'::jsonb),
    'official', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.number_kind, o.company_id, o.number_value) FROM official_codes o), '[]'::jsonb),
    'reservations', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.company_id, r.sequence_scope_key, r.sequence_no, r.id) FROM (
      SELECT id, company_id, sequence_scope_key, sequence_no, candidate_code, reservation_state,
             promoted_master_type, promoted_master_id
      FROM number_candidate_reservations
    ) r), '[]'::jsonb),
    'recovery', COALESCE((SELECT jsonb_agg(to_jsonb(rr) ORDER BY rr.company_id, rr.number_kind, rr.number_value) FROM (
      SELECT company_id, number_kind, number_value, reservation_status, ledger_entry_hash
      FROM numbering_recovery_reservations
    ) rr), '[]'::jsonb),
    'drafts', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.company_id, d.reserved_part_number, d.id) FROM (
      SELECT id, company_id, reserved_part_number, status, version FROM part_number_drafts
    ) d), '[]'::jsonb)
  ) AS payload
)
SELECT
  (SELECT COUNT(*)::int FROM expected_migrations) AS expected_migration_count,
  (SELECT COUNT(*)::int FROM pdm_schema_migrations) AS actual_migration_count,
  (SELECT COUNT(*)::int FROM expected_migrations e LEFT JOIN pdm_schema_migrations a USING (version) WHERE a.version IS NULL) AS missing_migration_count,
  (SELECT COUNT(*)::int FROM pdm_schema_migrations a LEFT JOIN expected_migrations e USING (version) WHERE e.version IS NULL) AS extra_migration_count,
  (SELECT COUNT(*)::int FROM expected_migrations e JOIN pdm_schema_migrations a USING (version) WHERE a.checksum <> e.checksum) AS checksum_mismatch_count,
  (SELECT COUNT(*)::int FROM (SELECT company_id, root_code FROM part_roots GROUP BY company_id, root_code HAVING COUNT(*) > 1) x) AS duplicate_root_count,
  (SELECT COUNT(*)::int FROM (SELECT company_id, part_number FROM part_numbers GROUP BY company_id, part_number HAVING COUNT(*) > 1) x) AS duplicate_part_count,
  (SELECT COUNT(*)::int FROM (SELECT company_id, drawing_number FROM drawing_numbers GROUP BY company_id, drawing_number HAVING COUNT(*) > 1) x) AS duplicate_drawing_count,
  (SELECT COUNT(*)::int FROM official_codes o JOIN reserved_codes r USING (number_kind, company_id, number_value)) AS active_number_reuse_count,
  (SELECT COUNT(*)::int FROM (
    SELECT company_id, draft_item_type, candidate_code
    FROM number_candidate_reservations
    WHERE reservation_state IN ('active', 'review_locked', 'approved_locked')
    GROUP BY company_id, draft_item_type, candidate_code HAVING COUNT(*) > 1
  ) x) AS duplicate_active_candidate_count,
  (SELECT COUNT(*)::int FROM reservation_max r
    JOIN numbering_sequences s ON s.company_id = r.company_id AND s.sequence_key = r.sequence_scope_key
    WHERE s.next_value <= r.max_sequence_no) AS sequence_regression_count,
  (SELECT COUNT(*)::int FROM number_candidate_reservations r
    LEFT JOIN numbering_draft_workspaces w ON w.id = r.workspace_id AND w.company_id = r.company_id
    LEFT JOIN numbering_draft_roots dr ON r.draft_item_type = 'root' AND dr.id = r.draft_item_id AND dr.workspace_id = r.workspace_id
    LEFT JOIN numbering_draft_parts dp ON r.draft_item_type = 'part' AND dp.id = r.draft_item_id AND dp.workspace_id = r.workspace_id
    LEFT JOIN numbering_draft_drawings dd ON r.draft_item_type = 'drawing' AND dd.id = r.draft_item_id AND dd.workspace_id = r.workspace_id
    WHERE w.id IS NULL OR (r.draft_item_type = 'root' AND dr.id IS NULL)
      OR (r.draft_item_type = 'part' AND dp.id IS NULL)
      OR (r.draft_item_type = 'drawing' AND dd.id IS NULL)) AS orphan_candidate_count,
  (SELECT COUNT(*)::int FROM number_candidate_reservations r
    LEFT JOIN part_roots pr ON r.promoted_master_type = 'part_root' AND pr.id = r.promoted_master_id
    LEFT JOIN part_numbers pn ON r.promoted_master_type = 'part_number' AND pn.id = r.promoted_master_id
    LEFT JOIN drawing_numbers dn ON r.promoted_master_type = 'drawing_number' AND dn.id = r.promoted_master_id
    WHERE r.reservation_state = 'promoted' AND (
      (r.promoted_master_type = 'part_root' AND (pr.id IS NULL OR pr.root_code <> r.candidate_code)) OR
      (r.promoted_master_type = 'part_number' AND (pn.id IS NULL OR pn.part_number <> r.candidate_code)) OR
      (r.promoted_master_type = 'drawing_number' AND (dn.id IS NULL OR dn.drawing_number <> r.candidate_code))
    )) AS orphan_promoted_target_count,
  (SELECT COUNT(*)::int FROM platform_command_receipts
    WHERE command_status = 'processing' AND created_at < now() - interval '15 minutes') AS stale_processing_receipt_count,
  (SELECT COUNT(*)::int FROM companies) AS company_count,
  (SELECT COUNT(*)::int FROM users WHERE account_status = 'active' AND role = 'Admin' AND system_role_enabled = 1) AS active_admin_count,
  (SELECT COUNT(*)::int FROM roles) AS role_count,
  (SELECT COUNT(*)::int FROM role_permissions) AS permission_count,
  (SELECT COUNT(*)::int FROM part_roots) AS root_count,
  (SELECT COUNT(*)::int FROM part_numbers) AS part_count,
  (SELECT COUNT(*)::int FROM drawing_numbers) AS drawing_count,
  (SELECT COUNT(*)::int FROM part_number_drafts) AS legacy_draft_count,
  (SELECT COUNT(*)::int FROM numbering_draft_workspaces) AS workspace_count,
  ((SELECT COUNT(*) FROM numbering_publication_evidence) +
   (SELECT COUNT(*) FROM file_assets WHERE storage_provider = 'google_cloud_storage'))::int AS gcs_evidence_count,
  (SELECT payload FROM snapshot) AS numbering_snapshot;
