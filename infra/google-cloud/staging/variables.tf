variable "enable_resource_creation" {
  description = "Phase 2B only. Phase 2A must leave this false."
  type        = bool
  default     = false
}

variable "enable_secret_container_bootstrap" {
  description = "Phase 2B secure bootstrap only. Creates empty Secret Manager containers before secret values are added out of band."
  type        = bool
  default     = false
}

variable "session_secret_versions_ready" {
  description = "True only after current and previous session-signing secret versions exist and access has been verified."
  type        = bool
  default     = false
}

variable "phase2_change_ticket" {
  description = "Approved change ticket required before any resource can be created."
  type        = string
  default     = ""
}

variable "phase2_apply_acknowledgement" {
  description = "Exact acknowledgement required together with enable_resource_creation."
  type        = string
  default     = ""
}

variable "staging_project_id" {
  description = "Existing, separately approved Google Cloud staging project."
  type        = string
  default     = "jenfu-erp-stg"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.staging_project_id))
    error_message = "staging_project_id must be a valid Google Cloud project ID."
  }
}

variable "staging_project_number" {
  description = "Numeric Google Cloud project identifier used by APIs that reject project IDs."
  type        = string
  default     = "000000000000"

  validation {
    condition     = can(regex("^[0-9]{6,}$", var.staging_project_number))
    error_message = "staging_project_number must be the numeric Google Cloud project number."
  }
}

variable "production_project_id" {
  description = "Reserved production project ID used only to prove environment separation."
  type        = string
  default     = "jenfu-erp-prod"

  validation {
    condition     = var.production_project_id != var.staging_project_id
    error_message = "Staging and production project IDs must differ."
  }
}

variable "billing_account_id" {
  description = "Approved billing account. Placeholder during Phase 2A."
  type        = string
  default     = "000000-000000-000000"
}

variable "region" {
  description = "DEV-046 Taiwan runtime/data region."
  type        = string
  default     = "asia-east1"

  validation {
    condition     = var.region == "asia-east1"
    error_message = "DEV-046 requires asia-east1."
  }
}

variable "staging_domain" {
  description = "Dedicated staging hostname behind the external Application Load Balancer."
  type        = string
  default     = "pdm-stg.jenfu.com.tw"

  validation {
    condition     = can(regex("^pdm-stg\\.[a-z0-9.-]+$", var.staging_domain))
    error_message = "Use the dedicated pdm-stg staging hostname."
  }
}

variable "enable_firebase_hosting_gateway" {
  description = "Enables the low-cost Staging Firebase Hosting rewrite entrypoint."
  type        = bool
  default     = true
}

variable "enable_external_load_balancer" {
  description = "Creates the deferred custom-domain external Application Load Balancer. Keep false during rapid development."
  type        = bool
  default     = false
}

variable "runtime_public_base_url" {
  description = "Canonical browser origin used for redirects, same-origin mutation checks and generated account links."
  type        = string
  default     = "https://jenfu-ai-pdm-stg-361825.web.app"

  validation {
    condition     = can(regex("^https://[a-z0-9.-]+$", var.runtime_public_base_url))
    error_message = "runtime_public_base_url must be a bare HTTPS origin without a path."
  }
}

variable "firebase_web_api_key" {
  description = "Restricted public Firebase Web API key for the approved staging web app."
  type        = string
  default     = "ASSIGN_FIREBASE_WEB_API_KEY"
}

variable "firebase_auth_domain" {
  description = "Firebase Auth domain for the approved staging web app."
  type        = string
  default     = "jenfu-ai-pdm-stg-361825.web.app"
}

variable "firebase_web_app_id" {
  description = "Firebase Web app ID for isolated staging."
  type        = string
  default     = "ASSIGN_FIREBASE_WEB_APP_ID"
}

variable "trust_google_workspace_mfa" {
  description = "When true, verified Google sign-ins from google_workspace_domains satisfy privileged MFA assurance through Google Workspace policy instead of AI_PDM TOTP enrollment."
  type        = bool
  default     = false
}

variable "allow_google_workspace_aal1_privileged" {
  description = "Temporary staging pilot exception. Allows verified Google sign-ins from google_workspace_domains to access privileged roles at AAL1 when Workspace 2-Step Verification enforcement is intentionally deferred."
  type        = bool
  default     = false
}

