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


resource "google_cloud_run_v2_service_iam_member" "application_smoke" {
  project  = var.project_id
  location = var.region
  name     = data.google_cloud_run_v2_service.application.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.smoke.email}"
}
