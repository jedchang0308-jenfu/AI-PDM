# Thread Handoff: Supabase Connector Refresh for AI_PDM_STAGING

Date: 2026-06-11  
Workspace: `C:\VIBE CODING\AI_PDM`  
Purpose: Start a fresh Codex thread after reconnecting the Supabase connector, verify that the connector can see the new `Jenfu Machinery / AI_PDM_STAGING` project, then continue `DEV-SUPABASE-DB-001` and `DEV-IND-007` safely.

## Paste This Into The New Thread

請接手 AI_PDM 的 Supabase connector refresh / staging migration preflight。請先使用 `supabase`、`pm-dev`、`hcs` 相關規則，並在做任何資料庫修改前先完成只讀驗證。

工作目錄：

```text
C:\VIBE CODING\AI_PDM
```

已由人類確認的 Supabase target：

```text
Supabase organization name / id = Jenfu Machinery / ydxbtstvlunmpjdlrhml
project name = AI_PDM_STAGING
project ID / project ref = qerabudthnnpqvybpcsq
region = ap-northeast-1
是否已確認費用 = 是
這是 staging project 還是 development branch = staging project
```

請先做這三個只讀檢查：

1. 用 Supabase connector 列出 organizations，必須看得到 `Jenfu Machinery / ydxbtstvlunmpjdlrhml`。
2. 用 Supabase connector 列出 projects，必須看得到 `AI_PDM_STAGING / qerabudthnnpqvybpcsq`。
3. 用 Supabase connector 讀取 project `qerabudthnnpqvybpcsq`，必須確認 region 是 `ap-northeast-1` 且狀態可用。

如果以上任一項失敗，請停止，不要跑 SQL、不要 apply migration、不要改 provider pointer，回報 connector 仍未取得新 org/project 權限。

如果三項都成功，請接著讀：

```text
.ai-doc/dev_task.md
.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md
.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md
.ai-doc/reports/pm/supabase-db-migration-replanned-development-document-2026-06-09.md
```

接續任務：

1. 將 `DEV-SUPABASE-DB-001` 的「取得使用者對新 Supabase target 與成本的確認」視為已有人類確認，但仍需補 connector evidence。
2. 將 `DEV-IND-007` 的 disposable / staging target blocker 更新為「target 已提供，待 connector evidence / guard / live compare」。
3. 先跑本機安全檢查，不要直接 apply live SQL：

```powershell
npm.cmd run qc:postgres-shadow-target-guard
npm.cmd run qc:postgres-shadow
npm.cmd run supabase:migrations:sync
npm.cmd run qc:supabase-runtime-migrations
```

4. 只有在 connector 讀取驗證與 target guard 都通過後，才規劃下一步 migration / advisor / schema compare。

重要安全規則：

- 不可使用 `ProJED / knodlkxqpcqyrtgwpdst`。
- 不可使用 `ProJED_TEST / fhisnnufoeulxqrchldf`。
- 不可建立新的 Supabase project 或 branch，因為 `AI_PDM_STAGING` 已由人類建立。
- 不可把 service role、secret key、DB password 寫入 repo、文件或聊天。
- 不可把 `service_role` 或 `sb_secret_*` 放進 `NEXT_PUBLIC_*`。
- 在未驗證 target 身分前，不可 apply migration、不可執行 DB SQL、不可切換 runtime provider。

背景：

- 前一個 thread 重新連接前仍只看得到舊 org `JED / igzdpafkvqqpsyadmage` 與 `ProJED`、`ProJED_TEST`。
- 前一個 thread 直接查 `qerabudthnnpqvybpcsq` 得到 `You do not have permission to perform this action`。
- 使用者已在 Dashboard 截圖確認 `AI_PDM_STAGING` 的 Project ID 是 `qerabudthnnpqvybpcsq`，region 是 `ap-northeast-1`。
- 使用者已確認這是 staging project，不是 development branch。

## Current Task Status

Relevant `dev_task.md` entries:

- `DEV-IND-007` remains `[!]`: SQLite to Postgres / Supabase shadow migration still needs live disposable/staging target evidence, migration apply, live compare, RLS/advisor evidence, and production readiness closure.
- `DEV-SUPABASE-DB-001` remains `[/]`: runtime migration still needs verified AI_PDM staging target, Supabase CLI migration history validation, Postgres runtime provider completion, API regression, RLS/advisor/build/smoke, and later production cutover.

Human blocker now resolved:

- User confirmed `AI_PDM_STAGING` target and cost.

Remaining connector blocker:

- New thread must prove the Supabase connector can actually see `Jenfu Machinery / AI_PDM_STAGING`.

## Evidence To Capture In New Thread

Record these in the next update to `.ai-doc/dev_task.md` or a PM evidence report:

- Supabase connector can list `Jenfu Machinery / ydxbtstvlunmpjdlrhml`.
- Supabase connector can list `AI_PDM_STAGING / qerabudthnnpqvybpcsq`.
- `_get_project` or equivalent read confirms `ap-northeast-1`.
- No DB mutation occurred before target verification.
- `ProJED` and `ProJED_TEST` remain forbidden targets.

## Official Supabase References

- Supabase project ID / project ref is taken from the Dashboard project URL pattern: `https://supabase.com/dashboard/project/<project-id>`.
- Supabase environment guidance uses separate staging and production projects for migration workflows.
- Supabase branches are separate branch environments; this handoff target is a staging project, not a branch.

