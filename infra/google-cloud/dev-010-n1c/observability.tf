resource "google_logging_project_bucket_config" "application" {
  count = var.enable_runtime ? 1 : 0

  project        = var.project_id
  location       = var.region
  bucket_id      = "ai-pdm-staging"
  retention_days = 30
  description    = "Regional AI-PDM shared staging application logs."
}

resource "google_logging_project_sink" "application" {
  count = var.enable_runtime ? 1 : 0

  project     = var.project_id
  name        = "ai-pdm-staging"
  destination = "logging.googleapis.com/${google_logging_project_bucket_config.application[0].id}"
  filter      = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"ai-pdm-stg\""
  # Provider/API readback normalizes project sinks to service-agent mode. The
  # destination stays in-project, so no cross-project IAM grant is required.
  unique_writer_identity = true
}

resource "google_monitoring_alert_policy" "cloud_run_5xx" {
  count = var.enable_runtime ? 1 : 0

  project               = var.project_id
  display_name          = "AI PDM shared staging Cloud Run 5xx"
  combiner              = "OR"
  enabled               = true
  notification_channels = var.alert_notification_channel_ids

  conditions {
    display_name = "5xx responses detected"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.label.service_name = \"ai-pdm-stg\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.label.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "60s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger { count = 1 }
    }
  }

  documentation {
    content   = "Stop N1C acceptance traffic and preserve the exact revision evidence."
    mime_type = "text/markdown"
  }

  lifecycle {
    precondition {
      condition     = length(var.alert_notification_channel_ids) == 1
      error_message = "The N1C Cloud Run 5xx policy must have exactly one verified non-production notification route."
    }
  }
}
