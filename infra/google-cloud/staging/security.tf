resource "google_kms_key_ring" "pdm" {
  count = local.create_resources ? 1 : 0

  project  = var.staging_project_id
  name     = "${local.name_prefix}-keys"
  location = var.region

  depends_on = [google_project_service.required]
}
resource "google_kms_crypto_key" "numbering_ledger" {
  count = local.create_resources ? 1 : 0

  name     = "numbering-ledger-signing"
  key_ring = google_kms_key_ring.pdm[0].id
  purpose  = "ASYMMETRIC_SIGN"

  version_template {
    algorithm        = "EC_SIGN_P256_SHA256"
    protection_level = "HSM"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "session_signing" {
  for_each = local.create_resources || local.secret_bootstrap_ready ? local.secret_names : toset([])

  project             = var.staging_project_id
  secret_id           = each.value
  labels              = var.labels
  deletion_protection = true

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "runtime_session_signing" {
  for_each = local.create_resources ? local.secret_names : toset([])

  project   = var.staging_project_id
  secret_id = google_secret_manager_secret.session_signing[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[0].email}"
}
