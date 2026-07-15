resource "google_logging_project_bucket_config" "application" {
  count = local.create_resources ? 1 : 0

  project        = var.production_project_id
  location       = var.region
  bucket_id      = "pdm-application"
  retention_days = 30
  description    = "Regionalized AI PDM production application logs."

  depends_on = [google_project_service.required]
}

# Import the existing _Default sink before the first production plan. Creating
# a second default sink is forbidden.
resource "google_logging_project_sink" "default" {
  count = local.create_resources ? 1 : 0

  project                = var.production_project_id
  name                   = "_Default"
  destination            = "logging.googleapis.com/${google_logging_project_bucket_config.application[0].id}"
  unique_writer_identity = true

  lifecycle {
    # Preserve Google's existing _Default audit exclusions during destination regionalization.
    ignore_changes = [filter]
  }
}

resource "google_monitoring_alert_policy" "cloud_run_errors" {
  count = local.create_resources ? 1 : 0

  project      = var.production_project_id
  display_name = "AI PDM production Cloud Run 5xx"
  combiner     = "OR"
  enabled      = true
  severity     = "ERROR"

  notification_channels = var.alert_notification_channel_ids

  conditions {
    display_name = "Cloud Run request count 5xx"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "cloud_sql_connections" {
  count = local.create_resources ? 1 : 0

  project      = var.production_project_id
  display_name = "AI PDM production Cloud SQL connection reserve"
  combiner     = "OR"
  enabled      = true
  severity     = "WARNING"

  notification_channels = var.alert_notification_channel_ids

  conditions {
    display_name = "Cloud SQL connections exceed 70 percent"

    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.label.database_id=\"${var.production_project_id}:${local.cloud_sql_instance_name}\" AND metric.type=\"cloudsql.googleapis.com/database/network/connections\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 70

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
}

resource "google_billing_budget" "production" {
  count = local.create_resources ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "AI PDM production monthly budget"

  budget_filter {
    projects = ["projects/${var.production_project_number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_usd)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.8
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    monitoring_notification_channels = var.budget_notification_channel_ids
    disable_default_iam_recipients   = true
  }
}
