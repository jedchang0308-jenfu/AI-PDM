resource "google_cloud_run_v2_service_iam_member" "application_deployer" {
  project  = var.project_id
  location = var.region
  name     = data.google_cloud_run_v2_service.application.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_cloud_run_v2_service_iam_member" "application_controller" {
  count    = var.incident_runtime_enabled ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = data.google_cloud_run_v2_service.application.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.controller.email}"
}

resource "google_cloud_run_v2_service_iam_member" "application_verifier" {
  project  = var.project_id
  location = var.region
  name     = data.google_cloud_run_v2_service.application.name
  role     = "roles/run.viewer"
  member   = "serviceAccount:${google_service_account.verifier.email}"
}

// DEV-121 migration 073 must reread this exact service immediately before SQL.
// The migrator gets observation only; service mutation remains owner-deployer.
resource "google_cloud_run_v2_service_iam_member" "application_migrator_readback" {
  count    = var.incident_runtime_enabled ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = data.google_cloud_run_v2_service.application.name
  role     = "roles/run.viewer"
  member   = "serviceAccount:${data.google_service_account.migrator.email}"
}


resource "google_cloud_run_v2_service_iam_member" "application_smoke" {
  project  = var.project_id
  location = var.region
  name     = data.google_cloud_run_v2_service.application.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.smoke.email}"
}
