resource "google_storage_bucket" "release" {
  project                     = var.project_id
  name                        = var.release_bucket_name
  location                    = upper(var.region)
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = true }
}

resource "google_storage_bucket_iam_member" "builder" {
  for_each = {
    source_creator   = { role = "roles/storage.objectCreator", prefix = local.source_prefix }
    source_viewer    = { role = "roles/storage.objectViewer", prefix = local.source_prefix }
    logs_creator     = { role = "roles/storage.objectCreator", prefix = local.logs_prefix }
    logs_viewer      = { role = "roles/storage.objectViewer", prefix = local.logs_prefix }
    logs_admin       = { role = "roles/storage.objectAdmin", prefix = local.logs_prefix }
    receipts_creator = { role = "roles/storage.objectCreator", prefix = local.receipt_prefix }
    receipts_viewer  = { role = "roles/storage.objectViewer", prefix = local.receipt_prefix }
  }
  bucket = google_storage_bucket.release.name
  role   = each.value.role
  member = "serviceAccount:${google_service_account.builder.email}"
  condition {
    title      = "aipdm-${each.key}"
    expression = "resource.name.startsWith('${each.value.prefix}')"
  }
}

resource "google_storage_bucket_iam_member" "builder_bucket_viewer" {
  bucket = google_storage_bucket.release.name
  role   = "roles/storage.bucketViewer"
  member = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_storage_bucket_iam_member" "deployer" {
  for_each = {
    control_user     = { role = "roles/storage.objectUser", prefix = local.control_prefix }
    receipts_creator = { role = "roles/storage.objectCreator", prefix = local.receipt_prefix }
    evidence_viewer  = { role = "roles/storage.objectViewer", prefix = "projects/_/buckets/${var.release_bucket_name}/objects/" }
  }
  bucket = google_storage_bucket.release.name
  role   = each.value.role
  member = "serviceAccount:${google_service_account.deployer.email}"
  condition {
    title      = "aipdm-deployer-${each.key}"
    expression = "resource.name.startsWith('${each.value.prefix}')"
  }
}

resource "google_storage_bucket_iam_member" "verifier" {
  for_each = {
    evidence_viewer  = { role = "roles/storage.objectViewer", prefix = "projects/_/buckets/${var.release_bucket_name}/objects/" }
    receipts_creator = { role = "roles/storage.objectCreator", prefix = local.receipt_prefix }
  }
  bucket = google_storage_bucket.release.name
  role   = each.value.role
  member = "serviceAccount:${google_service_account.verifier.email}"
  condition {
    title      = "aipdm-verifier-${each.key}"
    expression = "resource.name.startsWith('${each.value.prefix}')"
  }
}

resource "google_storage_bucket_iam_member" "controller" {
  for_each = var.incident_runtime_enabled ? {
    control_user     = { role = "roles/storage.objectUser", prefix = local.control_prefix }
    receipts_creator = { role = "roles/storage.objectCreator", prefix = local.receipt_prefix }
  } : {}
  bucket = google_storage_bucket.release.name
  role   = each.value.role
  member = "serviceAccount:${google_service_account.controller.email}"
  condition {
    title      = "aipdm-controller-${each.key}"
    expression = "resource.name.startsWith('${each.value.prefix}')"
  }
}

resource "google_storage_bucket_iam_member" "release_coordinator_receipts_viewer" {
  bucket = google_storage_bucket.release.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:dev012-release-coordinator@jenfu-platform-prod.iam.gserviceaccount.com"
  condition {
    title      = "aipdm-release-coordinator-receipts-viewer"
    expression = "resource.name.startsWith('${local.receipt_prefix}')"
  }
}
