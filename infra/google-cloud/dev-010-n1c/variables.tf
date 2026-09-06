variable "project_id" {
  type    = string
  default = "jenfu-platform-nonprod"
  validation {
    condition     = var.project_id == "jenfu-platform-nonprod"
    error_message = "DEV-010 N1C AI-PDM is fixed to jenfu-platform-nonprod."
  }
}

variable "region" {
  type    = string
  default = "asia-east1"
  validation {
    condition     = var.region == "asia-east1"
    error_message = "DEV-010 N1C AI-PDM is fixed to asia-east1."
  }
}

variable "iac_service_account_email" {
  type        = string
  description = "Keyless app-state deployment identity."
}

variable "foundation_manifest_sha256" {
  type        = string
  description = "SHA-256 of reviewed Platform foundation outputs."
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.foundation_manifest_sha256))
    error_message = "foundation_manifest_sha256 must be SHA-256."
  }
}

variable "foundation_connection_name" {
  type    = string
  default = "jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg"
  validation {
    condition     = var.foundation_connection_name == "jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg"
    error_message = "Unexpected Cloud SQL foundation connection."
  }
}

variable "foundation_network_name" {
  type    = string
  default = "jenfu-platform-nonprod-vpc"
  validation {
    condition     = var.foundation_network_name == "jenfu-platform-nonprod-vpc"
    error_message = "Unexpected shared VPC."
  }
}

variable "foundation_subnetwork_name" {
  type    = string
  default = "jenfu-platform-nonprod-qc"
  validation {
    condition     = var.foundation_subnetwork_name == "jenfu-platform-nonprod-qc"
    error_message = "Unexpected shared non-production subnet."
  }
}

variable "runtime_service_account_email" {
  type    = string
  default = "dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com"
  validation {
    condition     = var.runtime_service_account_email == "dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com"
    error_message = "Unexpected AI-PDM staging runtime identity."
  }
}

variable "migration_service_account_email" {
  type    = string
  default = "dev010-stg-aipdm-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com"
  validation {
    condition     = var.migration_service_account_email == "dev010-stg-aipdm-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com"
    error_message = "Unexpected AI-PDM staging migrator identity."
  }
}

variable "application_image" {
  type        = string
  description = "AI-PDM runtime image pinned in the shared Artifact Registry."
  validation {
    condition     = can(regex("^asia-east1-docker\\.pkg\\.dev/jenfu-platform-nonprod/dev010-n1c/ai-pdm@sha256:[0-9a-f]{64}$", var.application_image))
    error_message = "application_image must be an immutable shared-registry digest."
  }
}

variable "migration_image" {
  type        = string
  description = "N1C migration image pinned in the shared Artifact Registry."
  validation {
    condition     = can(regex("^asia-east1-docker\\.pkg\\.dev/jenfu-platform-nonprod/dev010-n1c/ai-pdm-migration@sha256:[0-9a-f]{64}$", var.migration_image))
    error_message = "migration_image must be an immutable shared-registry digest."
  }
}

variable "cloud_sql_proxy_image" {
  type    = string
  default = "gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.22.0@sha256:fa4c7308245407157c5e9c4e16f1c0f1113899d6f29dc8f8be3e30efae86467f"
  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.cloud_sql_proxy_image))
    error_message = "Cloud SQL proxy must be digest pinned."
  }
}

variable "source_revision" {
  type        = string
  description = "Clean committed AI-PDM candidate HEAD."
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_revision))
    error_message = "source_revision must be a Git SHA-1."
  }
}

variable "firebase_web_api_key" {
  type        = string
  description = "Restricted public Firebase Web API key; not an OAuth client secret."
  sensitive   = true
}

variable "session_versions_ready" {
  type        = bool
  default     = false
  description = "True only after both out-of-band session secret values exist and access is verified."
}

variable "workbench_contract_version_ready" {
  type        = bool
  default     = false
  description = "True only after the dedicated workbench contract signing secret has an enabled version."
}

variable "enable_security_resources" {
  type        = bool
  default     = false
  description = "Creates only empty session-signing Secret containers and IAM bindings."
}

variable "enable_migration_job" {
  type        = bool
  default     = false
  description = "Provider re-entry gate for the singleton migration job resource."
}

variable "enable_runtime" {
  type        = bool
  default     = false
  description = "Provider re-entry gate for Cloud Run runtime."
}

variable "enable_hosting" {
  type        = bool
  default     = false
  description = "Provider re-entry gate for the exact Firebase web app and Hosting site."
}

variable "alert_notification_channel_ids" {
  type        = list(string)
  default     = []
  description = "Existing verified non-production notification channels."
}
