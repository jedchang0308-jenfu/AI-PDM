# Defect disposition

- Original P0: confirmation modal could not be dismissed and could click-through to the detail drawer.
- Root cause: document-level drawer `pointerdown` outside-click listener ran before React delegated modal click.
- Disposition: fixed by native capture shielding on `ConfirmDialog` backdrop plus a close-button native click bridge. No API, schema, permission or lifecycle authority changed.
- Remaining gate: shared-data mutation was not executed; parent DEV-057 full PASS still requires an isolated disposable UI mutation run.
