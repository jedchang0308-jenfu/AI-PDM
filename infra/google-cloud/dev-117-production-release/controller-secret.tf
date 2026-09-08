data "google_secret_manager_secret" "controller_github_token" {
  project   = var.project_id
  secret_id = local.controller_github_token_secret
}

resource "google_secret_manager_secret_iam_member" "controller_github_token_accessor" {
  project   = var.project_id
  secret_id = data.google_secret_manager_secret.controller_github_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.controller.email}"
}
