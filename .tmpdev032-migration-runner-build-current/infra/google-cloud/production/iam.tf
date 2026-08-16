resource "google_service_account" "runtime" {
  count = local.create_resources ? 1 : 0

  project      = var.production_project_id
  account_id   = "${local.name_prefix}-runtime"
  display_name = "AI PDM production runtime"
}

resource "google_service_account" "migration" {
  count = local.create_resources ? 1 : 0

  project      = var.production_project_id
  account_id   = "${local.name_prefix}-migration"
  display_name = "AI PDM production migration runner"
}

resource "google_project_iam_member" "runtime" {
  for_each = local.create_resources ? local.runtime_roles : toset([])

  project = var.production_project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.runtime[0].email}"
}

resource "google_project_iam_member" "migration" {
  for_each = local.create_resources ? local.migration_roles : toset([])

  project = var.production_project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.migration[0].email}"
}
