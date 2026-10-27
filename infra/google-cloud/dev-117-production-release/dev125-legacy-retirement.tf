# DEV-125 keeps the three legacy provider objects in state only while the
# replacement runtime is being proven. The dedicated retirement executor is
# the only caller allowed to select UNPROTECT or ABSENT. Ordinary app-infra
# plans use RETAIN and therefore cannot accidentally mix retirement into an
# image rotation.
variable "dev125_legacy_workload_auth_mode" {
  type    = string
  default = "RETAIN"
  validation {
    condition     = contains(["RETAIN", "UNPROTECT", "ABSENT"], var.dev125_legacy_workload_auth_mode)
    error_message = "DEV-125 legacy workload auth mode is invalid."
  }
}

locals {
  dev125_legacy_secret_present = var.incident_runtime_enabled && var.dev125_legacy_workload_auth_mode != "ABSENT"
  dev125_legacy_access_present = var.incident_runtime_enabled && var.dev125_legacy_workload_auth_mode == "RETAIN"
}

resource "google_secret_manager_secret" "workload_auth_credentials" {
  count               = local.dev125_legacy_secret_present ? 1 : 0
  project             = var.project_id
  secret_id           = "aipdm-prod-workload-auth-credentials"
  deletion_protection = var.dev125_legacy_workload_auth_mode == "RETAIN"
  labels              = local.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_workload_credentials_accessor" {
  count     = local.dev125_legacy_access_present ? 1 : 0
  project   = var.project_id
  secret_id = google_secret_manager_secret.workload_auth_credentials[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "migrator_openswx_dispatch_recovery_viewer" {
  count  = local.dev125_legacy_access_present ? 1 : 0
  bucket = google_storage_bucket.release.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${data.google_service_account.migrator.email}"
  condition {
    title      = "aipdm-migrator-openswx-dispatch-recovery-viewer"
    expression = "resource.name.startsWith('projects/_/buckets/${var.release_bucket_name}/objects/source/openswx-dispatch-recovery/')"
  }
}
