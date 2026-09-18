output "owner_infra_manifest" {
  value = {
    project_id                 = var.project_id
    project_number             = data.google_project.target.number
    region                     = var.region
    source_revision            = var.source_revision
    source_tree                = var.source_tree
    platform_manifest_sha256   = var.platform_manifest_sha256
    canonical_contract_sha256  = var.canonical_contract_sha256
    foundation_manifest_sha256 = var.foundation_manifest_sha256
    artifact_repository        = google_artifact_registry_repository.ai_pdm.repository_id
    image_uri                  = "${var.region}-docker.pkg.dev/${var.project_id}/${local.artifact_repository}/ai-pdm"
    evidence_bucket            = google_storage_bucket.evidence.name
    evidence_prefix            = local.evidence_prefix
  }
}
