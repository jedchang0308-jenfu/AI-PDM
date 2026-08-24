# QC Report：DEV-065 料號預覽圖本機實作與驗證

Status: `LOCAL RD PASS / SQLite + Browser PASS / PostgreSQL Shadow BLOCKED / Full Multi-provider QA NOT PASS / Production Release Gated`
Date: 2026-08-24
DEV: `DEV-065`
SPEC: `.ai-doc/specs/SPEC-PDM-WORKBENCH-PREVIEW-GALLERY-001-drawing-part-3d-preview-mode.md` §0.16
ADR: `.ai-doc/decisions/ADR-PDM-PART-PREVIEW-AUTHORITY-001-part-setting-and-shared-projection.md`
QA: `.ai-doc/qa/qa-dev-065-workbench-preview-gallery-validation-plan-2026-08-11.md` §0.7

## 1. Executive result

DEV-065 Phase 2 Part preview已完成本機RD實作。Part預覽代表Part本身；auto只解析direct unique primary manufacturing Drawing，production ready優先，否則顯示latest open active RD ready；custom只接受經server正規化的PNG／JPEG，並由persistent `part_preview_settings`選擇。List、gallery與drawer共用resolver／safe projection／media／panel／gallery；active custom generic delete固定409，set／replace／reset具row-version、idempotency、audit與storage compensation。

SQLite、focused contract、真實Chromium、feature-off rollback、typecheck、affected lint、isolated build與DEV-087／088 focused regressions已通過。PostgreSQL runner已實作但本機未提供explicit disposable shadow URL，因此依法`BLOCKED`；沒有接觸production，也不把SQLite結果推定成PostgreSQL PASS。

## 2. Environment and source boundary

| Field | Evidence |
|---|---|
| Git HEAD | `c759a7bb572225b6323decc20243d535fba312ef` |
| Node | `v24.12.0` |
| Next | `16.3.0` |
| sharp | direct `0.35.3` |
| server-only | direct `0.0.1` |
| Part capability | `PDM_PART_PREVIEW_V1`, default off |
| Database/storage | task-owned SQLite and local test storage only；PostgreSQL not contacted |
| Production | `productionConnected=false`；`productionWrites=false` |
| Dirty baseline | `.tmp/dev065-baseline/targeted-before.patch`, SHA-256 `31e683e1d2102bd1f16b82b0439654d75d1d15fb0002d0881f3421e30dec29bb` |

本輪保留使用者既有dirty worktree，不執行reset／checkout，不把重疊檔全部歸因DEV-065。核心新增檔SHA-256：

| File | SHA-256 |
|---|---|
| `db/postgres/046_part_preview_settings.sql` | `db4ff6f09715d2064b13e5f430beb436d352fce3f7970de7345fb6cecafd853c` |
| `src/lib/pdm-part-preview.ts` | `cd3a655a62b396b44df866e436597018c5d108aa21385bd753b356f741182a84` |
| `src/lib/repositories/pdm-part-preview-async-repository.ts` | `4b42b3cc28f4a4c8e6a48de4fa713cbcc472eddf4782b82aeca64322e4721c43` |
| `src/lib/part-preview-image.ts` | `60ec3a4de84242f90ac3f1ff253db43a83e27c04b4fe322bc585182afcef8e06` |
| `src/components/canonical-preview-media.tsx` | `24ffb8ae7cc94c2581e9fb81c2c4a860228c77d692bf92a7f4acd32a7ea0a7ac` |
| `src/components/canonical-preview-panel.tsx` | `bcb1b7d49ce2c0a1c0f8834bbf4e1658bf5268881448e032050ccaa6d5295824` |
| `src/components/canonical-pdm-preview-gallery.tsx` | `d546587c900d2fa05ee42a4c94875d005bd056e407868f5052989012e8fca8db` |
| `src/components/part-preview-source-control.tsx` | `2647a2c3e35a8767279a16ccbc262aa27f5ef4f57990489b4ad5979958d39ffc` |

## 3. Executed evidence

| Command / evidence | Result | Material coverage |
|---|---|---|
| `npm run qc:dev-065:contract` | `28/28 PASS` | Neutral DTO、Drawing/Part source authority、feature dependency、source scan。 |
| `npm run qc:dev-065:part-preview` | `30/30 PASS` | SQLite first/re-run/guards、image validation、atomic mutation、idempotency/version、fault recovery、delete guard、security/query。 |
| `npm run qc:dev-065:browser` | `112 checks PASS` | A0005 four viewports、Drawing＋Part list/gallery/drawer、active RD source、custom lifecycle、HTTP 401/400/409、feature on/off、shared components、console/overflow。 |
| `npm run qc:dev-087:contract` | `31 PASS` | Canonical workbench contract regression。 |
| `npm run qc:dev-087:repository` | `29 PASS` | Repository/read snapshot regression。 |
| `npm run qc:dev-087:commands` | `30 PASS` | Canonical command regression。 |
| `npm run qc:dev-087:file-read-retirement` | `193/193 PASS` | Single file-read contract；port `57417` released。 |
| DEV-088 contract/repository/HTTP | `40/29/15 PASS` | Replacement attachment snapshot and HTTP regression；port `57414` released。 |
| `npm run typecheck:app` | `PASS` | Application TypeScript。 |
| affected ESLint | `PASS` | 22 changed DEV-065 TS/TSX files，0 errors。 |
| `git diff --check` | `PASS` | No whitespace errors；only repository CRLF notices。 |
| `npm run build:isolated` | `PASS` | Compile、TypeScript、static generation `126/126`；new routes included；task temp removed。 |

