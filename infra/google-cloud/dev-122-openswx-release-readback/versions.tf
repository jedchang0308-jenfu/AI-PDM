terraform {
  required_version = "~> 1.14.0"
  required_providers {
    google = { source = "hashicorp/google", version = "7.39.0" }
  }
}
provider "google" {
  project               = "jenfu-platform-prod"
  region                = "asia-east1"
  billing_project       = "jenfu-platform-prod"
  user_project_override = true
}
