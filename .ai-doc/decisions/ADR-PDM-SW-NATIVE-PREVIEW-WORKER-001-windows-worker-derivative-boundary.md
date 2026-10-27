# ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001 - Windows Worker Derivative Boundary

## 2026-10-28 最新架構定案：使用者自有 Windows 裝置、Google 自助連結與 OpenSWX 退役

現行狀態：`Accepted / Architecture Finalized / RELEASED_R26 / FORMAL_ACCEPTANCE_IN_PROGRESS`。本段取代 2026-10-27 管理員貼碼架構及 PR #533 匿名 worker 草案；#533 已關閉未合併且標示撤回，PR #535 官方 interop 執行來源原樣保留。PR #536～#539 完成 owner-bound self-link、冪等覆蓋安裝、逐請求 view＋download 與工作租約 key guard；R26 正式來源為 `c7ede379f011250e51da65dcba509ed67b5c1a0b`。資料、API、發布／唯讀 provider 收據與剩餘實機驗收以 DEV-125 §11.8／QA JSON 為唯一權威；正式 23 條未授權請求拒絕通過不代替 Windows 正向解析驗收。

使用者從未授權匿名開放。禁止匿名 worker、固定 `windows-parser` 身分、共用 API key，亦禁止只因 caller 可連線就提供 CAD bytes、Document Manager key、claim 或 complete。每個 Windows 程序必須持有 Google SSO 自助連結後建立的獨立裝置憑證，永久綁定 company、Principal、電腦與 active account；每個 workload request 都重新驗證 current account、Principal mapping、grant 及工作／來源權限。

使用者確認以可安裝的 Windows 解析服務及電腦清單管理原生 CAD 處理，拒絕 OpenSWX／Document Manager 長期雙軌。[DEV-125](../specs/DEV-125-windows-solidworks-service-and-openswx-retirement.md) 是唯一後續開發入口；DEV-122 以部分成果移交結案，DEV-124 取消修復。

沿用雲端 auth／queue／source-hash 與 Windows native execution 邊界，重用現有 Document Manager reader／preview／broker。每位有效 AI-PDM 使用者在自己的 Windows 電腦安裝；不設共用常開解析主機，不需 PDM 管理員逐台核准。多台電腦各有可撤銷身分並只領 owner 目前有權的工作；不新增第二套佇列或 parser provider 選擇器。

| 已定案 | 取捨 |
|---|---|
| NSIS EXE＋WinSW／Node 24＋預編譯 x64 Document Manager extractor | 重用既有 worker；不另做 MSI、自動更新、常駐使用者瀏覽器或完整 fleet。LocalService／service SID，在非互動 session 真實驗證。 |
| Google SSO 自助連結＋DB 裝置身分＋DPAPI | 使用者只按一次「連結這台電腦」；短效 enrollment 由瀏覽器與 loopback 自動交換，不呈現註冊 ID／碼。migration 089 immutable，090 forward-only 加永久 owner Principal。無新 MFA、OrgMaster writer 或電腦 GCP IAM。 |
| 覆蓋安裝驗證並保留既有裝置 | 設定工具以 DPAPI credential 呼叫 `/api/windows-service/self`；有效則沿用原身分，失效才進 Google 自助連結。網路／server 暫時失敗停止重連，避免重複建立裝置。只看 credential 檔案存在不能判定有效。 |
| Document Manager 唯一引擎 | 讀屬性及檔內儲存 PNG；PRT／ASM configuration、DRW sheet 能力分別驗證。取消下文歷史 Shell／eDrawings 作為可選現行實作的解讀；缺圖明確失敗，不保留替代引擎。 |
| Principal owner＋舊佇列 owner＋既有 generation fence | claim／source／heartbeat／complete 重驗 active account、Principal、grant 與資源權限；A 裝置不能取得 B-only 工作。queued 等待不耗 attempt；只回收已領取 stale lease。不另做 queue／receipt 平台。 |
| Native key 隨已授權工作租約取用 | worker 先 claim 自己有權的工作再讀 key；broker 在 provider I/O 前後核對 device、owner、company、來源與既有 generation。idle 不取 key、不跨工作 cache。管理 probe 沿自己 lease 讀 key；非管理員的 probe poll 回空 queue，不阻擋正常工作。 |
| 使用者電腦接收原檔要同時有查看與下載權 | preview／recognition 的 claim、source、heartbeat、complete 及 key guard 重驗來源各作業的 `view` 與 `download`；SLDPRT／SLDASM 包含 model 權限。只有 view 不得以 parser 繞過下載限制；claim 拒絕不增加 attempt。 |
| OpenSWX 程式、發布、專用雲端全部退出 | 先排空、建立無 worker 依賴的 recovery，再刪專用資源；共享權限依 consumer 保留，歷史 migration／資料／收據不刪，不留下可執行 compatibility reader。 |

