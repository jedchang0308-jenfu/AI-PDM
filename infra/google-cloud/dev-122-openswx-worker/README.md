# AI-PDM DEV-122 OpenSWX owner resources

Local reviewable source; Terraform init/plan/apply and Cloud smoke have not run.
Normal actor is `jedchang0308@jenfu.com.tw`. Resource execution requires one
approved immutable resource plan and fresh capacity evidence. The fixed helper
checks frozen source hashes, project, backend and exact planned addresses before
applying once. Unknown apply is reconciled from own provider resources.

Only the `dev-122/openswx-worker` prefix in existing `tfstate-jenfu-platform-prod`
is used. OAuth is supplied in memory through `GOOGLE_OAUTH_ACCESS_TOKEN`; no ADC,
credential files or backend token arguments. Terraform manages no Secret version.
Reader receives one Secret accessor binding. Dispatch receives no Job/DB/GCS or
Secret grant. App readback and WIF lifecycle roles attach to the exact Job;
there is no project runtime grant or Logging permission added by this package.

Initial Job uses the no-CAD isolation-only entry. Scheduler starts paused.
Bootstrap adds numeric credentials in memory, verifies its self-test execution,
and seals actual template hashes. B installs the normal template before app
candidate release. WIF finalize stays ACTIVATION_PENDING. The normal activation
CLI verifies exact successful empty stdout/source/template and fresh admission
proof, then enables Scheduler. Failure pauses and retains resources/durable jobs;
unknown executions prevent template restoration or another run.

Daily changes use the released normal Job for verified empty-claim drain. The
first bootstrap provider-only exception cannot be used for daily updates.
Daily input binds the prior immutable READY activation and the new A build.
The drain's actual image belongs to the prior source; new selftest/preflight
receipts belong to the new source. DAILY_REFRESH keeps both numeric credential
versions and performs no issuance, registry append or Terraform execution.

The resource receipt producer is this repository's fixed
`scripts/dev122-openswx-bootstrap.mjs --stage resources --input-ref <own-immutable-json> --input-sha256 <sha256>`.
It is not an existing generic Terraform workflow. Only after resource approval,
it copies the three frozen Terraform files into its verified task-owned temp
directory and runs `terraform init -input=false -no-color`,
`terraform plan -input=false -no-color -out=owned.tfplan`, then
`terraform show -json owned.tfplan`. The plan must contain exactly the twelve
fixed addresses with create/no-op actions; apply consumes only that binary plan.
The immutable apply-request latch precedes the single
`terraform apply -input=false -no-color -auto-approve owned.tfplan` attempt.
A lost response permits provider readback only. Resource approval is still
required; source/format tests are not provider or authorization receipts.
