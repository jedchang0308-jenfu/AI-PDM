resource "google_artifact_registry_repository" "pdm" {
  count = local.create_resources ? 1 : 0

  project       = var.production_project_id
  location      = var.region
  repository_id = "ai-pdm"
  description   = "Immutable AI PDM production images"
  format        = "DOCKER"
  labels        = var.labels

  cleanup_policy_dry_run = true

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service" "pdm" {
  count = local.create_resources ? 1 : 0

  project              = var.production_project_id
  name                 = local.name_prefix
  location             = var.region
  ingress              = var.enable_firebase_hosting_gateway ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  default_uri_disabled = !var.enable_firebase_hosting_gateway
  invoker_iam_disabled = true
  deletion_protection  = true
  labels               = var.labels

  scaling {
    min_instance_count = 0
    max_instance_count = var.cloud_run_max_instances
  }

  template {
    service_account                  = google_service_account.runtime[0].email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "60s"
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = 0
      max_instance_count = var.cloud_run_max_instances
    }

    vpc_access {
      egress = "ALL_TRAFFIC"

      network_interfaces {
        network    = google_compute_network.pdm[0].name
        subnetwork = google_compute_subnetwork.runtime[0].name
        tags       = ["ai-pdm-production-runtime"]
      }
    }

    containers {
      name       = "ai-pdm"
      image      = var.application_image
      depends_on = ["cloud-sql-proxy"]

      ports {
        name           = "http1"
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 2
        period_seconds        = 5
        failure_threshold     = 24

        http_get {
          path = "/login"
          port = 8080
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PDM_AUTH_MODE"
        value = "firebase_bff"
      }

      env {
        name  = "PDM_PRODUCTION_SLICE_MODE"
        value = "official-numbering-draft"
      }

      env {
        name  = "PDM_DB_PROVIDER"
        value = "cloud_sql_postgres"
      }

      env {
        name  = "PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME"
        value = google_sql_database_instance.pdm[0].connection_name
      }

      env {
        name  = "PDM_CLOUD_SQL_HOST"
        value = "127.0.0.1"
      }

      env {
        name  = "PDM_CLOUD_SQL_PORT"
        value = "5432"
      }

      env {
        name  = "PDM_CLOUD_SQL_DATABASE"
        value = local.database
      }

      env {
        name  = "PDM_CLOUD_SQL_USER"
        value = trimsuffix(google_service_account.runtime[0].email, ".gserviceaccount.com")
      }

      env {
        name  = "PDM_CLOUD_SQL_POOL_MAX"
        value = tostring(var.cloud_sql_pool_max)
      }

      env {
        name  = "PDM_PUBLIC_BASE_URL"
        value = var.runtime_public_base_url
      }

      # Candidate revisions are reached through Cloud Run tag URLs during the
      # zero-traffic release gate. Keep this service-specific and tag-shaped;
      # do not allow arbitrary *.a.run.app origins.
      env {
        name  = "PDM_CANDIDATE_CLOUD_RUN_SERVICE"
        value = local.name_prefix
      }

      env {
        name  = "PDM_COOKIE_SECURE"
        value = "true"
      }

      env {
        name  = "PDM_FIREBASE_API_KEY"
        value = var.firebase_web_api_key
      }

      env {
        name  = "PDM_FIREBASE_AUTH_DOMAIN"
        value = var.firebase_auth_domain
      }

      env {
        name  = "PDM_FIREBASE_PROJECT_ID"
        value = var.production_project_id
      }

      env {
        name  = "PDM_FIREBASE_APP_ID"
        value = var.firebase_web_app_id
      }

      env {
        name  = "PDM_TRUST_GOOGLE_WORKSPACE_MFA"
        value = var.trust_google_workspace_mfa ? "true" : "false"
      }

      env {
        name  = "PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED"
        value = var.allow_google_workspace_aal1_privileged ? "true" : "false"
      }

      env {
        name  = "PDM_GOOGLE_WORKSPACE_DOMAINS"
        value = join(",", var.google_workspace_domains)
      }

      env {
        name  = "PDM_SESSION_ISSUER"
        value = var.session_issuer
      }

      env {
        name  = "PDM_SESSION_AUDIENCE"
        value = var.session_audience
      }

      env {
        name  = "PDM_SESSION_CURRENT_KEY_ID"
        value = var.session_current_key_id
      }

      env {
        name  = "PDM_SESSION_PREVIOUS_KEY_ID"
        value = var.session_previous_key_id
      }

      env {
        name = "PDM_SESSION_CURRENT_SECRET"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.session_signing["pdm-session-signing-current"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "PDM_SESSION_PREVIOUS_SECRET"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.session_signing["pdm-session-signing-previous"].secret_id
            version = "latest"
          }
        }
      }
    }

    containers {
      name  = "cloud-sql-proxy"
      image = var.cloud_sql_proxy_image
      args = [
        "--address=0.0.0.0",
        "--port=5432",
        "--private-ip",
        "--auto-iam-authn",
        "--lazy-refresh",
        "--structured-logs",
        "--max-connections=5",
        google_sql_database_instance.pdm[0].connection_name
      ]

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        initial_delay_seconds = 1
        timeout_seconds       = 2
        period_seconds        = 3
        failure_threshold     = 20

        tcp_socket {
          port = 5432
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
    # Terraform owns service configuration; the reviewed GitHub release workflow owns only the ingress image revision.
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [
    google_project_iam_member.runtime,
    google_secret_manager_secret_iam_member.runtime_session_signing,
    google_sql_user.runtime_iam
  ]
}
