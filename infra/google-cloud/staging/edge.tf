resource "google_compute_region_network_endpoint_group" "pdm" {
  count = local.create_edge_resources ? 1 : 0

  project               = var.staging_project_id
  name                  = "${local.name_prefix}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.pdm[0].name
  }
}

resource "google_compute_backend_service" "application" {
  count = local.create_edge_resources ? 1 : 0

  project               = var.staging_project_id
  name                  = "${local.name_prefix}-app"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  enable_cdn            = false

  backend {
    group = google_compute_region_network_endpoint_group.pdm[0].id
  }

  log_config {
    enable      = true
    sample_rate = 1
  }
}

resource "google_compute_backend_service" "immutable_static" {
  count = local.create_edge_resources ? 1 : 0

  project               = var.staging_project_id
  name                  = "${local.name_prefix}-immutable-static"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  enable_cdn            = true

  backend {
    group = google_compute_region_network_endpoint_group.pdm[0].id
  }

  cdn_policy {
    cache_mode        = "USE_ORIGIN_HEADERS"
    negative_caching  = false
    serve_while_stale = 0

    cache_key_policy {
      include_host         = true
      include_protocol     = true
      include_query_string = false
    }
  }

  log_config {
    enable      = true
    sample_rate = 1
  }
}

resource "google_compute_url_map" "https" {
  count = local.create_edge_resources ? 1 : 0

  project         = var.staging_project_id
  name            = "${local.name_prefix}-https"
  default_service = google_compute_backend_service.application[0].id

  host_rule {
    hosts        = [var.staging_domain]
    path_matcher = "pdm"
  }

  path_matcher {
    name            = "pdm"
    default_service = google_compute_backend_service.application[0].id

    path_rule {
      paths   = ["/_next/static/*"]
      service = google_compute_backend_service.immutable_static[0].id
    }
  }
}

resource "google_compute_url_map" "http_redirect" {
  count = local.create_edge_resources ? 1 : 0

  project = var.staging_project_id
  name    = "${local.name_prefix}-http-redirect"

  default_url_redirect {
    https_redirect = true
    strip_query    = false
  }
}

resource "google_compute_managed_ssl_certificate" "pdm" {
  count = local.create_edge_resources ? 1 : 0

  project = var.staging_project_id
  name    = "${local.name_prefix}-managed-tls"

  managed {
    domains = [var.staging_domain]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_global_address" "pdm" {
  count = local.create_edge_resources ? 1 : 0

  project      = var.staging_project_id
  name         = "${local.name_prefix}-ipv4"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"
}

resource "google_compute_target_https_proxy" "pdm" {
  count = local.create_edge_resources ? 1 : 0

  project          = var.staging_project_id
  name             = "${local.name_prefix}-https"
  url_map          = google_compute_url_map.https[0].id
  ssl_certificates = [google_compute_managed_ssl_certificate.pdm[0].id]
}

resource "google_compute_target_http_proxy" "redirect" {
  count = local.create_edge_resources ? 1 : 0

  project = var.staging_project_id
  name    = "${local.name_prefix}-http-redirect"
  url_map = google_compute_url_map.http_redirect[0].id
}

resource "google_compute_global_forwarding_rule" "https" {
  count = local.create_edge_resources ? 1 : 0

  project               = var.staging_project_id
  name                  = "${local.name_prefix}-https"
  target                = google_compute_target_https_proxy.pdm[0].id
  ip_address            = google_compute_global_address.pdm[0].id
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_compute_global_forwarding_rule" "http" {
  count = local.create_edge_resources ? 1 : 0

  project               = var.staging_project_id
  name                  = "${local.name_prefix}-http"
  target                = google_compute_target_http_proxy.redirect[0].id
  ip_address            = google_compute_global_address.pdm[0].id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
