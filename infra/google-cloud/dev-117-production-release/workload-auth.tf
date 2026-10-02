# Technical executor credentials are distinct from human session keys.
# Secret values/versions are added outside Terraform; no credential material enters state.
resource "google_secret_manager_secret" "workload_auth_credentials" {
  count               = var.incident_runtime_enabled ? 1 : 0
  project             = var.project_id
  secret_id           = "aipdm-prod-workload-auth-credentials"
  deletion_protection = true
  labels              = local.labels

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_workload_credentials_accessor" {
  count     = var.incident_runtime_enabled ? 1 : 0
  project   = var.project_id
  secret_id = google_secret_manager_secret.workload_auth_credentials[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_service_account.runtime.email}"
}
