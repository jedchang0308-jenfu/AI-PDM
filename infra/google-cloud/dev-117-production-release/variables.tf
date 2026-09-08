variable "project_id" {
  type    = string
  default = "jenfu-platform-prod"
  validation {
    condition     = var.project_id == "jenfu-platform-prod"
    error_message = "Wrong production project."
  }
}

variable "region" {
  type    = string
  default = "asia-east1"
  validation {
    condition     = var.region == "asia-east1"
    error_message = "Wrong production region."
  }
}

variable "application_service_name" {
  type    = string
  default = "ai-pdm-prod"
  validation {
    condition     = var.application_service_name == "ai-pdm-prod"
    error_message = "Wrong application service."
  }
}

variable "runtime_service_account_id" {
  type    = string
  default = "aipdm-prod-runtime"
  validation {
    condition     = var.runtime_service_account_id == "aipdm-prod-runtime"
    error_message = "Wrong runtime identity."
  }
}

variable "release_repository_id" {
  type    = string
  default = "aipdm-release"
  validation {
    condition     = var.release_repository_id == "aipdm-release"
    error_message = "Wrong release repository."
  }
}

variable "release_bucket_name" {
  type    = string
  default = "jenfu-platform-prod-aipdm-release"
  validation {
    condition     = var.release_bucket_name == "jenfu-platform-prod-aipdm-release"
    error_message = "Wrong release bucket."
  }
}

variable "workload_identity_pool_id" {
  type    = string
  default = "jenfu-prod-release"
}

variable "github_repository_id" {
  type    = string
  default = "1260972060"
  validation {
    condition     = var.github_repository_id == "1260972060"
    error_message = "Use the provider-readback AI-PDM repository id."
  }
}

variable "github_repository_owner_id" {
  type    = string
  default = "257207597"
  validation {
    condition     = var.github_repository_owner_id == "257207597"
    error_message = "Use the provider-readback GitHub owner id."
  }
}

variable "controller_image_digest" {
  type     = string
  nullable = true
  default  = null
  validation {
    condition     = !var.incident_runtime_enabled || can(regex("^asia-east1-docker\\.pkg\\.dev/jenfu-platform-prod/aipdm-release/ai-pdm-abort-controller@sha256:[a-f0-9]{64}$", coalesce(var.controller_image_digest, "")))
    error_message = "APP_INFRA_B requires an immutable controller digest."
  }
}

variable "incident_runtime_enabled" {
  type    = bool
  default = false
}

variable "github_read_token_secret_version" {
  type     = string
  nullable = true
  default  = null
  validation {
    condition     = !var.incident_runtime_enabled || can(regex("^[1-9][0-9]*$", coalesce(var.github_read_token_secret_version, "")))
    error_message = "Stage B requires an exact numeric GitHub read-token Secret version."
  }
}
variable "migration_service_account_id" {
  type    = string
  default = "aipdm-prod-migrator"
}
variable "cloud_sql_connection_name" {
  type    = string
  default = "jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg"
  validation {
    condition     = var.cloud_sql_connection_name == "jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg"
    error_message = "Wrong production Cloud SQL instance."
  }
}
variable "migration_runner_image_digest" {
  type     = string
  nullable = true
  default  = null
  validation {
    condition     = !var.incident_runtime_enabled || can(regex("^asia-east1-docker\\.pkg\\.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:[a-f0-9]{64}$", coalesce(var.migration_runner_image_digest, "")))
    error_message = "APP_INFRA_B requires the exact immutable migration runner image."
  }
}

variable "approved_notification_email" {
  description = "S2-approved destination; never inferred from the logged-in actor."
  type        = string
  sensitive   = true
  nullable    = true
  default     = null
  validation {
    condition     = !var.incident_runtime_enabled || (var.approved_notification_email != null && length(var.approved_notification_email) > 3)
    error_message = "APP_INFRA_B requires the approved notification destination."
  }
}


variable "candidate_smoke_refresh_token_secret_version" {
  description = "Exact numeric Secret Manager version for the production smoke principal Firebase refresh token."
  type        = string
  nullable    = true
  default     = null
  validation {
    condition     = !var.incident_runtime_enabled || can(regex("^[1-9][0-9]*$", coalesce(var.candidate_smoke_refresh_token_secret_version, "")))
    error_message = "APP_INFRA_B requires the exact numeric candidate-smoke refresh-token Secret version."
  }
}

variable "source_revision" {
  description = "Exact clean AI-PDM source revision bound into this app-owned plan and state."
  type        = string
  validation {
    condition     = can(regex("^[a-f0-9]{40}$", var.source_revision))
    error_message = "APP_INFRA requires an exact 40-character source revision."
  }
}

variable "foundation_manifest_sha256" {
  description = "SHA-256 of the provider-readback DEV-012 foundation manifest consumed by this plan."
  type        = string
  validation {
    condition     = can(regex("^[a-f0-9]{64}$", var.foundation_manifest_sha256))
    error_message = "APP_INFRA requires the exact foundation manifest SHA-256."
  }
}
