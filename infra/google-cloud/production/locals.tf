locals {
  production_apply_acknowledgement    = "DEV-032-PRODUCTION-RESOURCE-CREATION-APPROVED"
  migration_job_acknowledgement       = "DEV-032-PRODUCTION-MIGRATION-JOB-REVIEWED"
  migration_live_acknowledgement      = "DEV-032-PRODUCTION-CLOUDSQL-MIGRATION-APPROVED"
  principal_bootstrap_acknowledgement = "DEV-032-PRODUCTION-PRINCIPAL-BOOTSTRAP-APPROVED"
  reconciliation_acknowledgement      = "DEV-032-PRODUCTION-RECONCILIATION-READONLY-APPROVED"
  firebase_hosting_acknowledgement    = "DEV-032-PRODUCTION-FIREBASE-HOSTING-PILOT-APPROVED"
  github_deployment_acknowledgement   = "DEV-032-PRODUCTION-GITHUB-WIF-DEPLOYMENT-APPROVED"
  name_prefix                         = "ai-pdm-prod"
  database                            = "ai_pdm"
  cloud_sql_instance_name             = "ai-pdm-prod-postgres"
  source_connection_name              = "${var.production_project_id}:${var.region}:${local.cloud_sql_instance_name}"
  firebase_hosting_origin             = "https://${var.production_project_id}.web.app"

  required_services = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudkms.googleapis.com",
    "compute.googleapis.com",
    "firebase.googleapis.com",
    "firebasehosting.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com"
  ])

  runtime_roles = toset([
    "roles/cloudsql.client",
    "roles/cloudsql.instanceUser",
    "roles/firebaseauth.admin",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter"
  ])

  migration_roles = toset([
    "roles/cloudsql.client",
    "roles/cloudsql.instanceUser"
  ])

  secret_names = toset([
    "pdm-session-signing-current",
    "pdm-session-signing-previous"
  ])

  firebase_hosting_gateway_ready = (
    var.enable_firebase_hosting_gateway &&
    var.firebase_hosting_gateway_acknowledgement == local.firebase_hosting_acknowledgement &&
    var.runtime_public_base_url == local.firebase_hosting_origin &&
    var.session_issuer == local.firebase_hosting_origin &&
    var.firebase_auth_domain == "${var.production_project_id}.web.app"
  )

  custom_domain_gateway_ready = (
    !var.enable_firebase_hosting_gateway &&
    var.runtime_public_base_url == "https://pdm.jenfu.com.tw" &&
    var.session_issuer == "https://pdm.jenfu.com.tw" &&
    var.firebase_auth_domain == "${var.production_project_id}.firebaseapp.com"
  )

  production_entrypoint_ready = local.firebase_hosting_gateway_ready || local.custom_domain_gateway_ready

  real_target_values_ready = (
    var.production_project_id == "jenfu-ai-pdm-prod" &&
    var.region == "asia-east1" &&
    var.production_domain == "pdm.jenfu.com.tw" &&
    local.production_entrypoint_ready &&
    var.billing_account_id != "000000-000000-000000" &&
    !startswith(var.firebase_web_api_key, "ASSIGN_") &&
    !startswith(var.firebase_web_app_id, "ASSIGN_") &&
    length(var.budget_notification_channel_ids) > 0 &&
    length(var.alert_notification_channel_ids) > 0
  )

  pre_apply_gates_ready = (
    var.production_target_readback_approved &&
    var.production_env_source_approved &&
    var.production_secret_metadata_readback_approved
  )

  post_apply_release_gates_ready = (
    var.clean_seed_allowlist_approved &&
    var.hd84_restore_reconciliation_approved &&
    var.rollback_readiness_approved &&
    var.level3_smoke_plan_approved
  )

  cost_gate_ready = (
    var.monthly_budget_usd == 300 &&
    var.plan_review_stop_usd == 240 &&
    var.billing_budget_currency_code == "TWD" &&
    var.billing_budget_units == 9600 &&
    var.estimated_monthly_cost_usd <= var.plan_review_stop_usd
  )

  migration_runner_image_ready = (
    startswith(var.migration_runner_image, "asia-east1-docker.pkg.dev/${var.production_project_id}/ai-pdm/ai-pdm-migration@sha256:") &&
    can(regex("@sha256:[a-f0-9]{64}$", var.migration_runner_image)) &&
    !can(regex("@sha256:0{64}$", var.migration_runner_image))
  )

  migration_runner_job_ready = (
    var.enable_migration_runner_job &&
    var.migration_runner_job_acknowledgement == local.migration_job_acknowledgement &&
    local.migration_runner_image_ready
  )

  migration_live_execution_ready = (
    !var.migration_live_execution || (
      local.migration_runner_job_ready &&
      var.migration_live_execution_acknowledgement == local.migration_live_acknowledgement &&
      var.admin_bootstrap_readback_approved &&
      !var.principal_bootstrap_execution &&
      !var.reconciliation_execution
    )
  )

  principal_bootstrap_execution_ready = (
    !var.principal_bootstrap_execution || (
      local.migration_runner_job_ready &&
      !var.migration_live_execution &&
      !var.reconciliation_execution &&
      var.schema_migration_readback_approved &&
      var.principal_bootstrap_execution_acknowledgement == local.principal_bootstrap_acknowledgement &&
      can(regex("^[A-Za-z0-9_-]{6,128}$", var.production_principal_firebase_uid)) &&
      var.migration_runner_source_revision != "0000000000000000000000000000000000000000"
    )
  )

  reconciliation_connection_name = var.reconciliation_mode == "restore" ? var.reconciliation_restore_connection_name : local.source_connection_name

  reconciliation_execution_ready = (
    !var.reconciliation_execution || (
      local.migration_runner_job_ready &&
      !var.migration_live_execution &&
      !var.principal_bootstrap_execution &&
      var.schema_migration_readback_approved &&
      var.principal_bootstrap_readback_approved &&
      var.reconciliation_execution_acknowledgement == local.reconciliation_acknowledgement &&
      var.migration_runner_source_revision != "0000000000000000000000000000000000000000" &&
      (
        var.reconciliation_mode != "restore" || (
          var.restore_target_readback_approved &&
          can(regex("^${var.production_project_id}:${var.region}:ai-pdm-prod-restore-[a-z0-9-]{6,40}$", var.reconciliation_restore_connection_name))
        )
      )
    )
  )

  github_deployment_identity_ready = (
    var.enable_github_deployment_identity &&
    var.github_deployment_identity_acknowledgement == local.github_deployment_acknowledgement &&
    var.github_repository == "jedchang0308-jenfu/AI-PDM" &&
    var.github_repository_id == "1260972060" &&
    var.github_repository_owner_id == "257207597" &&
    var.github_production_workflow_ref == "jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-production.yml@refs/heads/main"
  )

  create_resources = (
    var.enable_resource_creation &&
    var.production_apply_acknowledgement == local.production_apply_acknowledgement &&
    local.real_target_values_ready &&
    local.pre_apply_gates_ready &&
    local.cost_gate_ready
  )
}

