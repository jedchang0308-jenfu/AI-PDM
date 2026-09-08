data "google_project" "current" {
  project_id = var.project_id
}

data "google_storage_project_service_account" "gcs" {
  project = var.project_id
}

data "google_cloud_run_v2_service" "application" {
  project  = var.project_id
  location = var.region
  name     = var.application_service_name
}

data "google_service_account" "runtime" {
  project    = var.project_id
  account_id = var.runtime_service_account_id
}

resource "google_artifact_registry_repository" "release" {
  project       = var.project_id
  location      = var.region
  repository_id = var.release_repository_id
  format        = "DOCKER"
  description   = "AI-PDM immutable production release images"
  labels        = local.labels
}

resource "google_artifact_registry_repository_iam_member" "builder_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.release.location
  repository = google_artifact_registry_repository.release.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_artifact_registry_repository_iam_member" "deployer_reader" {
  project    = var.project_id
  location   = google_artifact_registry_repository.release.location
  repository = google_artifact_registry_repository.release.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}
