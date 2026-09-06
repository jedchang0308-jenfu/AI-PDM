output "state_contract" {
  value = {
    remote_state_prefix        = "dev-010/n1c/ai-pdm"
    foundation_manifest_sha256 = var.foundation_manifest_sha256
    project_id                 = var.project_id
    database                   = local.database
    service                    = local.service_name
    hosting_site               = local.hosting_site
    canonical_origin           = local.canonical_origin
    runtime_pool_max           = 2
  }
}

output "firebase_web_app_id" {
  value = var.enable_hosting ? google_firebase_web_app.pdm[0].app_id : null
}
