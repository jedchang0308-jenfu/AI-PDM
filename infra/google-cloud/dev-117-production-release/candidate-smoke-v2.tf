resource "google_workflows_workflow" "candidate_smoke_v2" {
  count                   = var.incident_runtime_enabled ? 1 : 0
  project                 = var.project_id
  region                  = var.region
  name                    = local.candidate_smoke_workflow_v2
  description             = "DEV-012 private zero-traffic candidate smoke v2 for ${local.owner_application_id}."
  service_account         = google_service_account.smoke.id
  call_log_level          = "LOG_NONE"
  execution_history_level = "EXECUTION_HISTORY_BASIC"
  deletion_protection     = true
  labels                  = local.labels

  source_contents = replace(
    google_workflows_workflow.candidate_smoke[0].source_contents,
    "owner_app != \"${local.app}\"",
    "owner_app != \"${local.owner_application_id}\""
  )
}
