resource "google_service_account" "github_production_deployer" {
  count = local.create_resources && local.github_deployment_identity_ready ? 1 : 0

  project      = var.production_project_id
  account_id   = "${local.name_prefix}-deployer"
  display_name = "AI PDM GitHub production deployer"
  description  = "Keyless production image and Cloud Run release identity; no infrastructure or data administration."
}

resource "google_iam_workload_identity_pool" "github_actions" {
  count = local.create_resources && local.github_deployment_identity_ready ? 1 : 0

  project                   = var.production_project_id
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "Keyless identities for the approved AI PDM GitHub deployment workflow."
  disabled                  = false

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github_production" {
  count = local.create_resources && local.github_deployment_identity_ready ? 1 : 0

  project                            = var.production_project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_actions[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "ai-pdm-production"
  display_name                       = "AI PDM production"
  description                        = "Only the production workflow on main using the production GitHub Environment."

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.ref"              = "assertion.ref"
    "attribute.workflow_ref"     = "assertion.workflow_ref"
    "attribute.environment"      = "assertion.environment"
    "attribute.repository_id"    = "assertion.repository_id"
    "attribute.repository_owner" = "assertion.repository_owner_id"
  }

  attribute_condition = <<-EOT
    assertion.repository_owner_id == "${var.github_repository_owner_id}" &&
    assertion.repository_id == "${var.github_repository_id}" &&
    assertion.repository == "${var.github_repository}" &&
    assertion.ref == "refs/heads/main" &&
    assertion.ref_type == "branch" &&
    assertion.workflow_ref == "${var.github_production_workflow_ref}" &&
    assertion.environment == "production"
  EOT

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_workload_identity_user" {
  count = local.create_resources && local.github_deployment_identity_ready ? 1 : 0

  service_account_id = google_service_account.github_production_deployer[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_actions[0].name}/attribute.repository/${var.github_repository}"
}

resource "google_artifact_registry_repository_iam_member" "github_production_writer" {
  count = local.create_resources && local.github_deployment_identity_ready ? 1 : 0

  project    = var.production_project_id
  location   = google_artifact_registry_repository.pdm[0].location
  repository = google_artifact_registry_repository.pdm[0].repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_production_deployer[0].email}"
}

resource "google_cloud_run_v2_service_iam_member" "github_production_developer" {
  count = local.create_resources && local.github_deployment_identity_ready ? 1 : 0

  project  = var.production_project_id
  location = google_cloud_run_v2_service.pdm[0].location
  name     = google_cloud_run_v2_service.pdm[0].name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.github_production_deployer[0].email}"
}

resource "google_service_account_iam_member" "github_runtime_service_account_user" {
  count = local.create_resources && local.github_deployment_identity_ready ? 1 : 0

  service_account_id = google_service_account.runtime[0].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_production_deployer[0].email}"
}