Document Manager 的已儲存預覽擷取不能承諾任意 CAD 轉 PDF 或互動 3D；各格式能力依原生實測判定。OpenSWX 可執行入口、日常發布依賴與專用部署資源已依 DEV-125 §11／QA JSON 退出，歷史 migration／收據保留。R25 發布通過仍不替代 Windows 自助連結、低權限三格式及正常 UI 的實際驗收。

下列狀態、選項與原生能力證據保留原時點；與本節衝突的 Shell／eDrawings 選項及產品排程均為歷史，不是新的實作授權。現行工程契約與 Architecture Closure Review 以 DEV-125 為準。

Status: Accepted / DEV-056 Phase 1E local implementation verified / Production Release Gated
Date: 2026-08-19
Owner: Dev PM
Related SPEC: `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`
Related DEV: `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`

## Context

The current PDM attachment panel can inline-preview browser-readable files, but native SolidWorks files display `預覽待產生`. The user wants a Windows File Explorer-like experience where `.SLDPRT`, `.SLDASM` and `.SLDDRW` show a recognizable preview.

Windows File Explorer can use local shell thumbnail handlers on a CAD workstation. AI_PDM is a web application, so the browser cannot directly parse SolidWorks native files or call local Windows preview handlers safely.

The existing settings center now has a SolidWorks Document Manager secret lifecycle, but secret configuration alone does not generate previews. PDM needs a controlled derivative pipeline.

## Decision

Adopt a Windows preview worker plus generated derivative architecture:

1. Native SolidWorks files remain controlled source attachments.
2. PDM creates auditable preview jobs for native source files.
3. A trusted Windows worker generates browser-readable derivatives, beginning with PNG thumbnails.
4. PDM stores derivative metadata tied to source file hash and generator evidence.
5. The UI displays ready PNG/PDF derivatives and falls back to current safe placeholders when no derivative exists.
6. Next.js request handlers do not run SolidWorks, eDrawings, shell handlers or COM automation directly.
7. The browser never receives SolidWorks API/license key material.
8. Real SolidWorks preview readiness requires file-type-specific Windows worker evidence; current Shell `.SLDPRT` evidence and Document Manager SLDDRW worker compile/claim evidence are partial until `.SLDASM` and successful `.SLDDRW` outputs are proven by Document Manager/eDrawings/equivalent renderer or explicitly skipped.
9. Native preview jobs are auto-enqueued on attachment list/create, the browser foreground-polls pending state, and workers heartbeat every five seconds; stale jobs are automatically recovered without manual refresh.
10. Job completion/failure is accepted only from the worker that currently owns the running job, preventing an old worker from overwriting recovered work.
11. The persistent 2D worker starts independently of plaintext key environment variables and resolves the UI-activated exact version through the server broker; local uses Windows DPAPI and staging/production uses Google Secret Manager without changing the Admin workflow.
12. Phase 1 `.SLDDRW -> PNG` jobs use `native_thumbnail_png`; `drawing_pdf` is reserved for the separately authorized Phase 2 renderer and must not be auto-enqueued by the PNG pipeline.
13. 2D renderer readiness is reported by its own `solidworks_2d_preview_png` capability heartbeat. Recognition worker or 3D Shell worker presence cannot satisfy this signal.

## Options Considered

| Option | Decision | Reason |
|---|---|---|
| Browser directly previews `.SLDPRT` / `.SLDASM` / `.SLDDRW` | Rejected | Browsers do not natively parse SolidWorks formats and this would create unsafe client/plugin assumptions. |
| Use Google Drive preview iframe for native files | Rejected as authority | It may help some file types but does not provide controlled SolidWorks native derivative evidence. |
| Call Windows Explorer shell thumbnail handler from browser or Next.js routes | Rejected | Shell handlers depend on local desktop state and must not run in request handlers. |
| Use Windows Shell thumbnail extraction inside an isolated worker | Accepted as Phase 1 partial worker | Useful for File Explorer-like thumbnails when quality-gated, but not enough to close full Document Manager/eDrawings readiness. |
| Use Document Manager embedded sheet-preview extraction inside an isolated worker | Accepted as Phase 1 worker | Correct boundary for SLDDRW PNG preview; the worker obtains the UI-activated exact version through the private broker and remains subject to saved embedded preview quality. |
| Run SolidWorks/eDrawings/COM inside Next.js API routes | Rejected | Native CAD tooling is slow, stateful and Windows-specific; request handlers must not own it. |
| Use a separate Windows preview worker that writes derivatives | Accepted | Provides clear isolation, retry, evidence, redaction and UI-friendly artifacts. |
| Store derivatives as source attachments | Rejected | Derivatives are display artifacts and must not replace controlled CAD source files. |

