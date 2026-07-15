locals {
  production_apply_acknowledgement = "DEV-032-PRODUCTION-RESOURCE-CREATION-APPROVED"
  name_prefix                      = "ai-pdm-prod"
  database                         = "ai_pdm"
  cloud_sql_instance_name          = "ai-pdm-prod-postgres"

  required_services = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudkms.googleapis.com",
    "compute.googleapis.com",
    "firebase.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com"
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

  real_target_values_ready = (
    var.production_project_id == "jenfu-ai-pdm-prod" &&
    var.region == "asia-east1" &&
    var.production_domain == "pdm.jenfu.com.tw" &&
    var.runtime_public_base_url == "https://pdm.jenfu.com.tw" &&
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
    var.estimated_monthly_cost_usd <= var.plan_review_stop_usd
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
    condition     = var.monthly_budget_usd == 300 && var.plan_review_stop_usd == 240 && var.estimated_monthly_cost_usd <= var.plan_review_stop_usd
    error_message = "Stop before apply if the credentialled plan estimate exceeds USD 240 or the monthly cap differs from USD 300."
  }
}

check "production_session_key_rotation_contract" {
  assert {
    condition     = var.session_current_key_id != var.session_previous_key_id
    error_message = "Current and previous session key IDs must differ."
  }
}

check "production_firebase_hosting_forbidden" {
  assert {
    condition     = !can(regex("web\\.app|firebaseapp\\.com|stg|staging", var.runtime_public_base_url))
    error_message = "Production must not use Firebase Hosting default domains or staging origins."
  }
}
