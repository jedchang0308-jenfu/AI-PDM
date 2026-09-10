resource "google_service_account" "builder" {
  project      = var.project_id
  account_id   = "aipdm-prod-builder"
  display_name = "AI-PDM production builder"
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "aipdm-prod-deployer"
  display_name = "AI-PDM production deployer"
}

resource "google_service_account" "verifier" {
  project      = var.project_id
  account_id   = "aipdm-prod-verifier"
  display_name = "AI-PDM production verifier"
}

resource "google_service_account" "controller" {
  project      = var.project_id
  account_id   = "aipdm-prod-controller"
  display_name = "AI-PDM release abort controller"
}

resource "google_service_account" "invoker" {
  project      = var.project_id
  account_id   = "aipdm-prod-release-invoker"
  display_name = "AI-PDM release controller invoker"
}


resource "google_service_account" "smoke" {
  project      = var.project_id
  account_id   = "aipdm-prod-smoke"
  display_name = "AI-PDM production candidate smoke"
}

resource "google_project_iam_member" "builder_build_submit" {
  project = var.project_id
  role    = "roles/cloudbuild.builds.editor"
  member  = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_project_iam_member" "builder_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_project_iam_member" "builder_artifact_analysis" {
  project = var.project_id
  role    = "roles/containeranalysis.occurrences.editor"
  member  = "serviceAccount:${google_service_account.builder.email}"
}

# Artifact Analysis exportSBOM enumerates the project's default SBOM bucket.
# This role exposes bucket metadata only; object writes remain prefix-scoped below.
resource "google_project_iam_member" "builder_sbom_bucket_viewer" {
  project = var.project_id
  role    = "roles/storage.bucketViewer"
  member  = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_project_iam_member" "builder_sbom_note_attacher" {
  project = var.project_id
  role    = "roles/containeranalysis.notes.attacher"
  member  = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_service_account_iam_member" "builder_act_as_self" {
  service_account_id = google_service_account.builder.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_service_account_iam_member" "deployer_act_as_runtime" {
  service_account_id = data.google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}
