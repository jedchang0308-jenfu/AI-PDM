terraform {
  required_version = ">= 1.14.0, < 1.17.0"
  backend "gcs" {
    bucket = "tfstate-jenfu-platform-prod"
    prefix = "dev-128/ai-pdm-masked-local-snapshot-builder"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "7.45.0"
    }
  }
}

variable "attempt" {
  description = "Owner-reviewed source and UTC window for one DEV-128 runner build."
  type = object({
    source_revision = string
    starts_at       = string
    expires_at      = string
  })

  validation {
    condition = (
      can(regex("^[0-9a-f]{40}$", var.attempt.source_revision)) &&
      can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.attempt.starts_at)) &&
      can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.attempt.expires_at)) &&
      try(timecmp(var.attempt.starts_at, var.attempt.expires_at) < 0, false) &&
      try(timecmp(var.attempt.expires_at, timeadd(var.attempt.starts_at, "2h")) <= 0, false)
    )
    error_message = "The builder attempt must use one merged source revision and a UTC window of at most two hours."
  }
}

locals {
  project        = "jenfu-platform-prod"
  project_number = "9536592944"
  pool_id        = "aipdm-dev128-builder-v7"
  builder_email  = "aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com"
  workflow_ref   = "jedchang0308-jenfu/AI-PDM/.github/workflows/build-ai-pdm-masked-local-snapshot.yml@refs/heads/main"
  subject        = "principal://iam.googleapis.com/projects/${local.project_number}/locations/global/workloadIdentityPools/${local.pool_id}/subject/${local.pool_id}"
  time_condition = "request.time >= timestamp('${var.attempt.starts_at}') && request.time < timestamp('${var.attempt.expires_at}')"
  claim_checks = [
    "assertion.repository_id == '1260972060'",
    "assertion.repository_owner_id == '257207597'",
    "assertion.workflow_ref == '${local.workflow_ref}'",
    "assertion.workflow_sha == '${var.attempt.source_revision}'",
    "assertion.ref == 'refs/heads/main'",
    "assertion.environment == 'production'",
    "assertion.event_name == 'workflow_dispatch'",
    "assertion.run_attempt == '1'",
  ]
}

provider "google" {
  project = local.project
}

resource "google_iam_workload_identity_pool" "builder" {
  project                   = local.project
  workload_identity_pool_id = local.pool_id
  display_name              = "AI-PDM DEV-128 builder"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = local.project
  workload_identity_pool_id          = google_iam_workload_identity_pool.builder.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping                  = { "google.subject" = "'${local.pool_id}'" }
  attribute_condition                = join(" && ", local.claim_checks)
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "workflow" {
  service_account_id = "projects/${local.project}/serviceAccounts/${local.builder_email}"
  role               = "roles/iam.workloadIdentityUser"
  member             = local.subject
  condition {
    title      = "dev128_builder_window"
    expression = local.time_condition
  }
  depends_on = [google_iam_workload_identity_pool_provider.github]
}
