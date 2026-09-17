# DEV-013 AI-PDM managed staging Infra A

This root owns only the AI-PDM DEV-013 non-production state prefix, Artifact Registry repository, evidence bucket, and exact repository/bucket IAM members. It never owns or imports `ai-pdm-stg`; the service remains under the AI-PDM owner-native release adapter.

The source-frozen `OWNER_INFRA_A` saved plan must contain the profile's exact eight data/resource addresses once each, bind the exact source revision/tree, Platform manifest v2 hash, handoff contract hash, and provider-readback foundation receipt bytes plus their exact owner-bucket publication URI, and contain only `create`, `read`, or `no-op` actions. Run `npm run verify:dev-013:l3:infra-plan` against the saved JSON plan before any separately authorized apply.

Local checks do not apply Terraform, create cloud resources, read Secret payloads, publish images, patch Cloud Run, or move traffic.

The existing `ai-pdm-stg` service is owner-native and is not imported into this Terraform state. Cloud Run v2 has no service `deletionProtection` API field; the similarly named Terraform argument only prevents Terraform destroy. The baseline adapter therefore permits only an etag-bound `traffic` patch that pins `latest=100%` to the exact ready revision. Delete operations remain forbidden by the owner workflow policy and are recorded as zero in the plan and receipt.
