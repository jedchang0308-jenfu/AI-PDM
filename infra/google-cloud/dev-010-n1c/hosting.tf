resource "google_firebase_web_app" "pdm" {
  provider = google-beta
  count    = var.enable_hosting ? 1 : 0

  project         = var.project_id
  display_name    = "AI PDM shared staging"
  deletion_policy = "ABANDON"
}

resource "google_firebase_hosting_site" "pdm" {
  provider = google-beta
  count    = var.enable_hosting ? 1 : 0

  project         = var.project_id
  site_id         = local.hosting_site
  app_id          = google_firebase_web_app.pdm[0].app_id
  deletion_policy = "ABANDON"

  lifecycle {
    precondition {
      condition     = var.enable_runtime
      error_message = "Hosting authority cannot be created before the exact runtime source is enabled."
    }
  }
}
