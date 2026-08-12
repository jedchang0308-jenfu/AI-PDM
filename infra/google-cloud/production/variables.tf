variable "enable_resource_creation" {
  description = "DEV-032 production resource creation gate. Defaults false. A plan is not apply approval."
  type        = bool
  default     = false
}

variable "enable_github_deployment_identity" {
  description = "Creates the keyless GitHub Actions production deployment identity. Defaults false and remains separately acknowledged."
  type        = bool
  default     = false
}

variable "github_deployment_identity_acknowledgement" {
  description = "Exact acknowledgement required before the production GitHub WIF identity can be created."
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "Exact GitHub repository allowed to request the production deployment identity."
  type        = string
  default     = "jedchang0308-jenfu/AI-PDM"

  validation {
    condition     = var.github_repository == "jedchang0308-jenfu/AI-PDM"
    error_message = "Production deployment identity is pinned to jedchang0308-jenfu/AI-PDM."
  }
}

variable "github_repository_id" {
  description = "Immutable GitHub repository ID used to prevent repository-name reuse."
  type        = string
  default     = "1260972060"

  validation {
    condition     = var.github_repository_id == "1260972060"
    error_message = "Production deployment identity repository ID does not match the approved GitHub repository."
  }
}

variable "github_repository_owner_id" {
  description = "Immutable GitHub owner ID used to prevent owner-name reuse."
  type        = string
  default     = "257207597"

  validation {
    condition     = var.github_repository_owner_id == "257207597"
    error_message = "Production deployment identity owner ID does not match the approved GitHub owner."
  }
}

variable "github_production_workflow_ref" {
  description = "Only this workflow on main may exchange the production GitHub OIDC token."
  type        = string
  default     = "jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-production.yml@refs/heads/main"

  validation {
    condition     = var.github_production_workflow_ref == "jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-production.yml@refs/heads/main"
    error_message = "Production deployment identity workflow ref must remain pinned to deploy-production.yml on main."
  }
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
    condition = contains([
      "https://pdm.jenfu.com.tw",
      "https://jenfu-ai-pdm-prod.web.app"
    ], var.runtime_public_base_url)
    error_message = "Production public base URL must be the approved custom domain or production Firebase Hosting pilot origin."
  }
}

variable "enable_firebase_hosting_gateway" {
  description = "Short-term production pilot exception. Enables Firebase Hosting rewrites by exposing the Cloud Run default URI and all ingress."
  type        = bool
  default     = false
}

variable "enable_external_load_balancer" {
  description = "Creates the deferred custom-domain external Application Load Balancer. Keep false during the Firebase Hosting prelaunch phase."
  type        = bool
  default     = false
}

variable "firebase_hosting_gateway_acknowledgement" {
  description = "Exact acknowledgement required before the production Firebase Hosting pilot gateway can be enabled."
  type        = string
  default     = ""
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

variable "admin_bootstrap_readback_approved" {
  description = "True only after the privileged Cloud SQL role bootstrap readback passes."
  type        = bool
  default     = false
}

variable "schema_migration_readback_approved" {
  description = "True only after the production schema migration and immediate idempotent rerun readback pass."
  type        = bool
  default     = false
}

variable "principal_bootstrap_execution" {
  description = "Switches the private migration Job to the production principal bootstrap runner."
  type        = bool
  default     = false
}

variable "principal_bootstrap_execution_acknowledgement" {
  description = "Exact acknowledgement required before the production principal bootstrap runner may execute."
  type        = string
  default     = ""
}

variable "production_principal_firebase_uid" {
  description = "Verified production Firebase UID for the initial admin. A template or staging UID is forbidden."
  type        = string
  default     = ""

  validation {
    condition     = var.production_principal_firebase_uid == "" || can(regex("^[A-Za-z0-9_-]{6,128}$", var.production_principal_firebase_uid))
    error_message = "production_principal_firebase_uid must be empty or a verified Firebase UID."
  }
}

variable "principal_bootstrap_readback_approved" {
  description = "True only after the production principal bootstrap readback proves one active admin and the expected role/permission seed."
  type        = bool
  default     = false
}

variable "reconciliation_execution" {
  description = "Switches the private migration Job to the read-only DEV-032 production/restore reconciliation runner."
  type        = bool
  default     = false
}

variable "reconciliation_execution_acknowledgement" {
  description = "Exact acknowledgement required before the read-only reconciliation runner may execute."
  type        = string
  default     = ""
}

variable "reconciliation_mode" {
  description = "Read-only reconciliation mode: pre_canary, post_smoke or restore."
  type        = string
  default     = "pre_canary"

  validation {
    condition     = contains(["pre_canary", "post_smoke", "restore"], var.reconciliation_mode)
    error_message = "reconciliation_mode must be pre_canary, post_smoke or restore."
  }
}

variable "reconciliation_restore_connection_name" {
  description = "Independent restore-target Cloud SQL connection name. Empty outside restore mode."
  type        = string
  default     = ""

  validation {
    condition     = var.reconciliation_restore_connection_name == "" || can(regex("^jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-restore-[a-z0-9-]{6,40}$", var.reconciliation_restore_connection_name))
    error_message = "Restore reconciliation target must be an isolated ai-pdm-prod-restore-* instance in the production project and region."
  }
}

variable "restore_target_readback_approved" {
  description = "True only after the isolated restore target exists and its project, region and connection name are read back."
  type        = bool
  default     = false
}

variable "migration_runner_source_revision" {
  description = "Exact Git source revision embedded in the migration runner image."
  type        = string
  default     = "0000000000000000000000000000000000000000"

  validation {
    condition     = can(regex("^[a-f0-9]{40}$", var.migration_runner_source_revision))
    error_message = "migration_runner_source_revision must be a 40-character Git SHA."
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

variable "database_tier" {
  description = "Prelaunch Cloud SQL tier. db-f1-micro has no SLA and must be upsized before general availability."
  type        = string
  default     = "db-f1-micro"
}

variable "database_availability_type" {
  description = "Prelaunch Cloud SQL availability. ZONAL has no HA SLA and must be reviewed before general availability."
  type        = string
  default     = "ZONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.database_availability_type)
    error_message = "database_availability_type must be ZONAL or REGIONAL."
  }
}

variable "cloud_run_max_instances" {
  description = "Maximum instances per Cloud Run revision during the prelaunch phase."
  type        = number
  default     = 2

  validation {
    condition     = var.cloud_run_max_instances >= 1 && var.cloud_run_max_instances <= 5
    error_message = "cloud_run_max_instances must remain between 1 and 5."
  }
}

variable "cloud_sql_pool_max" {
  description = "Maximum application PostgreSQL pool size per Cloud Run instance."
  type        = number
  default     = 2

  validation {
    condition     = var.cloud_sql_pool_max >= 1 && var.cloud_sql_pool_max <= 5
    error_message = "cloud_sql_pool_max must remain between 1 and 5."
  }
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
  description = "Production Firebase Auth handler domain. The Hosting pilot requires the same web.app origin."
  type        = string
  default     = "jenfu-ai-pdm-prod.firebaseapp.com"

  validation {
    condition = contains([
      "jenfu-ai-pdm-prod.firebaseapp.com",
      "jenfu-ai-pdm-prod.web.app"
    ], var.firebase_auth_domain)
    error_message = "firebase_auth_domain must be the approved production firebaseapp.com or web.app domain."
  }
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

  validation {
    condition = contains([
      "https://pdm.jenfu.com.tw",
      "https://jenfu-ai-pdm-prod.web.app"
    ], var.session_issuer)
    error_message = "session_issuer must match an approved production browser origin."
  }
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
