resource "google_logging_project_bucket_config" "application" {
  count = local.create_resources ? 1 : 0

  project        = var.staging_project_id
  location       = var.region
  bucket_id      = "pdm-application"
  retention_days = 30
  description    = "Regionalized AI PDM staging application logs."

  depends_on = [google_project_service.required]
}
# Phase 2B must import the existing _Default sink before this resource is
# planned. It must never be allowed to create a duplicate sink implicitly.
resource "google_logging_project_sink" "default" {
  count = local.create_resources ? 1 : 0

  project                = var.staging_project_id
  name                   = "_Default"
  destination            = "logging.googleapis.com/${google_logging_project_bucket_config.application[0].id}"
  unique_writer_identity = true
}

resource "google_monitoring_alert_policy" "cloud_run_5xx" {
  count = local.create_resources ? 1 : 0

  project      = var.staging_project_id
  display_name = "AI PDM staging Cloud Run 5xx"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "5xx responses detected"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.label.service_name = \"${local.name_prefix}\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.label.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "60s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.alert_notification_channel_ids

  documentation {
    content   = "Stop official numbering writes, preserve evidence, and start the DEV-046 containment checklist."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "cloud_sql_connections" {
  count = local.create_resources ? 1 : 0

  project      = var.staging_project_id
  display_name = "AI PDM staging Cloud SQL connection reserve"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Cloud SQL connections exceed 70 percent"

    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND resource.label.database_id = \"${var.staging_project_id}:${local.name_prefix}-postgres\" AND metric.type = \"cloudsql.googleapis.com/database/network/connections\""
      comparison      = "COMPARISON_GT"
      threshold_value = 70
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.alert_notification_channel_ids
}
