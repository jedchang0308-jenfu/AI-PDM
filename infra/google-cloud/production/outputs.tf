output "production_review_target" {
  value = {
    project_id               = var.production_project_id
    region                   = var.region
    cloud_run_service        = local.name_prefix
    cloud_sql_instance       = local.cloud_sql_instance_name
    migration_runner_job     = local.migration_runner_job_ready ? "${local.name_prefix}-migration-runner" : null
    migration_live_mode      = var.migration_live_execution
    principal_bootstrap_mode = var.principal_bootstrap_execution
    reconciliation_mode      = var.reconciliation_execution ? var.reconciliation_mode : null
    reconciliation_target    = var.reconciliation_execution ? local.reconciliation_connection_name : null
    public_base_url          = var.runtime_public_base_url
    create_resources         = local.create_resources
    production_action        = false
    firebase_hosting_used    = false
    phase3a_gcs_authority    = false
  }
}

output "production_gate_summary" {
  value = {
    target_readback      = var.production_target_readback_approved
    env_source           = var.production_env_source_approved
    secret_metadata      = var.production_secret_metadata_readback_approved
    clean_seed_allowlist = var.clean_seed_allowlist_approved
    hd84_restore         = var.hd84_restore_reconciliation_approved
    rollback_readiness   = var.rollback_readiness_approved
    level3_smoke_plan    = var.level3_smoke_plan_approved
    post_apply_ready     = local.post_apply_release_gates_ready
    cost_gate_ready      = local.cost_gate_ready
  }
}
