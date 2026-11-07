terraform {
  required_version = ">= 1.14.0, < 1.17.0"
  backend "gcs" {
    bucket = "tfstate-jenfu-platform-prod"
    prefix = "dev-128/ai-pdm-masked-local-snapshot"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "7.45.0"
    }
  }
}

variable "attempt" {
  description = "Owner-reviewed source, image, schema, recipient, and UTC window for one snapshot."
  type = object({
    source_revision          = string
    image_digest             = string
    snapshot_id              = string
    recipient_public_key_b64 = string
    recipient_key_id         = string
    catalog_shape_sha256     = string
    starts_at                = string
    expires_at               = string
  })

  validation {
    condition = (
      can(regex("^[0-9a-f]{40}$", var.attempt.source_revision)) &&
      can(regex("^asia-east1-docker[.]pkg[.]dev/jenfu-platform-prod/aipdm-release/ai-pdm-masked-local-snapshot@sha256:[0-9a-f]{64}$", var.attempt.image_digest)) &&
      can(regex("^PDM-MASKED-[0-9]{8}-[0-9]{1,12}$", var.attempt.snapshot_id)) &&
      can(regex("^[A-Za-z0-9+/]+={0,2}$", var.attempt.recipient_public_key_b64)) &&
      length(var.attempt.recipient_public_key_b64) >= 600 &&
      length(var.attempt.recipient_public_key_b64) <= 4096 &&
      can(regex("^[0-9a-f]{64}$", var.attempt.recipient_key_id)) &&
      can(regex("^[0-9a-f]{64}$", var.attempt.catalog_shape_sha256)) &&
      can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.attempt.starts_at)) &&
      can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.attempt.expires_at)) &&
      try(timecmp(var.attempt.starts_at, var.attempt.expires_at) < 0, false) &&
      try(timecmp(var.attempt.expires_at, timeadd(var.attempt.starts_at, "2h")) <= 0, false)
    )
    error_message = "The attempt must use a pinned AI-PDM image, a single recipient, and a UTC window of at most two hours."
  }
}

locals {
  project        = "jenfu-platform-prod"
  project_number = "9536592944"
  region         = "asia-east1"
  pool_id        = "aipdm-dev128-snapshot"
  invoker_id     = "aipdm-dev128-invoker"
  job_name       = "ai-pdm-prod-masked-local-snapshot"
  runtime_email  = "aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com"
  sql_instance   = "jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg"
  bucket         = "jenfu-platform-prod-aipdm-release"
  object_name    = "source/migration-bundles/data-cutover/masked-local-snapshots/${var.attempt.snapshot_id}/snapshot.encrypted.json"
  subject        = "principal://iam.googleapis.com/projects/${local.project_number}/locations/global/workloadIdentityPools/${local.pool_id}/subject/${local.pool_id}"
  invoker_member = "serviceAccount:${local.invoker_id}@${local.project}.iam.gserviceaccount.com"
  workflow_ref   = "jedchang0308-jenfu/AI-PDM/.github/workflows/export-ai-pdm-masked-local-snapshot.yml@refs/heads/main"
  time_condition = "request.time >= timestamp('${var.attempt.starts_at}') && request.time < timestamp('${var.attempt.expires_at}')"
  object_condition = join(" && ", [
    local.time_condition,
    "resource.type == 'storage.googleapis.com/Object'",
    "resource.name == 'projects/_/buckets/${local.bucket}/objects/${local.object_name}'",
  ])
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
  region  = local.region
}

resource "google_service_account" "invoker" {
  project      = local.project
  account_id   = local.invoker_id
  display_name = "AI-PDM DEV-128 snapshot invoker"
}

resource "google_iam_workload_identity_pool" "snapshot" {
  project                   = local.project
  workload_identity_pool_id = local.pool_id
  display_name              = "AI-PDM DEV-128 snapshot"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = local.project
  workload_identity_pool_id          = google_iam_workload_identity_pool.snapshot.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping                  = { "google.subject" = "'${local.pool_id}'" }
  attribute_condition                = join(" && ", local.claim_checks)
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "workflow" {
  service_account_id = google_service_account.invoker.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.subject
  condition {
    title      = "dev128_snapshot_window"
    expression = local.time_condition
  }
  depends_on = [google_iam_workload_identity_pool_provider.github]
}

resource "google_cloud_run_v2_job" "snapshot" {
  project             = local.project
  location            = local.region
  name                = local.job_name
  deletion_protection = false
  labels              = { application = "ai-pdm", component = "masked-local-snapshot", dev = "dev-128" }

  template {
    parallelism = 1
    task_count  = 1
    template {
      service_account       = local.runtime_email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      timeout               = "1800s"
      max_retries           = 0

      containers {
        name    = "snapshot"
        image   = var.attempt.image_digest
        command = ["node"]
        args    = ["scripts/dev128-masked-local-snapshot-runner.mjs", "--snapshot-id", var.attempt.snapshot_id, "--recipient-public-key-b64", var.attempt.recipient_public_key_b64]
        dynamic "env" {
          for_each = {
            PDM_SOURCE_REVISION             = var.attempt.source_revision
            DEV128_CATALOG_SHAPE_SHA256     = var.attempt.catalog_shape_sha256
            DEV128_RECIPIENT_KEY_ID         = var.attempt.recipient_key_id
            DEV128_STARTS_AT                = var.attempt.starts_at
            DEV128_EXPIRES_AT               = var.attempt.expires_at
            DEV128_DATABASE                 = "jenfu_prod"
            DEV128_DATABASE_LOGIN           = "aipdm-prod-migrator@jenfu-platform-prod.iam"
            DEV128_INSTANCE_CONNECTION_NAME = local.sql_instance
            DEV128_DATABASE_HOST            = "/cloudsql/${local.sql_instance}"
            DEV128_PROJECT_ID               = local.project
          }
          content {
            name  = env.key
            value = env.value
          }
        }
        resources {
          limits = { cpu = "2", memory = "4Gi" }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [local.sql_instance]
        }
      }
      vpc_access {
        egress = "ALL_TRAFFIC"
        network_interfaces {
          network    = "jenfu-platform-prod-vpc"
          subnetwork = "jenfu-platform-prod-runtime"
        }
      }
    }
  }
}

resource "google_cloud_run_v2_job_iam_member" "workflow" {
  for_each = toset(["roles/run.invoker", "roles/run.viewer"])
  project  = local.project
  location = local.region
  name     = google_cloud_run_v2_job.snapshot.name
  role     = each.value
  member   = local.invoker_member
  condition {
    title      = "dev128_snapshot_window"
    expression = local.time_condition
  }
  depends_on = [google_service_account.invoker]
}

resource "google_storage_bucket_iam_member" "ciphertext_reader" {
  bucket = local.bucket
  role   = "roles/storage.objectViewer"
  member = local.invoker_member
  condition {
    title      = "dev128_snapshot_ciphertext"
    expression = local.object_condition
  }
  depends_on = [google_service_account.invoker]
}

resource "google_storage_bucket_iam_member" "ciphertext_creator" {
  bucket = local.bucket
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${local.runtime_email}"
  condition {
    title      = "dev128_snapshot_ciphertext"
    expression = local.object_condition
  }
}
