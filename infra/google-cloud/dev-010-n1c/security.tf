resource "google_secret_manager_secret" "session" {
  for_each = var.enable_security_resources ? local.session_secrets : toset([])

  project             = var.project_id
  secret_id           = each.value
  labels              = local.labels
  deletion_protection = true

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_session" {
  for_each = var.enable_security_resources ? local.session_secrets : toset([])

  project   = var.project_id
  secret_id = google_secret_manager_secret.session[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.runtime_service_account_email}"
}

resource "google_secret_manager_secret" "workbench_contract" {
  count = var.enable_security_resources ? 1 : 0

  project             = var.project_id
  secret_id           = local.workbench_contract_secret
  labels              = local.labels
  deletion_protection = true

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_workbench_contract" {
  count = var.enable_security_resources ? 1 : 0

  project   = var.project_id
  secret_id = google_secret_manager_secret.workbench_contract[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.runtime_service_account_email}"
}
