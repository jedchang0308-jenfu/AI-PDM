# Exact metadata-only Secret version readback; no payload access.
resource "google_project_iam_custom_role" "release_secret_version_readback" {
  project     = "jenfu-platform-prod"
  role_id     = "aipdmOpenswxSecretVersionReadback"
  title       = "AI-PDM OpenSWX Secret version metadata readback"
  permissions = ["secretmanager.versions.get"]
  lifecycle { prevent_destroy = true }
}
resource "google_secret_manager_secret_iam_member" "verifier_reader_token_version_readback" {
  project   = "jenfu-platform-prod"
  secret_id = "aipdm-prod-openswx-reader-token"
  depends_on = [google_project_iam_custom_role.release_secret_version_readback]
  role      = "projects/jenfu-platform-prod/roles/aipdmOpenswxSecretVersionReadback"
  member    = "serviceAccount:aipdm-prod-verifier@jenfu-platform-prod.iam.gserviceaccount.com"
  lifecycle { prevent_destroy = true }
}
resource "google_secret_manager_secret_iam_member" "deployer_reader_token_version_readback" {
  project   = "jenfu-platform-prod"
  secret_id = "aipdm-prod-openswx-reader-token"
  depends_on = [google_project_iam_custom_role.release_secret_version_readback]
  role      = "projects/jenfu-platform-prod/roles/aipdmOpenswxSecretVersionReadback"
  member    = "serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com"
  lifecycle { prevent_destroy = true }
}
resource "google_secret_manager_secret_iam_member" "verifier_workload_credentials_version_readback" {
  project   = "jenfu-platform-prod"
  secret_id = "aipdm-prod-workload-auth-credentials"
  depends_on = [google_project_iam_custom_role.release_secret_version_readback]
  role      = "projects/jenfu-platform-prod/roles/aipdmOpenswxSecretVersionReadback"
  member    = "serviceAccount:aipdm-prod-verifier@jenfu-platform-prod.iam.gserviceaccount.com"
  lifecycle { prevent_destroy = true }
}
resource "google_secret_manager_secret_iam_member" "deployer_workload_credentials_version_readback" {
  project   = "jenfu-platform-prod"
  secret_id = "aipdm-prod-workload-auth-credentials"
  depends_on = [google_project_iam_custom_role.release_secret_version_readback]
  role      = "projects/jenfu-platform-prod/roles/aipdmOpenswxSecretVersionReadback"
  member    = "serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com"
  lifecycle { prevent_destroy = true }
}
