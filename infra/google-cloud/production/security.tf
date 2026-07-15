resource "google_secret_manager_secret" "session_signing" {
  for_each = local.create_resources ? local.secret_names : toset([])

  project   = var.production_project_id
  secret_id = each.key
  labels    = var.labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_session_signing" {
  for_each = local.create_resources ? local.secret_names : toset([])

  project   = var.production_project_id
  secret_id = google_secret_manager_secret.session_signing[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[0].email}"
}
