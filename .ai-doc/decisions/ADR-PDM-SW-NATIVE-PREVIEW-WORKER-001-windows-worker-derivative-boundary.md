# ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001 - Windows Worker Derivative Boundary

## 2026-10-27 架構定案：Windows 單一路徑與 OpenSWX 退役

現行狀態：`Accepted / Architecture Finalized / RD Implementation Ready / IMPLEMENTATION_NOT_STARTED`。已對照 PR #496 合併後 main `e8d8d4fa917f92743dacd2186ef2cfca45518187` 完成實作定位與自查；不是獨立 QC 或正式能力通過。資料、API、發布與 12 組驗證只在 DEV-125 維護，不新增平行 ADR／QA 文件。

使用者確認以可安裝的 Windows 解析服務及電腦清單管理原生 CAD 處理，拒絕 OpenSWX／Document Manager 長期雙軌。[DEV-125](../specs/DEV-125-windows-solidworks-service-and-openswx-retirement.md) 是唯一後續開發入口；DEV-122 以部分成果移交結案，DEV-124 取消修復。

沿用雲端 auth／queue／source-hash 與 Windows native execution 邊界，重用現有 Document Manager reader／preview／broker。多台電腦屬同一 Windows 解析產品，各自可撤銷、原子領取工作；不新增第二套佇列或 parser provider 選擇器。新入口、裝置清單及 OpenSWX 完整拆除的唯一產品契約在 DEV-125，這裡只記架構取捨。

| 已定案 | 取捨 |
|---|---|
| NSIS EXE＋WinSW／Node 24＋預編譯 x64 Document Manager extractor | 重用既有 worker；不另做 MSI、自動更新、常駐使用者瀏覽器或完整 fleet。LocalService／service SID，在非互動 session 真實驗證。 |
| DB 裝置身分＋十分鐘單次註冊碼＋DPAPI | 兩個小表取代 native 靜態 env credentials；所有 caller 即時檢查 company／active instance，沿既有管理員登入與 key broker，無新 MFA、OrgMaster writer 或電腦 GCP IAM。 |
| Document Manager 唯一引擎 | 讀屬性及檔內儲存 PNG；PRT／ASM configuration、DRW sheet 能力分別驗證。取消下文歷史 Shell／eDrawings 作為可選現行實作的解讀；缺圖明確失敗，不保留替代引擎。 |
| 舊佇列 owner＋既有 generation fence | 加嚴公司與實例／租約驗證，結果與完成 digest 同 transaction；不另做 queue／receipt 平台。撤銷不能回收已傳輸 bytes，不能承諾遠端抹除。 |
| OpenSWX 程式、發布、專用雲端全部退出 | 先排空、建立無 worker 依賴的 recovery，再刪專用資源；共享權限依 consumer 保留，歷史 migration／資料／收據不刪，不留下可執行 compatibility reader。 |

Document Manager 的已儲存預覽擷取不能承諾任意 CAD 轉 PDF 或互動 3D；各格式能力依原生實測判定。OpenSWX 的可執行入口、日常發布依賴與專用部署資源必須退役；保留不可變歷史收據與已套用 migration 不代表保留第二套系統。拆除尚未執行，不能以本 ADR 宣告完成。

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
- Unclaimed queued jobs stop waiting after 120 seconds, and no offline, blocked or kind-mismatched job is presented as actively generating.
- A real A0002 `.SLDDRW` sample is claimed by the dedicated 2D worker and produces a current-source-hash PNG; this receipt restores Phase 1 local completion for DEV-056.
- Browser/API responses do not expose SolidWorks API/license key material.
- Next.js request handlers do not run native CAD tooling synchronously.
- Real native readiness is backed by Windows worker evidence or explicitly marked as still gated.

DEV-056 Phase 1E local receipt: `output/qa/dev-056-2d-preview/20260819132108/` records A0002 source-hash preservation, dedicated `solidworks_2d_preview_png` readiness, `native_thumbnail_png` claim/completion, ready `image/png` derivative and authenticated browser DOM verification. This receipt closes the local Phase 1E gate only; it does not authorize production rollout or later render phases.
