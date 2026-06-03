# QC Fact Report: DEV-UX-005 全系統 UI 屬性視覺層級一致化

日期：2026-06-01

## 驗證結論

通過。Dashboard、Upload、Handoff、Public Share 的主識別、badge、metadata row、diagnostic value 視覺層級已套用，桌面與行動版測試 viewport 未出現水平 overflow。

## 執行項目

| 項目 | 指令 / 方法 | 結果 |
| --- | --- | --- |
| UX 專用 QC | `npm.cmd run qc:ux-attribute-hierarchy` | 31/31 pass |
| 型別檢查 | `node_modules\\.bin\\tsc.cmd --noEmit` | pass |
| Lint | `npm.cmd run lint` | pass |
| Production build | `npm.cmd run build` | pass |

## 實際結果

- 靜態檢查確認 `.detail-row > span` 不再覆蓋巢狀 metadata，`SHA256`、來源檔案、submission ID 使用 `.diagnostic-value`。
- Dashboard 表格：圖號使用 `.identity-primary`；版次與檔案狀態使用 `.metadata-badge`；系統診斷展開後至少 3 個 diagnostic value。
- Upload 390px：檔案列有格式 badge、大小/用途 metadata pair，無水平 overflow，無 browser console error。
- Handoff 1440px：發布卡片有主識別、metadata badge，發布包 SHA 使用 diagnostic value，無水平 overflow。
- Public Share 390px：hero 有主識別與 metadata rows，發布包 SHA 使用 diagnostic value，無水平 overflow。
- Build 通過，僅出現既有 Turbopack dynamic tracing warnings，來源仍為 `src/lib/config.ts`、`src/lib/llm-usage.ts`、`next.config.mjs` import trace。

## 證據

- `qc:ux-attribute-hierarchy` output：31 total / 31 passed / 0 failed。
- `Dashboard desktop avoids horizontal overflow`：0px。
- `Upload mobile avoids horizontal overflow`：0px。
- `Handoff desktop avoids horizontal overflow`：0px。
- `Public share mobile avoids horizontal overflow`：0px。
- Build route manifest 包含 `/upload`、`/handoff`、`/share/[token]`、`/`。

## 問題與阻塞

- 無本輪阻塞。
- 殘留 warning：Turbopack dynamic path tracing warning 為既有 build warning，非本輪 UI 屬性層級修改造成。
