resource "google_project_service" "required" {
  for_each = local.create_resources ? local.required_services : toset([])

  project            = var.staging_project_id
  service            = each.value
  disable_on_destroy = false
}
resource "google_service_account" "runtime" {
  count = local.create_resources ? 1 : 0

  project      = var.staging_project_id
  account_id   = "pdm-runtime-stg"
  display_name = "AI PDM staging runtime"
  description  = "Dedicated Cloud Run and automatic IAM database authentication identity."

  depends_on = [google_project_service.required]
}

resource "google_service_account" "migration" {
  count = local.create_resources ? 1 : 0

  project      = var.staging_project_id
  account_id   = "pdm-migration-stg"
  display_name = "AI PDM staging migration"
  description  = "Dedicated singleton schema/grant migration identity; not used by the app runtime."

  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "runtime" {
  for_each = local.create_resources ? local.runtime_roles : toset([])

  project = var.staging_project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.runtime[0].email}"
}

resource "google_project_iam_member" "migration" {
  for_each = local.create_resources ? local.migration_roles : toset([])

  project = var.staging_project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.migration[0].email}"
}
