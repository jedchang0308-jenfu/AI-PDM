output "app_release_infra_manifest" {
  value = {
    project_id            = var.project_id
    region                = var.region
    application_service   = data.google_cloud_run_v2_service.application.name
    runtime_identity      = data.google_service_account.runtime.email
    release_repository    = google_artifact_registry_repository.release.id
    release_bucket        = google_storage_bucket.release.name
    wif_provider          = google_iam_workload_identity_pool_provider.github.name
    incident_runtime      = var.incident_runtime_enabled
    abort_controller_name = var.incident_runtime_enabled ? google_cloud_run_v2_service.abort_controller[0].name : null
    migration_job_name    = var.incident_runtime_enabled ? google_cloud_run_v2_job.migration[0].name : null
  }
}
