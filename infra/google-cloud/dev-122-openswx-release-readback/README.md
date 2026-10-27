# DEV-125 OpenSWX readback retirement

DEV-125 removed the ten OpenSWX-only readback declarations from this Terraform
root. The two `aipdmDev122PrebuildList` resources in
`prebuild-list-readback.tf` are shared release controls and remain protected.

The exact saved plan may contain only ten delete actions for the retired
OpenSWX resources. Both shared prebuild resources must remain no-op. After
provider readback proves the ten resources are absent, this root remains as the
owner of the shared prebuild controls and must not be destroyed.
