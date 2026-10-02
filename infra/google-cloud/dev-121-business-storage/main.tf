# AI-PDM business bytes only. No release evidence, service, traffic or database ownership.
locals {
  project_id    = "jenfu-platform-prod"
  region        = "asia-east1"
  bucket_name   = "jenfu-platform-prod-aipdm-files"
  runtime_email = "aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com"
}

data "google_project" "current" {
  project_id = local.project_id
  lifecycle {
    postcondition {
      condition     = tostring(self.number) == "9536592944"
      error_message = "Wrong production project number."
    }
  }
}

data "google_service_account" "runtime" {
  project    = local.project_id
  account_id = "aipdm-prod-runtime"
  lifecycle {
    postcondition {
      condition     = self.email == local.runtime_email
      error_message = "Only the existing AI-PDM runtime identity is allowed."
    }
  }
}

resource "google_storage_bucket" "business" {
  project                     = local.project_id
  name                        = local.bucket_name
  location                    = upper(local.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  soft_delete_policy { retention_duration_seconds = 2592000 }
  labels = { application = "ai-pdm", purpose = "business-files", environment = "production" }
  lifecycle { prevent_destroy = true }
}

# Definition is project-scoped; authority is granted only on the exact business bucket.
resource "google_project_iam_custom_role" "business_objects" {
  project     = local.project_id
  role_id     = "aipdmBusinessImmutableObjects"
  stage       = "GA"
  title       = "AI-PDM immutable business objects"
  description = "Create and generation-pinned get only; no list, overwrite, delete or signing."
  permissions = ["storage.objects.create", "storage.objects.get"]
  lifecycle { prevent_destroy = true }
}

resource "google_storage_bucket_iam_member" "runtime_objects" {
  bucket     = google_storage_bucket.business.name
  role       = "projects/jenfu-platform-prod/roles/aipdmBusinessImmutableObjects"
  member     = "serviceAccount:${data.google_service_account.runtime.email}"
  depends_on = [google_project_iam_custom_role.business_objects]
  lifecycle { prevent_destroy = true }
}

variable "source_revision" {
  type = string
  validation {
    condition     = can(regex("^[a-f0-9]{40}$", var.source_revision))
    error_message = "Source must be a clean official merged revision."
  }
}
variable "foundation_manifest_sha256" {
  type = string
  validation {
    condition     = can(regex("^[a-f0-9]{64}$", var.foundation_manifest_sha256))
    error_message = "Bind the verified foundation manifest hash."
  }
}
variable "application_image_digest" {
  type = string
  validation {
    condition     = can(regex("^sha256:[a-f0-9]{64}$", var.application_image_digest))
    error_message = "Bind the provider-read immutable application image."
  }
}
variable "migration_runner_image_digest" {
  type = string
  validation {
    condition     = can(regex("^sha256:[a-f0-9]{64}$", var.migration_runner_image_digest))
    error_message = "Bind the provider-read immutable migration runner image."
  }
}

output "business_storage_binding" {
  value = {
    project_id                    = local.project_id
    project_number                = tostring(data.google_project.current.number)
    region                        = local.region
    bucket                        = google_storage_bucket.business.name
    runtime_identity              = data.google_service_account.runtime.email
    permissions                   = google_project_iam_custom_role.business_objects.permissions
    source_revision               = var.source_revision
    foundation_manifest_sha256    = var.foundation_manifest_sha256
    application_image_digest      = var.application_image_digest
    migration_runner_image_digest = var.migration_runner_image_digest
  }
}
