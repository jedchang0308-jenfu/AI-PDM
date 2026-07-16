# DEV-032 Human Work Package

Generated: 2026-07-16T07:19:41.718Z
Target: `jenfu-ai-pdm-prod`
URL: `https://jenfu-ai-pdm-prod.web.app`

## Reply Template

```text
Wave0 users: jedchang0308@jenfu.com.tw, <user2@jenfu.com.tw>, <user3@jenfu.com.tw>
UI acceptance: PASS for all named users / list exceptions
Non-allowlist test: PASS with account <email> / PENDING no account
Product owner decision: GO / NO-GO
P0/P1: none / list issue
```

## Required Inputs

- `wave0_named_users`: Provide 3-5 named Wave 0 users total. Current list has 1; add at least 2.
- `named_user_ui_acceptance`: For each Wave 0 user, confirm production login, privacy acknowledgement if shown, create draft or formal numbering by role, optional series code for self-made non-shared item, relog persistence, and unopened UI remains disabled.
- `non_allowlist_negative_access`: Use a Google account that is not allowlisted and confirm it cannot enter the production core app. If no safe test account exists, state that this remains pending.
- `product_owner_go_no_go`: Product owner records final go/no-go for the official numbering / draft production slice only.
- `open_p0_p1`: Confirm there are no unresolved P0/P1 issues for the production slice.

## Non-Actions

- Do not configure custom DNS in this closure; Firebase Hosting default URL remains canonical.
- Do not reintroduce the cancelled fixed five-business-day observation gate.
- Do not include GCS file authority, CAD, BOM or full PDM workflows in this release scope.
