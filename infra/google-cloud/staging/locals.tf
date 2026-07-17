locals {
  apply_acknowledgement                = "DEV-046-PHASE-2B-APPROVED"
  migration_runner_job_acknowledgement = "DEV-046-STAGING-MIGRATION-RUNNER-JOB-REVIEWED"
  change_ticket_valid                  = can(regex("^CHG-[A-Z0-9-]{4,}$", var.phase2_change_ticket))
  target_values_valid = (
    var.staging_project_id != "jenfu-erp-stg" &&
    var.staging_project_number != "000000000000" &&
    var.billing_account_id != "000000-000000-000000" &&
    length(var.budget_notification_channel_ids) > 0 &&
    length(var.alert_notification_channel_ids) > 0 &&
    !startswith(var.firebase_web_api_key, "ASSIGN_") &&
    !startswith(var.firebase_auth_domain, "ASSIGN_") &&
    !startswith(var.firebase_web_app_id, "ASSIGN_") &&
    var.session_secret_versions_ready
  )
  secret_bootstrap_ready = (
    var.enable_secret_container_bootstrap &&
    var.phase2_apply_acknowledgement == local.apply_acknowledgement &&
    local.change_ticket_valid &&
    var.staging_project_id != "jenfu-erp-stg" &&
    var.billing_account_id != "000000-000000-000000"
  )
  create_resources = (
    var.enable_resource_creation &&
    var.phase2_apply_acknowledgement == local.apply_acknowledgement &&
    local.change_ticket_valid &&
    local.target_values_valid
  )
  migration_runner_image_ready = (
    startswith(var.migration_runner_image, "asia-east1-docker.pkg.dev/${var.staging_project_id}/ai-pdm/ai-pdm-migration@sha256:") &&
    can(regex("@sha256:[a-f0-9]{64}$", var.migration_runner_image)) &&
    !can(regex("@sha256:0{64}$", var.migration_runner_image))
  )
  migration_runner_job_ready = (
    var.enable_migration_runner_job &&
    var.migration_runner_job_acknowledgement == local.migration_runner_job_acknowledgement &&
    local.migration_runner_image_ready
  )

  name_prefix = "ai-pdm-stg"
  database    = "ai_pdm"

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
}

check "phase2_resource_creation_guard" {
  assert {
    condition     = !var.enable_resource_creation || local.create_resources
    error_message = "Resource creation requires approved real targets, notification channels, CHG ticket, and the exact Phase 2B acknowledgement."
  }
}

check "phase2_secret_bootstrap_guard" {
  assert {
    condition     = !var.enable_secret_container_bootstrap || local.secret_bootstrap_ready
    error_message = "Secret container bootstrap requires approved real targets, CHG ticket, and the exact Phase 2B acknowledgement."
  }
}

check "migration_runner_job_guard" {
  assert {
    condition     = !var.enable_migration_runner_job || (local.create_resources && local.migration_runner_job_ready)
    error_message = "Cloud Run migration runner Job requires Phase 2B resource creation approval, a reviewed digest-pinned staging migration image, and the exact runner job acknowledgement."
  }
}

check "session_key_rotation_contract" {
  assert {
    condition     = var.session_current_key_id != var.session_previous_key_id
    error_message = "Current and previous session key IDs must differ."
  }
}

check "staging_environment_isolation" {
  assert {
    condition     = var.staging_project_id != var.production_project_id && can(regex("stg|staging", var.staging_project_id))
    error_message = "The target must be an explicitly named staging project separate from production."
  }
}

check "firebase_hosting_gateway_origin_guard" {
  assert {
    condition = !var.enable_firebase_hosting_gateway || (
      var.runtime_public_base_url == "https://${var.staging_project_id}.web.app" &&
      var.session_issuer == var.runtime_public_base_url
    )
    error_message = "Firebase Hosting gateway requires the project's web.app origin as both runtime_public_base_url and session_issuer."
  }
}
