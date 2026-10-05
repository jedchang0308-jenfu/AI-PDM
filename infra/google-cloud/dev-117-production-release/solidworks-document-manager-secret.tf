# DEV-122 owns this container and its exact runtime binding only. The human
# settings lifecycle adds numeric versions; values never enter Terraform state.
resource "google_secret_manager_secret" "solidworks_document_manager" {
  count               = var.incident_runtime_enabled ? 1 : 0
  project             = var.project_id
  secret_id           = "aipdm-prod-solidworks-document-manager-key"
  deletion_protection = true
  labels              = local.labels

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project_iam_custom_role" "solidworks_document_manager_runtime" {
  count       = var.incident_runtime_enabled ? 1 : 0
  project     = var.project_id
  role_id     = "aipdmSolidworksDocumentManagerRuntime"
  title       = "AI-PDM SolidWorks Document Manager runtime"
  description = "Add and access versions of the own Document Manager Secret only"
  permissions = ["secretmanager.versions.add", "secretmanager.versions.access"]
}

resource "google_secret_manager_secret_iam_member" "solidworks_document_manager_runtime" {
  count     = var.incident_runtime_enabled ? 1 : 0
  project   = var.project_id
  secret_id = google_secret_manager_secret.solidworks_document_manager[0].secret_id
  role      = google_project_iam_custom_role.solidworks_document_manager_runtime[0].name
  member    = "serviceAccount:${data.google_service_account.runtime.email}"
}
