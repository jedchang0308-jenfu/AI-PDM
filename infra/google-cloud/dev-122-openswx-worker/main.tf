# Local source only. Resource mutation requires the separately approved own plan.
variable "worker_image" {
  type = string
  validation {
    condition     = can(regex("^asia-east1-docker\\.pkg\\.dev/jenfu-platform-prod/aipdm-release/ai-pdm-openswx-worker@sha256:[a-f0-9]{64}$", var.worker_image))
    error_message = "An immutable AI-PDM worker image is required."
  }
}
resource "google_service_account" "reader" {
  project      = "jenfu-platform-prod"
  account_id   = "aipdm-prod-openswx-reader"
  display_name = "AI-PDM OpenSWX finite metadata reader"
}
resource "google_service_account" "dispatch" {
  project      = "jenfu-platform-prod"
  account_id   = "aipdm-prod-openswx-dispatch"
  display_name = "AI-PDM OpenSWX Scheduler identity"
}
resource "google_secret_manager_secret" "reader_token" {
  project   = "jenfu-platform-prod"
  secret_id = "aipdm-prod-openswx-reader-token"
  replication {
    user_managed {
      replicas { location = "asia-east1" }
    }
  }
  lifecycle { prevent_destroy = true }
}
resource "google_secret_manager_secret_iam_member" "reader_token_access" {
  project   = "jenfu-platform-prod"
  secret_id = google_secret_manager_secret.reader_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.reader.email}"
}
resource "google_project_iam_custom_role" "app_readback" {
  project     = "jenfu-platform-prod"
  role_id     = "aipdmOpenswxJobReadback"
  title       = "AI-PDM exact OpenSWX Job readback"
  permissions = ["run.jobs.get", "run.executions.get", "run.executions.list"]
}
resource "google_project_iam_custom_role" "worker_lifecycle" {
  project     = "jenfu-platform-prod"
  role_id     = "aipdmOpenswxJobLifecycle"
  title       = "AI-PDM exact OpenSWX Job lifecycle"
  permissions = ["run.jobs.get", "run.jobs.update", "run.jobs.run", "run.executions.get", "run.executions.list", "run.executions.cancel"]
}
resource "google_cloud_run_v2_job" "reader" {
  project             = "jenfu-platform-prod"
  location            = "asia-east1"
  name                = "ai-pdm-prod-openswx-metadata"
  deletion_protection = true
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.reader.email
      timeout         = "300s"
      max_retries     = 0
      containers {
        image   = var.worker_image
        command = ["/usr/local/bin/node", "/worker/scripts/run-openswx-metadata-job.mjs"]
        args    = ["--isolation-self-test-only"]
        resources { limits = { cpu = "1", memory = "1Gi" } }
      }
    }
  }
  # After bootstrap the protected owner performs exact etag-fenced Job updates.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [template]
  }
}
resource "google_cloud_run_v2_job_iam_member" "app_run" {
  project  = "jenfu-platform-prod"
  location = "asia-east1"
  name     = google_cloud_run_v2_job.reader.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com"
}
resource "google_cloud_run_v2_job_iam_member" "app_readback" {
  project  = "jenfu-platform-prod"
  location = "asia-east1"
  name     = google_cloud_run_v2_job.reader.name
  role     = google_project_iam_custom_role.app_readback.name
  member   = "serviceAccount:aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com"
}
resource "google_cloud_run_v2_job_iam_member" "deployer_lifecycle" {
  project  = "jenfu-platform-prod"
  location = "asia-east1"
  name     = google_cloud_run_v2_job.reader.name
  role     = google_project_iam_custom_role.worker_lifecycle.name
  member   = "serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com"
}
resource "google_service_account_iam_member" "deployer_reader_act_as" {
  service_account_id = google_service_account.reader.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com"
}
resource "google_cloud_scheduler_job" "dispatch" {
  project          = "jenfu-platform-prod"
  region           = "asia-east1"
  name             = "aipdm-prod-openswx-dispatch"
  schedule         = "*/5 * * * *"
  time_zone        = "Etc/UTC"
  paused           = true
  attempt_deadline = "30s"
  retry_config { retry_count = 0 }
  http_target {
    uri         = "https://ai-pdm-prod-9536592944.asia-east1.run.app/api/openswx-metadata-dispatch/recover"
    http_method = "POST"
    body        = base64encode("{}")
    headers     = { "Content-Type" = "application/json", "User-Agent" = "Google-Cloud-Scheduler" }
    oidc_token {
      service_account_email = google_service_account.dispatch.email
      audience              = "https://ai-pdm-prod-9536592944.asia-east1.run.app"
    }
  }
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [paused]
  }
}
