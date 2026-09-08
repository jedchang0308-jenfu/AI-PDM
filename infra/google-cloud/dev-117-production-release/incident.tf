resource "google_pubsub_topic" "incident" {
  count   = var.incident_runtime_enabled ? 1 : 0
  project = var.project_id
  name    = local.incident_topic
  labels  = local.labels
}

resource "google_pubsub_topic_iam_member" "monitoring_publisher" {
  count   = var.incident_runtime_enabled ? 1 : 0
  project = var.project_id
  topic   = google_pubsub_topic.incident[0].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-monitoring-notification.iam.gserviceaccount.com"
}

resource "google_pubsub_topic_iam_member" "release_publisher" {
  count   = var.incident_runtime_enabled ? 1 : 0
  project = var.project_id
  topic   = google_pubsub_topic.incident[0].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "pubsub_token_creator" {
  count              = var.incident_runtime_enabled ? 1 : 0
  service_account_id = google_service_account.invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_cloud_run_v2_service" "abort_controller" {
  count               = var.incident_runtime_enabled ? 1 : 0
  project             = var.project_id
  location            = var.region
  name                = local.controller_service
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = true
  labels              = merge(local.labels, { component = "abort-controller" })

  template {
    service_account                  = google_service_account.controller.email
    max_instance_request_concurrency = 1
    timeout                          = "60s"
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      name  = "controller"
      image = var.controller_image_digest
      ports { container_port = 8080 }
      env {
        name  = "OWNER_APPLICATION_ID"
        value = "ai-pdm"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_REGION"
        value = var.region
      }
      env {
        name  = "APPLICATION_SERVICE_NAME"
        value = var.application_service_name
      }
      env {
        name  = "RELEASE_BUCKET"
        value = var.release_bucket_name
      }
      env {
        name  = "GITHUB_REPOSITORY"
        value = local.github_repository
      }
      env {
        name  = "CONTROLLER_AUDIENCE"
        value = local.controller_audience
      }
      env {
        name  = "INVOKER_SERVICE_ACCOUNT"
        value = google_service_account.invoker.email
      }
      env {
        name = "GITHUB_READ_TOKEN"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.controller_github_token.secret_id
            version = coalesce(var.github_read_token_secret_version, "0")
          }
        }
      }
      resources { limits = { cpu = "1", memory = "256Mi" } }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.controller_github_token_accessor]
}

resource "google_cloud_run_v2_service_iam_member" "abort_invoker" {
  count    = var.incident_runtime_enabled ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.abort_controller[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.invoker.email}"
}

resource "google_pubsub_subscription" "abort_push" {
  count                      = var.incident_runtime_enabled ? 1 : 0
  project                    = var.project_id
  name                       = "aipdm-prod-release-abort"
  topic                      = google_pubsub_topic.incident[0].id
  ack_deadline_seconds       = 60
  message_retention_duration = "86400s"
  labels                     = local.labels

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.abort_controller[0].uri}/events"
    oidc_token {
      service_account_email = google_service_account.invoker.email
      audience              = local.controller_audience
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "60s"
  }

  depends_on = [
    google_cloud_run_v2_service_iam_member.abort_invoker,
    google_service_account_iam_member.pubsub_token_creator,
  ]
}

resource "google_monitoring_notification_channel" "incident_events" {
  count        = var.incident_runtime_enabled ? 1 : 0
  project      = var.project_id
  display_name = "AI-PDM release incident events"
  type         = "pubsub"
  labels = {
    topic = google_pubsub_topic.incident[0].id
  }
  enabled = true

  depends_on = [google_pubsub_topic_iam_member.monitoring_publisher]
}

resource "google_monitoring_notification_channel" "incident" {
  count        = var.incident_runtime_enabled ? 1 : 0
  project      = var.project_id
  display_name = "AI-PDM release incident email"
  type         = "email"
  labels = {
    email_address = var.approved_notification_email
  }
  enabled = true
}

resource "google_cloud_scheduler_job" "watchdog" {
  count            = var.incident_runtime_enabled ? 1 : 0
  project          = var.project_id
  region           = var.region
  name             = "aipdm-prod-release-watchdog"
  description      = "DEV-012 crash-recovery watchdog for AI-PDM releases"
  schedule         = "* * * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "30s"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.abort_controller[0].uri}/watchdog"
    headers     = { "Content-Type" = "application/json" }
    body        = base64encode(jsonencode({ ownerApplicationId = "ai-pdm" }))
    oidc_token {
      service_account_email = google_service_account.invoker.email
      audience              = local.controller_audience
    }
  }

  retry_config { retry_count = 0 }

  depends_on = [
    google_cloud_run_v2_service_iam_member.abort_invoker,
    google_service_account_iam_member.pubsub_token_creator,
  ]
}
