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

resource "google_billing_budget" "production" {
  count = local.create_resources ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "AI PDM production monthly budget"

  budget_filter {
    projects = ["projects/${var.production_project_id}"]
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
    disable_default_iam_recipients    = true
  }
}
