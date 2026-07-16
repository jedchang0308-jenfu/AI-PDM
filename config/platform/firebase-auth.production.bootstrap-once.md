# Production Firebase Auth Bootstrap

This JSON is retained only as the audited one-time bootstrap input that created
the production Google provider. It is not the desired-state authority and must
not be included in routine deploy commands.

Firebase CLI Auth configuration cannot represent the complete approved
Email/Password plus email-link setting. Running this bootstrap again sets
Identity Platform `password_required=true`; production Terraform intentionally
reconciles that field to `false` so provider-managed email-link remains enabled
alongside password sign-in.

Rules:

- Terraform under `infra/google-cloud/production` is authoritative for the
  Identity Platform project config and Cloud Run runtime flags.
- Do not run `firebase deploy --only auth` from the root staging `firebase.json`.
- Reusing this bootstrap requires a reviewed production change, an Auth-only
  dry-run, post-deploy Admin API readback and a Terraform plan that restores
  `password_required=false` with zero delete or replace actions.
- Never store or print the generated OAuth client secret.