variable "google_workspace_domains" {
  description = "Google Workspace domains allowed for Workspace MFA trust or the temporary AAL1 privileged pilot exception."
  type        = list(string)
  default     = ["jenfu.com.tw"]

  validation {
    condition     = length(var.google_workspace_domains) > 0 && alltrue([for domain in var.google_workspace_domains : can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", domain))])
    error_message = "google_workspace_domains must contain at least one DNS domain."
  }
}

variable "session_issuer" {
  description = "Issuer embedded in PDM BFF session v2 tokens."
  type        = string
  default     = "https://jenfu-ai-pdm-stg-361825.web.app"
}

variable "session_audience" {
  description = "Audience embedded in PDM BFF session v2 tokens."
  type        = string
  default     = "ai-pdm-staging"
}

variable "session_current_key_id" {
  description = "Non-secret identifier for the active session-signing key."
  type        = string
  default     = "staging-session-v1"
}

variable "session_previous_key_id" {
  description = "Non-secret identifier retained for verification during signing-key rotation."
  type        = string
  default     = "staging-session-v0"
}

variable "application_image" {
  description = "Immutable AI_PDM image reference. Tags and source deployment are forbidden."
  type        = string
  default     = "asia-east1-docker.pkg.dev/jenfu-erp-stg/ai-pdm/ai-pdm@sha256:0000000000000000000000000000000000000000000000000000000000000000"

  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.application_image))
    error_message = "application_image must be pinned by sha256 digest."
  }
}

variable "enable_migration_runner_job" {
  description = "Review-gated Cloud Run Job for DEV-046 staging migration dry-run only. Defaults false and does not authorize live migration."
  type        = bool
  default     = false
}

variable "migration_runner_job_acknowledgement" {
  description = "Exact acknowledgement required before the review-only Cloud Run migration runner job can be created."
  type        = string
  default     = ""
}

variable "migration_runner_image" {
  description = "Immutable migration-runner image reference built from the Dockerfile migration-runner target. Tags and source deployment are forbidden."
  type        = string
  default     = "asia-east1-docker.pkg.dev/jenfu-erp-stg/ai-pdm/ai-pdm-migration@sha256:0000000000000000000000000000000000000000000000000000000000000000"

  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.migration_runner_image))
    error_message = "migration_runner_image must be pinned by sha256 digest."
  }
}

variable "cloud_sql_proxy_image" {
  description = "Digest-pinned Cloud SQL Auth Proxy v2 image."
  type        = string
  default     = "gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.22.0@sha256:fa4c7308245407157c5e9c4e16f1c0f1113899d6f29dc8f8be3e30efae86467f"

  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.cloud_sql_proxy_image))
    error_message = "cloud_sql_proxy_image must be pinned by sha256 digest."
  }
}

variable "database_version" {
  description = "Reviewed Cloud SQL PostgreSQL major."
  type        = string
  default     = "POSTGRES_17"
}

variable "database_tier" {
  description = "Rapid-development Staging Cloud SQL tier. db-f1-micro has no SLA."
  type        = string
  default     = "db-f1-micro"
}

variable "database_activation_policy" {
  description = "Staging database runtime policy. NEVER keeps it stopped between release-validation windows."
  type        = string
  default     = "NEVER"

  validation {
    condition     = contains(["ALWAYS", "NEVER"], var.database_activation_policy)
    error_message = "database_activation_policy must be ALWAYS or NEVER."
  }
}

variable "cloud_run_max_instances" {
  description = "Maximum instances per Staging Cloud Run revision."
  type        = number
  default     = 2

  validation {
    condition     = var.cloud_run_max_instances >= 1 && var.cloud_run_max_instances <= 5
    error_message = "cloud_run_max_instances must remain between 1 and 5."
  }
}

variable "cloud_sql_pool_max" {
  description = "Maximum Staging PostgreSQL pool size per Cloud Run instance."
  type        = number
  default     = 2

  validation {
    condition     = var.cloud_sql_pool_max >= 1 && var.cloud_sql_pool_max <= 5
    error_message = "cloud_sql_pool_max must remain between 1 and 5."
  }
}

variable "monthly_budget_usd" {
  description = "Planning budget. It is not measured cost evidence."
  type        = number
  default     = 300

  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "monthly_budget_usd must be positive."
  }
}

variable "billing_budget_currency_code" {
  description = "Cloud Billing account currency code used by the Budget API."
  type        = string
  default     = "TWD"

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.billing_budget_currency_code))
    error_message = "billing_budget_currency_code must be an ISO 4217 currency code."
  }
}

variable "billing_budget_units" {
  description = "Budget API amount in the Cloud Billing account currency. TWD 9600 is below the approved USD 300 cap at the 2026-07-14 Bank of Taiwan spot selling rate."
  type        = number
  default     = 9600

  validation {
    condition     = var.billing_budget_units > 0
    error_message = "billing_budget_units must be positive."
  }
}

variable "budget_notification_channel_ids" {
  description = "Verified Monitoring notification channel resource IDs."
  type        = list(string)
  default     = []
}

variable "alert_notification_channel_ids" {
  description = "Verified Monitoring notification channel resource IDs for runtime alerts."
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Common non-sensitive resource labels."
  type        = map(string)
  default = {
    application = "ai-pdm"
    environment = "staging"
    managed-by  = "terraform"
    dev         = "dev-046"
  }
}
