# Supabase Local Env And Live Smoke Runbook - 2026-06-26

## Purpose

Keep long-lived local Supabase staging connection settings in an ignored local file, while keeping live-smoke approval as an explicit one-time operator action.

This prevents retyping connection strings in every Codex/session without making live database access the default behavior.

## Files And Safety Boundary

Use one of these ignored local files:

- Preferred: `secrets/pdm-staging.env`
- Also supported: `.env.local`
- Override path for special cases: set `PDM_LOCAL_ENV_FILE=<path-to-env-file>`

These files are ignored by Git through `.gitignore`. Do not commit them and do not paste their contents into `.ai-doc`, chat, screenshots, or issue trackers.

Do not store `PDM_RUNTIME_SMOKE_APPROVED=true` in any file. The approval must be injected only for the current command.

Do not keep `PDM_DB_PROVIDER=postgres` as the regular project default. The approved wrapper injects it only for the approved smoke preflight.

## Human Setup Steps

### 1. Confirm the Supabase project

1. Open [Supabase Dashboard](https://supabase.com/dashboard).
2. Select the intended staging project.
3. Confirm the browser URL contains the project ref, for example:
   - `https://supabase.com/dashboard/project/<project-ref>`
4. Confirm this is the AI PDM staging project, not `ProJED`, `ProJED_TEST`, or production.

The project ref is the string after `/project/` in the dashboard URL.

### 2. Find the Postgres connection string

Use the official Supabase connection UI:

1. In the selected project, click **Connect** at the top of the Supabase project dashboard.
2. For local smoke/runtime use, copy one of:
   - **Direct connection** if your network supports IPv6 or the project has the IPv4 add-on.
   - **Session pooler** if your network is IPv4-only.
3. Replace `[YOUR-PASSWORD]` in the copied connection string with the database password.

The placeholder must be fully removed. A value that still contains `[YOUR-PASSWORD]`, `[password]`, or `<password>` is not valid and must not pass live smoke.

If the database password contains special characters such as `#`, `@`, `:`, `/`, `?`, `&`, or `%`, URL-encode the password before putting it into the connection string. In PowerShell, encode only the password value with:

```powershell
[System.Uri]::EscapeDataString('paste-the-password-here')
```

Then replace only the password segment in the Supabase connection string with the encoded result.

Official reference: https://supabase.com/docs/guides/database/connecting-to-postgres

### 3. Find or reset the database password

1. In the Supabase project dashboard, open **Project Settings**.
2. Open **Database**.
3. Use the database password shown/reset workflow there.
4. If the password is unknown, reset it, then update the local ignored env file.

Official reference: https://supabase.com/docs/guides/database/connecting-to-postgres

### 4. Create the ignored local env file

Create `C:\VIBE CODING\AI_PDM\secrets\pdm-staging.env` with this shape:

```env
PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING
PDM_POSTGRES_URL=postgresql://postgres:[password]@[host]:5432/postgres
PDM_POSTGRES_SHADOW_URL=postgresql://postgres:[password]@[shadow-host]:5432/postgres
PDM_POSTGRES_POOLER_MODE=direct
```

Notes:

- `PDM_POSTGRES_URL` is the approved staging runtime database.
- `PDM_POSTGRES_SHADOW_URL` must be a disposable or approved shadow target for comparison/migration checks.
- If using session pooler, set `PDM_POSTGRES_POOLER_MODE=session`.
- If using direct connection, set `PDM_POSTGRES_POOLER_MODE=direct`.
- Do not put production connection strings in this staging file.

### 5. Check local configuration without approval

Run:

```powershell
npm.cmd run env:supabase-local:check
```

Expected:

- `secrets/pdm-staging.env` exists.
- `PDM_SUPABASE_TARGET_NAME` shows `AI_PDM_STAGING`.
- `PDM_POSTGRES_URL` and `PDM_POSTGRES_SHADOW_URL` show `<configured len=...>`.
- `PDM_RUNTIME_SMOKE_APPROVED` is `<missing>`.
- The connection strings do not contain `[YOUR-PASSWORD]`, `[password]`, or `<password>`.

### 6. Run non-approved preflight

Run:

```powershell
npm.cmd run qc:supabase-runtime-smoke-preflight:local
```

Expected:

- Target and URLs are configured.
- The only remaining blockers should be approval/provider blockers.
- No hazards should appear.
- If the output mentions password placeholders or invalid connection URIs, update `secrets/pdm-staging.env` before continuing.

### 7. Run explicitly approved preflight

Run only when PM/operator approves touching the staging target:

```powershell
npm.cmd run qc:supabase-runtime-smoke-preflight:approved
```

Expected:

- `status` is `ready`.
- `readyForRuntimeSmoke` is `true`.
- `blockers` is empty.
- `hazards` is empty.

This command injects `PDM_RUNTIME_SMOKE_APPROVED=true` and `PDM_DB_PROVIDER=postgres` only for that child process.

## What Codex Can Do After Setup

After the human setup is done, Codex can:

- Run the local config check.
- Run the approved preflight after explicit approval.
- Run schema/RLS compare and secret-boundary QC.
- Prepare evidence reports.
- Execute staging smoke only after approval and only against the confirmed staging target.

## What Remains Human-Controlled

- Choosing or creating the Supabase project.
- Confirming cost and region for any new project.
- Supplying database passwords or connection strings.
- Approving `PDM_RUNTIME_SMOKE_APPROVED=true` for each live smoke.
- Production/cutover go/no-go.