## Chosen Rule

The boundary is:

```text
PDM API = auth, queue, metadata, source hash validation
Windows worker = native Shell/SolidWorks/eDrawings/Document Manager preview generation or extraction
Derivative storage = PNG/PDF artifacts tied to source hash
Browser UI = status + derivative rendering only
```

Preview generation is asynchronous and idempotent. A preview derivative is valid only while its recorded source hash matches the current source file hash.

## Consequences

Positive:

- Users can see SW native file previews without downloading files.
- PDM keeps source files and generated display artifacts separate.
- Failures become visible and retryable instead of blank placeholders.
- Users do not need to refresh the page to see a completed preview; visual state distinguishes active work from delayed work.
- Real native preview evidence can be separated from local fake-worker pipeline tests.
- Secret redaction and worker evidence can be audited.

Costs / tradeoffs:

- Requires additive queue and derivative metadata.
- Requires a trusted Windows worker deployment path.
- Requires storage and retention policy for generated files.
- Embedded/Shell previews may be stale, blank or absent if the SolidWorks file or workstation preview provider lacks useful preview data.
- A local test-double remains simulation-only and cannot activate. Real local UI input is stored with Windows DPAPI; staging/production uses Google Secret Manager, while the worker only receives the active key in bounded process memory.
- High-fidelity PDF/rendering requires later eDrawings/SOLIDWORKS automation decisions.

## Migration / Compatibility Impact

- Existing source attachments remain unchanged.
- Existing PDF/image/Drive previews remain compatible.
- Existing `預覽待產生` placeholders remain the safe fallback until derivatives exist.
- Native pending states are automatically queued and refreshed in the foreground; terminal failures remain explicit and do not retry forever.
- Existing generic worker capability heartbeat storage is reused; no schema migration is required for the dedicated 2D capability code.
- Historical queued `drawing_pdf` work is not rewritten in place; the recovery path records a terminal incompatibility and enqueues the current Phase 1 PNG kind idempotently.
- Phase 1 local PDM pipeline is implemented with fake-worker evidence, Windows Shell `.SLDPRT` proof, and a real A0002 `.SLDDRW -> PNG` Document Manager worker receipt; production rollout and historical backfill remain not authorized by this ADR.
- Broader `.SLDASM` coverage, additional drawing samples, drawing PDF and production readiness remain external CAD/release gates and must not be silently marked complete.

## Superseded / Amended Documents

This ADR amends the preview behavior implied by:

- `DEV-PDM-UI-POLISH-001` SolidWorks preview fallback.
- `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md` SolidWorks secret vertical slice.
- `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md` part/root 3D attachment display behavior.

Specific amendment:

- A configured SolidWorks secret is not enough to show previews. PDM must also have preview jobs, generated derivatives and a worker evidence path.
- Generated previews are not source authority for drawing package, shared 3D model or manufacturing baseline evidence.

## Enforcement

RD must not mark the DEV complete until:

- PNG/PDF derivatives are stored separately from source files.
- Derivatives are validated against source hash.
- UI shows ready, queued, running, failed, stale and skipped preview states.
- Worker job payloads and evidence are redacted.
- Worker heartbeats, 30-second stale recovery and current-owner completion guards are verified.
- Unclaimed queued jobs remain queued without consuming an attempt while no authorized device is online; only an already-running stale lease is recovered or exhausted. The UI shows waiting, not active generation.
- A real A0002 `.SLDDRW` sample is claimed by the dedicated 2D worker and produces a current-source-hash PNG; this receipt restores Phase 1 local completion for DEV-056.
- Browser/API responses do not expose SolidWorks API/license key material.
- Next.js request handlers do not run native CAD tooling synchronously.
- Real native readiness is backed by Windows worker evidence or explicitly marked as still gated.

DEV-056 Phase 1E local receipt: `output/qa/dev-056-2d-preview/20260819132108/` records A0002 source-hash preservation, dedicated `solidworks_2d_preview_png` readiness, `native_thumbnail_png` claim/completion, ready `image/png` derivative and authenticated browser DOM verification. This receipt closes the local Phase 1E gate only; it does not authorize production rollout or later render phases.
