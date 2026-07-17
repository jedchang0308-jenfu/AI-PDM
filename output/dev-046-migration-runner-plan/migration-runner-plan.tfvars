enable_resource_creation = true
enable_secret_container_bootstrap = true
enable_migration_runner_job = true
session_secret_versions_ready = true
phase2_change_ticket = "CHG-DEV046-PHASE2B-20260714"
phase2_apply_acknowledgement = "DEV-046-PHASE-2B-APPROVED"
migration_runner_job_acknowledgement = "DEV-046-STAGING-MIGRATION-RUNNER-JOB-REVIEWED"
staging_project_id = "jenfu-ai-pdm-stg-361825"
staging_project_number = "1042387036944"
production_project_id = "jenfu-ai-pdm-prod"
billing_account_id = "018678-C2F032-7680E4"
billing_budget_currency_code = "TWD"
billing_budget_units = 9600
staging_domain = "pdm-stg.jenfu.com.tw"
firebase_web_api_key = "AIzaSyBV4QkOBrY5bKgHd772AgaHrNG2vylEim4"
firebase_auth_domain = "jenfu-ai-pdm-stg-361825.web.app"
firebase_web_app_id = "1:1042387036944:web:dc5bf62bb50038c7ac9395"
budget_notification_channel_ids = [
  "projects/jenfu-ai-pdm-stg-361825/notificationChannels/15841691760201666651",
  "projects/jenfu-ai-pdm-stg-361825/notificationChannels/17676567600118091364"
]
alert_notification_channel_ids = [
  "projects/jenfu-ai-pdm-stg-361825/notificationChannels/15841691760201666651",
  "projects/jenfu-ai-pdm-stg-361825/notificationChannels/17676567600118091364"
]
application_image = "asia-east1-docker.pkg.dev/jenfu-ai-pdm-stg-361825/ai-pdm/ai-pdm@sha256:cf36fa4f6bc68a59db7f632dd9c7df3e81b84ac28cf7c5a5a11034408d7920c3"
migration_runner_image = "asia-east1-docker.pkg.dev/jenfu-ai-pdm-stg-361825/ai-pdm/ai-pdm-migration@sha256:8794eae1ff71807dd69166f8db2e81b42f99ecbc79911271b48e7a1ff7dc1a1c"
