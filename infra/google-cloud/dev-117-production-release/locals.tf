locals {
  app                            = "aipdm"
  github_repository              = "jedchang0308-jenfu/AI-PDM"
  github_workflow_ref            = "jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-ai-pdm-independent-production.yml@refs/heads/main"
  pool_resource_name             = "projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${var.workload_identity_pool_id}"
  github_principal_set           = "principalSet://iam.googleapis.com/${local.pool_resource_name}/attribute.repository_id/${var.github_repository_id}"
  controller_service             = "aipdm-prod-abort-controller"
  controller_audience            = "https://release-controller.jenfu.internal/aipdm"
  controller_github_token_secret = "aipdm-prod-controller-github-read-token"
  incident_topic                 = "aipdm-prod-release-incident"
  receipt_prefix                 = "projects/_/buckets/${var.release_bucket_name}/objects/receipts/"
  control_prefix                 = "projects/_/buckets/${var.release_bucket_name}/objects/control/"
  source_prefix                  = "projects/_/buckets/${var.release_bucket_name}/objects/source/"
  logs_prefix                    = "projects/_/buckets/${var.release_bucket_name}/objects/logs/"
  labels                         = { owner = "aipdm", contract = "dev-012", environment = "production" }
}
