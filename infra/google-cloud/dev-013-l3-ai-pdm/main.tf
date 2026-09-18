data "google_project" "target" {
  project_id = var.project_id
}

data "google_service_account" "iac" {
  project    = var.project_id
  account_id = local.iac_account
}

data "google_service_account" "qc" {
  project    = var.project_id
  account_id = local.qc_account
}

resource "google_artifact_registry_repository" "ai_pdm" {
  project       = var.project_id
  location      = var.region
  repository_id = local.artifact_repository
  format        = "DOCKER"
  description   = "DEV-013 AI-PDM managed staging immutable runtime images"
  labels        = local.labels

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_artifact_registry_repository_iam_member" "iac_writer" {
  project    = var.project_id
  location   = var.region
  repository = local.artifact_repository
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${local.iac_email}"

  depends_on = [google_artifact_registry_repository.ai_pdm]
}

resource "google_storage_bucket" "evidence" {
  project                     = var.project_id
  name                        = local.evidence_bucket
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels

  retention_policy {
    retention_period = 2592000
    is_locked        = false
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket_iam_member" "iac_writer" {
  bucket = local.evidence_bucket
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${local.iac_email}"

  depends_on = [google_storage_bucket.evidence]
}

resource "google_storage_bucket_iam_member" "qc_reader" {
  bucket = local.evidence_bucket
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${local.qc_email}"

  depends_on = [google_storage_bucket.evidence]
}
