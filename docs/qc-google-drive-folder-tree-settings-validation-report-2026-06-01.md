# QC Fact Report: Google Drive Folder Tree Settings

Task: `DEV-GDRIVE-001`
Validation plan: `docs/qa-google-drive-folder-tree-settings-validation-plan-2026-06-01.md`

## 驗證結論

Pass.

## 執行項目

- `npm.cmd run qc:gdrive-folder-tree-settings`
- `npm.cmd run qc:release-folders`
- `npm.cmd run qc:pdm-numbering-settings-ui` with `PDM_BASE_URL=http://127.0.0.1:3132`
- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run lint`
- `cmd /c npm.cmd run build`

## 實際結果

| Check | Result | Evidence |
|---|---:|---|
| GDrive folder tree QC | Pass | 35/35 passed |
| Existing release folder compatibility | Pass | 10/10 passed |
| Existing settings UI regression | Pass | 22/22 passed |
| TypeScript | Pass | exit code 0; build TypeScript phase also completed |
| Lint | Pass | exit code 0 |
| Production build | Pass | exit code 0; route manifest includes GDrive folder list and verify routes |

## 證據

- `gdrive.ts` exposes folder list and folder verify functions.
- Folder list API uses `supportsAllDrives=true` and `includeItemsFromAllDrives=true`.
- Folder list and verify routes are Admin-only.
- Engineer calling folder list API receives HTTP 403.
- Mock Drive root folder list returns only folder nodes, not files.
- Verify API returns `Google Drive / AI_PDM / 00_Pending` path snapshot and `canUpload: true`.
- Verify API rejects a non-folder target with HTTP 400.
- Settings API rejects same pending/released Folder ID with HTTP 400.
- Settings API saves `gdrive_pending_folder_*` and `gdrive_released_folder_*` metadata snapshots.
- `/settings` renders folder tree and detail panel at desktop and mobile widths.
- Desktop UI flow verifies `00_Pending`, verifies `10_Released`, and saves settings successfully.
- Desktop and mobile checks show 0px page-level horizontal overflow and no browser console errors.
- Existing `qc:release-folders` confirms legacy POST of Folder IDs still overrides env Pending/Released folders.
- Existing `qc:pdm-numbering-settings-ui` confirms approval matrix settings remains usable and no longer receives console 503 errors when service account is not configured.

## 問題與阻塞

- No blocker in this validation round.
- Production build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this GDrive settings work and remain non-fatal.

## 清理

- `qc:gdrive-folder-tree-settings` uses temporary `PDM_DATA_DIR` / `PDM_REPOSITORY_DIR` and stops its mock Drive server plus Next dev server.
- The manually started 3132 regression server was stopped after `qc:pdm-numbering-settings-ui`; only transient `TIME_WAIT` rows remained.
