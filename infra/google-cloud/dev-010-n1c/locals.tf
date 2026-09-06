locals {
  canonical_origin   = "https://jenfu-platform-nonprod-pdm.web.app"
  database           = "jenfu_stg"
  environment_marker = "JENFU_ENVIRONMENT=staging;DEV=DEV-010;SLICE=N1C"
  hosting_site       = "jenfu-platform-nonprod-pdm"
  service_name       = "ai-pdm-stg"
  labels = {
    application = "ai-pdm"
    dev_id      = "dev-010"
    environment = "staging"
    managed_by  = "terraform"
  }
  session_secrets = toset([
    "dev010-n1c-ai-pdm-session-current",
    "dev010-n1c-ai-pdm-session-previous",
  ])
  runtime_environment = {
    NODE_ENV                               = "production"
    PDM_DB_PROVIDER                        = "cloud_sql_postgres"
    DEV010_N1C_TARGET_GUARD                = "required"
    DEV010_N1C_RUN_ID                      = var.source_revision
    PDM_BUILD_COMMIT                       = var.source_revision
    PDM_DEPLOYMENT_ENV                     = "staging"
    GOOGLE_CLOUD_PROJECT                   = var.project_id
    GOOGLE_CLOUD_REGION                    = var.region
    PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME = var.foundation_connection_name
    PDM_CLOUD_SQL_HOST                     = "127.0.0.1"
    PDM_CLOUD_SQL_PORT                     = "5432"
    PDM_CLOUD_SQL_DATABASE                 = local.database
    PDM_CLOUD_SQL_USER                     = trimsuffix(var.runtime_service_account_email, ".gserviceaccount.com")
    PDM_CLOUD_SQL_POOL_MAX                 = "2"
    PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS    = "10000"
    PDM_CLOUD_SQL_IDLE_TIMEOUT_MS          = "600000"
    PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS     = "30000"
    PDM_CLOUD_SQL_QUERY_TIMEOUT_MS         = "35000"
    PDM_DATABASE_ENVIRONMENT_MARKER        = local.environment_marker
    PDM_AUTH_MODE                          = "firebase_bff"
    PDM_PUBLIC_BASE_URL                    = local.canonical_origin
    PDM_COOKIE_SECURE                      = "true"
    PDM_FIREBASE_API_KEY                   = var.firebase_web_api_key
    PDM_FIREBASE_AUTH_DOMAIN               = "jenfu-platform-nonprod-pdm.web.app"
    PDM_FIREBASE_PROJECT_ID                = var.project_id
    PDM_FIREBASE_APP_ID                    = var.enable_hosting ? google_firebase_web_app.pdm[0].app_id : ""
    PDM_SESSION_ISSUER                     = local.canonical_origin
    PDM_SESSION_AUDIENCE                   = "ai-pdm-staging"
    PDM_SESSION_CURRENT_KEY_ID             = "n1c-staging-current"
    PDM_SESSION_PREVIOUS_KEY_ID            = "n1c-staging-previous"
    PDM_STORAGE_PROVIDER                   = "local_repository"
    PDM_SMOKE_GCS_WRITER                   = "disabled"
    PDM_SMOKE_OUTBOX_CONSUMER              = "disabled"
    PDM_SMOKE_EXTERNAL_NOTIFICATION        = "disabled"
  }
  migration_environment = {
    DEV010_N1C_EXECUTION_ACK               = "AI_PDM_STAGING_MIGRATION"
    DEV010_N1C_SOURCE_REVISION             = var.source_revision
    PDM_DEPLOYMENT_ENV                     = "staging"
    GOOGLE_CLOUD_PROJECT                   = var.project_id
    GOOGLE_CLOUD_REGION                    = var.region
    PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME = var.foundation_connection_name
    PDM_CLOUD_SQL_HOST                     = "127.0.0.1"
    PDM_CLOUD_SQL_PORT                     = "5432"
    PDM_CLOUD_SQL_DATABASE                 = local.database
    PDM_CLOUD_SQL_USER                     = trimsuffix(var.migration_service_account_email, ".gserviceaccount.com")
    PDM_DATABASE_ENVIRONMENT_MARKER        = local.environment_marker
  }
}
