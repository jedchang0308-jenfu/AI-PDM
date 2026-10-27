# DEV-125 transition retention only. The application no longer consumes this
# credential, but the provider object and accessor stay under their existing
# state ownership until the bounded retirement readback and cleanup complete.
# A later exact-resource retirement removes both; this block must not gain a
# Secret version, new principal, or broader role.
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
