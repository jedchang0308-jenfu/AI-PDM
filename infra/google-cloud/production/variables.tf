variable "enable_resource_creation" {
  description = "DEV-032 production resource creation gate. Defaults false. A plan is not apply approval."
  type        = bool
  default     = false
}

variable "production_apply_acknowledgement" {
  description = "Exact acknowledgement required before any resource can be planned for creation."
  type        = string
  default     = ""
}

variable "production_target_readback_approved" {
  description = "True only after read-only production project, Cloud Run, Cloud SQL, Firebase and Secret Manager target readback is approved."
  type        = bool
  default     = false
}

variable "production_env_source_approved" {
  description = "True only after production public/runtime env source is reviewed without exposing secret values."
  type        = bool
  default     = false
}

variable "production_secret_metadata_readback_approved" {
  description = "True only after required Secret Manager metadata IDs are readable. Secret values are never read by this package."
  type        = bool
  default     = false
}

variable "clean_seed_allowlist_approved" {
  description = "True only after clean seed, non-reuse reservation and named canary allowlist evidence is approved."
  type        = bool
  default     = false
}

variable "hd84_restore_reconciliation_approved" {
  description = "True only after HD-8-4 / 1A separate-target restore and numbering-ledger reconciliation pass."
  type        = bool
  default     = false
}

variable "rollback_readiness_approved" {
  description = "True only after Cloud Run, database and operator rollback readiness are approved."
  type        = bool
  default     = false
}

variable "level3_smoke_plan_approved" {
  description = "True only after the production-like Level 3 smoke plan and operator are approved."
  type        = bool
  default     = false
}

