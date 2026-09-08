resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = var.workload_identity_pool_id
  workload_identity_pool_provider_id = "aipdm-github"
  display_name                       = "AI-PDM production GitHub Actions"
  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.workflow_ref"        = "assertion.workflow_ref"
    "attribute.environment"         = "assertion.environment"
    "attribute.ref"                 = "assertion.ref"
    "attribute.event_name"          = "assertion.event_name"
  }
  attribute_condition = "assertion.repository_id == '${var.github_repository_id}' && assertion.repository_owner_id == '${var.github_repository_owner_id}' && assertion.workflow_ref == '${local.github_workflow_ref}' && assertion.environment == 'production' && assertion.ref == 'refs/heads/main' && assertion.event_name == 'workflow_dispatch'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}

resource "google_service_account_iam_member" "github_builder" {
  service_account_id = google_service_account.builder.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.github_principal_set
}

resource "google_service_account_iam_member" "github_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.github_principal_set
}

resource "google_service_account_iam_member" "github_verifier" {
  service_account_id = google_service_account.verifier.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.github_principal_set
}
