/** Add only the owning application's columns used by its real canonical work,
 * strict review-package builder and submit transaction to the disposable PG fixture. */
export async function installDev129SubmitFixture(client, prefix="submit") {
  if(!/^[a-z]+$/u.test(prefix))throw new Error("INVALID_FIXTURE_PREFIX");
  const installed=await client.queryOne("SELECT to_regclass('ai_pdm_core.drawing_rd_branches') AS installed");
  if(!installed?.installed)await client.execute(`
    ALTER TABLE part_roots ADD COLUMN root_code text DEFAULT 'FIXTURE';
    ALTER TABLE drawings ADD COLUMN formal_drawing_number_id text,ADD COLUMN drawing_number text,
      ADD COLUMN purpose_code text DEFAULT 'M',ADD COLUMN purpose_description text DEFAULT 'Fixture drawing',
      ADD COLUMN workspace_id text,ADD COLUMN updated_at timestamptz DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE drawing_revisions ADD COLUMN revision text DEFAULT '0.1',ADD COLUMN lifecycle_state text DEFAULT 'preparing',
      ADD COLUMN policy_snapshot_json text DEFAULT '{}',ADD COLUMN row_version integer DEFAULT 1,ADD COLUMN created_by text,
      ADD COLUMN updated_by text,ADD COLUMN updated_at timestamptz DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE drawing_revision_works ADD COLUMN branch_id text,ADD COLUMN target_claim_id text,
      ADD COLUMN proposed_payload text DEFAULT '{}',ADD COLUMN base_hash text DEFAULT 'fixture-base';
    ALTER TABLE canonical_workbench_states ADD COLUMN id text,ADD COLUMN entity_type text,ADD COLUMN canonical_entity_id text,
      ADD COLUMN data_layer text,ADD COLUMN branch_id text,ADD COLUMN revision_id text;
    ALTER TABLE drawing_numbers ADD COLUMN part_root_id text,ADD COLUMN record_status text DEFAULT 'Draft',
      ADD COLUMN updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,ADD COLUMN purpose_code text DEFAULT 'M',
      ADD COLUMN purpose_description text DEFAULT 'Fixture drawing',ADD COLUMN is_primary_manufacturing integer DEFAULT 0;
    ALTER TABLE part_numbers ADD COLUMN part_root_id text,ADD COLUMN part_name text;
    ALTER TABLE drawing_part_links ADD COLUMN link_type text DEFAULT 'reference';
    ALTER TABLE file_assets ADD COLUMN hash_algorithm text DEFAULT 'SHA-256',ADD COLUMN created_at timestamptz DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE pdm_work_review_requests ADD COLUMN created_at timestamptz DEFAULT CURRENT_TIMESTAMP;
    CREATE TABLE drawing_rd_branches(id text PRIMARY KEY,company_id text,drawing_id text,base_production_revision_id text,
      latest_approved_revision_id text,status text DEFAULT 'open',row_version integer DEFAULT 1);
    CREATE TABLE drawing_revision_claims(id text PRIMARY KEY,company_id text,drawing_id text,branch_id text,target_major integer,
      target_minor integer,target_label text,predecessor_revision_id text,claim_state text DEFAULT 'work');
    CREATE TABLE pdm_workbench_aggregates(id text PRIMARY KEY,company_id text,entity_type text,canonical_entity_id text,
      open_branch_count integer,row_version integer DEFAULT 1,updated_at timestamptz DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE drawing_recognition_sessions(id text,company_id text,drawing_id text,drawing_revision_id text,source_context_type text,
      source_context_id text,source_lineage_key text,source_set_fingerprint text,session_purpose text,evidence_origin_session_id text,
      supersedes_session_id text,status text,created_at timestamptz);
  `);
  await client.execute(`
    INSERT INTO users(id,company_id) VALUES('reviewer','company') ON CONFLICT DO NOTHING;
    INSERT INTO part_roots(id,company_id,root_code) VALUES('${prefix}-root','company','SUBMIT');
    INSERT INTO drawing_numbers(id,company_id,drawing_number,part_root_id) VALUES('${prefix}-number','company','SUBMIT-M01','${prefix}-root');
    INSERT INTO drawings(id,company_id,part_root_id,formal_drawing_number_id,drawing_number)
      VALUES('${prefix}-drawing','company','${prefix}-root','${prefix}-number','SUBMIT-M01');
    INSERT INTO drawing_revisions(id,company_id,drawing_id,revision) VALUES('${prefix}-revision','company','${prefix}-drawing','0.1');
    INSERT INTO drawing_rd_branches(id,company_id,drawing_id) VALUES('${prefix}-branch','company','${prefix}-drawing');
    INSERT INTO drawing_revision_claims(id,company_id,drawing_id,branch_id,target_major,target_minor,target_label)
      VALUES('${prefix}-claim','company','${prefix}-drawing','${prefix}-branch',0,1,'0.1');
    INSERT INTO drawing_revision_works(id,company_id,drawing_id,revision_id,owner_user_id,handling,row_version,target_label,updated_at,
      branch_id,target_claim_id,proposed_payload) VALUES('${prefix}-work','company','${prefix}-drawing','${prefix}-revision','user','owner',1,'0.1',CURRENT_TIMESTAMP,
      '${prefix}-branch','${prefix}-claim','{}');
    INSERT INTO canonical_workbench_states(company_id,work_id,handling,row_version,updated_at,id,entity_type,canonical_entity_id,
      data_layer,branch_id,revision_id) VALUES('company','${prefix}-work','owner',1,CURRENT_TIMESTAMP,'${prefix}-state','drawing',
      '${prefix}-drawing','drawing_rd','${prefix}-branch','${prefix}-revision');
    INSERT INTO pdm_workbench_aggregates(id,company_id,entity_type,canonical_entity_id,open_branch_count)
      VALUES('${prefix}-aggregate','company','drawing','${prefix}-drawing',1);
  `);
}
