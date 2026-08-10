# DEV-061 本機實際操作與驗證證據

Date: 2026-08-10  
Scope: isolated SQLite runtime only  
Status: `Local QA/QC Passed after REUSE-005 remediation / Production Release Gated`

Latest rerun: `20260810-155227`. The earlier run `20260810-152923` correctly stopped at P1 `REUSE-005` because concurrent same-hash uploads left two physical objects. RD added transaction-safe winner re-read, active company/owner/hash uniqueness, loser pointer reconciliation and orphan-object removal. The latest run revalidated the full required local gates and is the authoritative result; run-specific evidence is in `output/qa/dev-061-ai-real-operation/20260810-155227/`.

## 1. 驗證結論

DEV-061 Phase 1A～1D 已完成本機實作。圖號新寫入只走受控進版檔案包；每次首版／進版都必須重新上傳一個 `.SLDDRW` 與一個 `.SLDPRT`／`.SLDASM`。相同 3D bytes 會在同 company、同 owner root 內以 SHA-256 + size 找到 canonical asset，保留本版 upload receipt 與版次關聯，不再複製第二份受控 bytes。

圖號明細已移除一般附件管理、參考附件與重複檔案卡；檔案清單保持常駐但以 compact row 呈現。ready preview 以預覽圖作為唯一開啟入口，download 保留為次要 action。料號文件清單不收合。

## 2. 已執行命令

| Command | Result |
|---|---|
| `npm.cmd run db:dev-061:local-schema` | Passed；只新增 local SQLite pointer/index，未刪表或刪資料 |
| `npm.cmd run qc:dev-061:file-ownership` | 14/14 PASS |
| `npm.cmd run qc:dev-061:cleanup-dry-run` | `ready_for_review`；latest isolated fixture 13 筆 drawing loose candidates；`apply=not_performed` |
| `npm.cmd run qc:dev-061:ui` | 6/6 PASS |
| `npm.cmd run qc:dev-061:real-operation` | isolated SQLite 14/14 PASS |
| `npm.cmd run typecheck` | PASS |
| affected-file ESLint | 0 error；只有既有 `@next/next/no-img-element` warning |
| `npm.cmd run build:isolated` | PASS；Next compiled successfully and isolated output was cleaned；包含 `/api/numbering/drawings/[drawingNumber]/revision-files` |
| Postgres/Supabase migration hash | identical；SHA-256 `44291ff54eb689bee641284c30b22666fb062ef815b82040cddf97fd136412f2` |

## 3. API 實際操作

在 disposable fixture，以 Admin demo session 執行：

1. `POST /api/numbering/drawings/A0005-M01/attachments` 回 `410`，error code 為 `DRAWING_REFERENCE_UPLOAD_RETIRED`，並回復至 `/numbering/revisions?drawingNumber=A0005-M01`。
2. 以不同版次上傳相同 3D bytes：第一次建立 canonical asset；第二次回 `201`、相同 SHA-256，並回 `reuse.reused=true` 與第一次的 `canonicalAssetId`。
3. 受控 revision route 只接受 `.SLDDRW`、`.SLDPRT`、`.SLDASM`；UI file picker 同步限制相同副檔名。

## 4. 真實瀏覽器證據

`qc-dev-061-real-operation.mjs` 使用 Playwright 登入隔離 runtime，檢查：

- 圖號明細的 `圖面與附件`、compact 常駐 `檔案清單`、2D/3D preview boards；
- `附件管理`、`預覽 PDF`、獨立 `開啟預覽` 文字與 action 不存在；
- 1440×900、1024×768、390×844 均無水平 overflow；
- `/numbering/revisions` 只有一個 `加入受控進版包` CTA，file picker accept 為 `.SLDDRW,.SLDPRT,.SLDASM`。

Screenshots:

- `output/qa/dev-061-real-operation/20260810-1440x900.png`
- `output/qa/dev-061-real-operation/20260810-1024x768.png`
- `output/qa/dev-061-real-operation/20260810-390x844.png`
- `output/qc-dev-061-drawing-detail-authenticated-after-load.png`

## 5. 清理與 release 邊界

`qc-dev-061-cleanup-dry-run` 只保護性掃描 package、candidate、supplement、shared CAD references，列出目前 12 筆可能的 drawing loose candidates；本輪未執行 `--apply`、未刪除正式資料、未刪除正式 Drive／bucket object。正式清理仍需另行建立 migration manifest、storage object count/hash reconciliation、two-phase receipt、rollback/reconciliation 與 release approval。

既有通用 `qc-pdm-drawing-submission-ui-real-operation` runner 仍會因其歷史 fixture 缺少 `part_roots` 及無效 Cloud SQL connection env 而阻塞，未將該 runner 的結果當作 DEV-061 PASS；本證據採用新增的隔離 DEV-061 runner 與明確的 disposable API 操作結果。