Query instrumentation：Part list 0 rows=`2` statements；1/20/50 rows=`7/7/7`；detail=`13`；list transaction boundary=`1`。結果不隨row count成長，且list canonical rows與preview hydration位於同一outer read snapshot。

PPC coverage：`001..004` source/image；`005..008` atomic lifecycle/delete/fault/idempotency；`009..010` permission/identity；`011..016` resolver/query/shared UI/drawer/a11y/security；`017` regressions；`018` feature-off rollback。Local SQLite／browser層沒有open P0/P1。

## 4. Browser and visual evidence

Feature-on runtime使用random port `64346`，feature-off runtime使用`58568`；兩者都由task-owned process tree停止、port確認釋放、isolated Next dist與temp DB/repository移除。驗證包含A0005-P01四viewport均為`ready / 研發預覽 / A0005-M01 / 0.1`、custom upload後reload仍一致、active custom delete 409、generic reserved category POST 400、reset readback後附件可刪且回到RD auto preview、unauthenticated 401，以及flag off時Part switch／preview map消失且mutation 404、Drawing gallery不退化。

| Viewport evidence | SHA-256 |
|---|---|
| `output/qa/dev-065-canonical-preview/desktop.png` | `f8fe5ce7f59800a82446217baf3fe5b08a0f518c05b8bde6c3330b8820ebe6e6` |
| `output/qa/dev-065-canonical-preview/laptop.png` | `abc34fdf35261f72ef08c667441152e253696775b0cda028435f29ba0a82c404` |
| `output/qa/dev-065-canonical-preview/tablet.png` | `1c45fcf306e0915f6018b9e579828b91f8c7951391230d81b6e15d75dc4d2643` |
| `output/qa/dev-065-canonical-preview/mobile.png` | `1ddf7340baaaca12dd2e1403fb7ee850ff9eb0d51d1029d62474df4a63972957` |

四viewport均無horizontal overflow、遮擋或page error。A0005卡片可見3D縮圖與`研發預覽 · A0005-M01 · 0.1`；無direct primary link仍顯示unlinked placeholder，direct link存在但production／active RD均無ready則顯示linked-no-usable-3D，不再混用同一句文案。

## 5. Blocked and non-attributable findings

### PostgreSQL shadow — BLOCKED

`npm run qc:dev-065:postgres`在`PDM_POSTGRES_SHADOW_URL`與`POSTGRES_SHADOW_URL`皆未設定時非零停止，明確輸出未接觸DB且`productionWrites=false`。Runner本身已包含safe-target preflight、046 first/re-run、guard negatives、兩client serializable one-winner race與resolver statement計數；必須在safe disposable shadow取得PASS後，才能宣告PostgreSQL parity或啟用capability。

### Standard build — safe environment block

`npm run build`因工作區既有port 3000 runtime（PID 35664）觸發clean-next安全阻擋。本任務未啟動、未停止、未繞過該runtime；改用正式專案提供的`build:isolated`並完整通過126頁。此項是共享本機環境保護，不是compile failure。

### Master attachment aggregate — baseline attribution

`qc:master-attachments`期待Drawing attachment route保留舊`getMasterAttachmentBytes`字串，但該route在DEV-065 baseline前已是dirty且不含該字串；baseline patch可證明此差異非本DEV引入，因此不得修改他人slice或將其誤算為DEV-065 regression。DEV-065直接相關的Part active-delete 409、generic reserved upload 400、canonical file-read與DEV-088 replacement contract/repository/HTTP均已實際通過。

## 6. Completion and release boundary

- Local RD objective：`PASS`。Phase 1 Drawing與Phase 2 Part產品切片均已落地。
- Local SQLite／browser acceptance：`PASS`。
- Full multi-provider QA：`NOT PASS`；PostgreSQL shadow是唯一provider blocker。
- Capability：維持default off；沒有production config change。
- Production migration／deploy／release：未執行、未授權。
- Cleanup：所有DEV-065 task-owned runtime、ports與Next dist已清理；另精確移除10個先前DEV-065專屬可再生暫存建置目錄。其他監聽服務保持不動。

下一個合法動作不是重寫產品，而是在safe disposable PostgreSQL shadow執行`npm run qc:dev-065:postgres`；成功後再由release gate決定migration、capability activation與部署。
