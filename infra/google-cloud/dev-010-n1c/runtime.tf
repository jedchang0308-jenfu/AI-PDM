resource "google_cloud_run_v2_service" "pdm" {
  count = var.enable_runtime ? 1 : 0

  project              = var.project_id
  name                 = local.service_name
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
  default_uri_disabled = false
  invoker_iam_disabled = true
  deletion_protection  = true
  labels               = local.labels

  scaling {
    min_instance_count = 0
    max_instance_count = 2
  }

  template {
    service_account                  = var.runtime_service_account_email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "60s"
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    vpc_access {
      egress = "ALL_TRAFFIC"
      network_interfaces {
        network    = var.foundation_network_name
        subnetwork = var.foundation_subnetwork_name
        tags       = ["ai-pdm-n1c-staging-runtime"]
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
        limits            = { cpu = "1", memory = "1Gi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        timeout_seconds   = 2
        period_seconds    = 5
        failure_threshold = 24
        http_get {
          path = "/api/health/ready"
          port = 8080
        }
      }

      dynamic "env" {
        for_each = local.runtime_environment
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "PDM_SESSION_CURRENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = "dev010-n1c-ai-pdm-session-current"
            version = "latest"
          }
        }
      }
      env {
        name = "PDM_SESSION_PREVIOUS_SECRET"
        value_source {
          secret_key_ref {
            secret  = "dev010-n1c-ai-pdm-session-previous"
            version = "latest"
          }
        }
      }
    }

    containers {
      name  = "cloud-sql-proxy"
      image = var.cloud_sql_proxy_image
      args = [
        "--address=0.0.0.0", "--port=5432", "--private-ip", "--auto-iam-authn",
        "--lazy-refresh", "--structured-logs", "--max-connections=2", var.foundation_connection_name,
      ]
      resources {
        limits   = { cpu = "1", memory = "256Mi" }
        cpu_idle = true
      }
      startup_probe {
        initial_delay_seconds = 1
        timeout_seconds       = 2
        period_seconds        = 3
        failure_threshold     = 20
        tcp_socket { port = 5432 }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.enable_security_resources && var.session_versions_ready
      error_message = "Both out-of-band session secret versions must be verified before runtime creation."
    }
    precondition {
      condition     = var.enable_hosting
      error_message = "Runtime creation requires the exact Firebase Web App and Hosting source in the same candidate."
    }
    precondition {
      condition     = var.foundation_manifest_sha256 != sha256("")
      error_message = "A real content-addressed Platform foundation manifest is required."
    }
  }
}
