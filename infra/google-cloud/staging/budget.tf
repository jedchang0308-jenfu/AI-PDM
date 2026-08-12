resource "google_billing_budget" "staging" {
  count = local.create_resources ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "AI PDM staging monthly budget"

  budget_filter {
    projects = ["projects/${var.staging_project_number}"]
  }

  amount {
    specified_amount {
      currency_code = var.billing_budget_currency_code
      units         = tostring(var.billing_budget_units)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.8
  }

  threshold_rules {
    threshold_percent = 1
  }

  all_updates_rule {
    monitoring_notification_channels = var.budget_notification_channel_ids
    disable_default_iam_recipients   = false
  }

  depends_on = [google_project_service.required]
}