check "production_resource_creation_guard" {
  assert {
    condition     = !var.enable_resource_creation || local.create_resources
    error_message = "Production resource creation requires exact DEV-032 acknowledgement, real target values, Gate A readback and the cost gate."
  }
}

check "production_target_identity" {
  assert {
    condition     = var.production_project_id == "jenfu-ai-pdm-prod" && var.region == "asia-east1" && var.production_domain == "pdm.jenfu.com.tw"
    error_message = "Production target must match config/platform/production-target.template.json."
  }
}

check "production_cost_review_stop" {
  assert {
    condition     = var.monthly_budget_usd == 300 && var.plan_review_stop_usd == 240 && var.billing_budget_currency_code == "TWD" && var.billing_budget_units == 9600 && var.estimated_monthly_cost_usd <= var.plan_review_stop_usd
    error_message = "Stop before apply if the estimate exceeds USD 240, the cap differs from USD 300, or the Billing budget differs from TWD 9,600."
  }
}

check "production_session_key_rotation_contract" {
  assert {
    condition     = var.session_current_key_id != var.session_previous_key_id
    error_message = "Current and previous session key IDs must differ."
  }
}

check "production_migration_runner_job_guard" {
  assert {
    condition     = !var.enable_migration_runner_job || (local.create_resources && local.migration_runner_job_ready)
    error_message = "The production migration Job requires Gate A resource approval, a digest-pinned production image and the exact Job acknowledgement."
  }
}

check "production_migration_live_execution_guard" {
  assert {
    condition     = local.migration_live_execution_ready
    error_message = "Live production migration requires the exact migration acknowledgement and completed clean-seed/admin-bootstrap gate."
  }
}

check "production_principal_bootstrap_execution_guard" {
  assert {
    condition     = local.principal_bootstrap_execution_ready
    error_message = "Production principal bootstrap requires completed schema migration readback, a verified Firebase UID, exact source revision and the exact bootstrap acknowledgement."
  }
}

check "production_reconciliation_execution_guard" {
  assert {
    condition     = local.reconciliation_execution_ready
    error_message = "Production reconciliation requires schema/principal readback, exact source revision and acknowledgement; restore mode also requires an independently read-back restore target."
  }
}

check "production_entrypoint_guard" {
  assert {
    condition     = local.production_entrypoint_ready && !can(regex("stg|staging", var.runtime_public_base_url))
    error_message = "Production entrypoint must use either the custom-domain baseline or the explicitly acknowledged production web.app pilot origin; staging origins are forbidden."
  }
}