variable "production_project_id" {
  description = "Dedicated production Google Cloud project."
  type        = string
  default     = "jenfu-ai-pdm-prod"

  validation {
    condition     = var.production_project_id == "jenfu-ai-pdm-prod"
    error_message = "DEV-032 production package is pinned to jenfu-ai-pdm-prod."
  }
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

variable "production_project_number" {
  description = "Immutable Google Cloud project number used by billing-budget filters and readback."
  type        = string
  default     = "451715062958"

  validation {
    condition     = var.production_project_number == "451715062958"
    error_message = "Production project number must match the DEV-032 target readback."
  }
}

variable "production_domain" {
  description = "Production custom domain behind the external Application Load Balancer."
  type        = string
  default     = "pdm.jenfu.com.tw"
}

variable "runtime_public_base_url" {
  description = "Canonical production browser origin."
  type        = string
  default     = "https://pdm.jenfu.com.tw"

  validation {
    condition     = var.runtime_public_base_url == "https://pdm.jenfu.com.tw"
    error_message = "Production public base URL must be https://pdm.jenfu.com.tw."
  }
}

variable "application_image" {
  description = "Immutable AI_PDM production image reference. Tags and source deployment are forbidden."
  type        = string
  default     = "asia-east1-docker.pkg.dev/jenfu-ai-pdm-prod/ai-pdm/ai-pdm@sha256:0000000000000000000000000000000000000000000000000000000000000000"

  validation {
    condition     = can(regex("^asia-east1-docker\\.pkg\\.dev/jenfu-ai-pdm-prod/ai-pdm/ai-pdm@sha256:[a-f0-9]{64}$", var.application_image))
    error_message = "application_image must be a digest-pinned production Artifact Registry image."
  }
}

variable "migration_runner_image" {
  description = "Immutable DEV-032 production migration-runner image. Tags and source deployment are forbidden."
  type        = string
  default     = "asia-east1-docker.pkg.dev/jenfu-ai-pdm-prod/ai-pdm/ai-pdm-migration@sha256:0000000000000000000000000000000000000000000000000000000000000000"

  validation {
    condition     = can(regex("^asia-east1-docker\\.pkg\\.dev/jenfu-ai-pdm-prod/ai-pdm/ai-pdm-migration@sha256:[a-f0-9]{64}$", var.migration_runner_image))
    error_message = "migration_runner_image must be a digest-pinned production Artifact Registry image."
  }
}

variable "enable_migration_runner_job" {
  description = "Creates the private DEV-032 production migration Job. The Job remains dry-run unless live execution is separately enabled."
  type        = bool
  default     = false
}

variable "migration_runner_job_acknowledgement" {
  description = "Exact acknowledgement required before the production migration Job can be created."
  type        = string
  default     = ""
}

variable "migration_live_execution" {
  description = "Switches the migration Job from dry-run to live execution. Requires a separate exact acknowledgement and completed admin bootstrap."
  type        = bool
  default     = false
}

variable "migration_live_execution_acknowledgement" {
  description = "Exact acknowledgement required before Terraform may configure the migration Job for live execution."
  type        = string
  default     = ""
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

variable "database_tier" {
  description = "Initial production Cloud SQL tier; right-size by reviewed plan and measured run-rate."
  type        = string
  default     = "db-custom-1-3840"
}

variable "monthly_budget_usd" {
  description = "Approved monthly cap."
  type        = number
  default     = 300
}

variable "billing_budget_currency_code" {
  description = "Cloud Billing account currency. The approved account is denominated in TWD."
  type        = string
  default     = "TWD"

  validation {
    condition     = var.billing_budget_currency_code == "TWD"
    error_message = "The approved production Billing Account requires a TWD budget."
  }
}

variable "billing_budget_units" {
  description = "TWD 9,600 operational budget, preserving the approved USD 300 monthly cap contract."
  type        = number
  default     = 9600

  validation {
    condition     = var.billing_budget_units == 9600
    error_message = "Production budget units must remain TWD 9,600 unless the cost gate is re-approved."
  }
}

variable "plan_review_stop_usd" {
  description = "Credentialled plan review stop threshold."
  type        = number
  default     = 240
}

variable "estimated_monthly_cost_usd" {
  description = "Operator-supplied cost estimate from the credentialled plan. Defaults zero for static review only."
  type        = number
  default     = 0
}

variable "billing_account_id" {
  description = "Approved billing account. Placeholder until production target is authorized."
  type        = string
  default     = "000000-000000-000000"
}

variable "budget_notification_channel_ids" {
  description = "Verified Monitoring notification channels for 50/80/100 budget alerts."
  type        = list(string)
  default     = []
}

variable "alert_notification_channel_ids" {
  description = "Verified Monitoring notification channels for runtime alerts."
  type        = list(string)
  default     = []
}

variable "firebase_web_api_key" {
  description = "Restricted public Firebase Web API key for production."
  type        = string
  default     = "ASSIGN_PRODUCTION_FIREBASE_WEB_API_KEY"
}

variable "firebase_auth_domain" {
  description = "Production Firebase Auth handler domain; this is not the application gateway."
  type        = string
  default     = "jenfu-ai-pdm-prod.firebaseapp.com"
}

variable "firebase_web_app_id" {
  description = "Firebase Web app ID for production."
  type        = string
  default     = "ASSIGN_PRODUCTION_FIREBASE_WEB_APP_ID"
}

variable "trust_google_workspace_mfa" {
  description = "Production must either approve AAL1 residual risk or provide Workspace 2SV/provider-managed MFA evidence."
  type        = bool
  default     = false
}

variable "allow_google_workspace_aal1_privileged" {
  description = "Production residual-risk exception. Must not be true without explicit DEV-032 approval."
  type        = bool
  default     = false
}

variable "google_workspace_domains" {
  description = "Wave 0 production Google Workspace domains."
  type        = list(string)
  default     = ["jenfu.com.tw"]
}

variable "session_issuer" {
  description = "Issuer embedded in PDM BFF session v2 tokens."
  type        = string
  default     = "https://pdm.jenfu.com.tw"
}

variable "session_audience" {
  description = "Audience embedded in PDM BFF session v2 tokens."
  type        = string
  default     = "ai-pdm-production"
}

variable "session_current_key_id" {
  description = "Non-secret identifier for the active session-signing key."
  type        = string
  default     = "production-session-v1"
}

variable "session_previous_key_id" {
  description = "Non-secret identifier retained for verification during signing-key rotation."
  type        = string
  default     = "production-session-v0"
}

variable "labels" {
  description = "Common non-sensitive resource labels."
  type        = map(string)
  default = {
    application = "ai-pdm"
    environment = "production"
    managed-by  = "terraform"
    dev         = "dev-032"
  }
}
