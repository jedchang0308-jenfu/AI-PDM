terraform {
  backend "gcs" {
    bucket = "tfstate-jenfu-platform-prod"
    prefix = "dev-122/openswx-release-readback"
  }
}
