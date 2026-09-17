# DEV-118 118-A PDM 本地登入入口 QC Receipt

- 日期：2026-09-17
- 範圍：AI-PDM 本地 118-A；不含 Platform 118-B、正式 118-C
- Branch：`codex/dev-013-ai-pdm`
- 結果：`PASS`（本地切片）

## 通過證據

| 驗證 | 結果 |
|---|---:|
| `npm run qc:dev-118:contract` | 10/10 PASS |
| `npm run qc:dev-118:browser` | 12/12 PASS |
| `npm run test:dev-013` | 3/3 PASS |
| `npm run qc:dev-046-login-alias` | 21/21 PASS |
| `npm run typecheck:app` | PASS |
| `npm run build:isolated` | PASS；artifact／primary invariant／cleanup=true |
| `git diff --check` | PASS |

Browser manifest：`output/qa/dev-118-login-entry/DEV118-browser-2026-09-17T00-48-58-748Z/manifest.json`。
它操作實際編譯登入頁，覆蓋 loading、SSO ready、設定 unavailable、managed compatibility、390×844／748×698 viewport、console/page error sweep、source revision／dirty fingerprint 與 `next-env` 還原；`productionConnected=false`、`productionMutation=false`，未注入成功 session。截圖位於 manifest 同層 `screenshots/`。

## 已落地行為

- SSO 靜態設定由 `auth-config.ts` 單一解析；缺 broker、base、platform mode 或非法 origin／mode 時，`/api/auth/mode` 回固定 503、`no-store`，不降級成 managed。
- SSO ready 時 PDM 只顯示「使用鉦富平台登入」，直接 Google 與一般密碼表單隱藏。
- mode loading／unavailable 不渲染可提交表單；unavailable 顯示就地錯誤與重試，晚回 response 不覆蓋新狀態。
- SSO off／demo／managed compatibility 保留既有入口；工號仍是同一核准 provider 身分的 alias，不是 PDM 自有密碼。

## 未宣稱與下一步

Platform 現有登入 source 仍為 email/password；Google／工號雙入口、non-Google provider-managed 管理員開通與跨 app handoff 仍屬 118-B，需 Platform owner 建立／承接 owner-native 任務並補 mapping／API／provider 分支證據。118-C 仍受既有 SSO／release gate 約束；本 receipt 不授權 provider 設定、production、deploy、traffic 或 DB 變更。

本次 task-owned browser runtime、4501／62707／3000 ports 與 `.tmp` 目錄均已清理；使用者原有 production browser tab 未導覽或關閉。
