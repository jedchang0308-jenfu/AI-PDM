resource "google_project_service" "required" {
  for_each = local.create_resources ? local.required_services : toset([])

  project            = var.production_project_id
  service            = each.key
  disable_on_destroy = false
}

resource "google_compute_network" "pdm" {
  count = local.create_resources ? 1 : 0

  project                 = var.production_project_id
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.required]
}

resource "google_compute_subnetwork" "runtime" {
  count = local.create_resources ? 1 : 0

  project       = var.production_project_id
  name          = "${local.name_prefix}-runtime"
  ip_cidr_range = "10.46.0.0/24"
  region        = var.region
  network       = google_compute_network.pdm[0].id

  private_ip_google_access = true
}

resource "google_compute_global_address" "private_services" {
  count = local.create_resources ? 1 : 0

  project       = var.production_project_id
  name          = "${local.name_prefix}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.pdm[0].id
}

resource "google_service_networking_connection" "private_services" {
  count = local.create_resources ? 1 : 0

  network                 = google_compute_network.pdm[0].id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services[0].name]

  depends_on = [google_project_service.required]
}
