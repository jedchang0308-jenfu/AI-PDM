# DEV-010 N1C AI-PDM app state

This root owns only `ai-pdm-stg`, its singleton migration job, its two
session-signing Secret containers, AI-PDM logging/alerts, and the exact
`jenfu-platform-nonprod-pdm` Firebase web app/Hosting site. It consumes a
content-addressed Platform foundation receipt and never owns the project,
network, Cloud SQL instance, logical database, Identity Platform config,
budget, or shared alerts.

All create switches default to `false`. Initialization for validation must use
`-backend=false`; provider execution must use the managed N1C release adapter
with the remote-state prefix `dev-010/n1c/ai-pdm`. Secret values, OAuth client
secrets, Hosting deploy, traffic acceptance, and old-project retirement are not
performed by this root.

The AI-PDM Cloud Run 5xx alert must route to the existing N1B notification
channel `projects/jenfu-platform-nonprod/notificationChannels/11944193246311159138`.
An enabled 5xx policy with no notification channel is invalid: Terraform blocks
that configuration before apply so a visually present but silent alert cannot
be released.
