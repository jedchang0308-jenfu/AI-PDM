# QC DEV-071－XMind 肌肉記憶 BOM 編輯器事實驗證

Status: AI Real-browser QC Passed / Production Release Gated  
Date: 2026-08-13  
Owner: QC  
Authority: `.ai-doc/specs/SPEC-BOM-VISUAL-EDITOR-001-xmind-style-bom-editor.md`

## QC Conclusion

DEV-071 授權的本機 Phase 1A～1D 已完成並通過獨立事實檢查。BOM Draft 可用接近 XMind 的主要空間配置與肌肉記憶編輯正式樹及 Draft-only Floating Topics；正式 BOM authority 仍為可稽核的嚴格樹。未歸位 Floating Topics、無寫入權限與 stale editor version 均在 server fail closed。

本輪 RD repair 後，AI 以真實 rendered Chromium 重新操作 canonical Topic/Subtopic picker、Map Enter/Tab、Insert Parent/Floating/Group、hover `+`、leaf Delete＋Undo、branch confirmation、More 導覽圖／設為目前／複製／刪除與四 viewport；另以獨立 flag-on/flag-off server session 驗證 FF-002～004。所有本機實作範圍 gate 通過；production rollout 仍未授權。

## Facts Verified

- Toolbar 有 10 個 52px slot，順序為復原、重做、主題、子主題、插入、折疊、專注、儲存、詳細資料、更多；右側 inspector 與右下 Map／Outliner、zoom、fit controls 可到達。
- Enter、Tab、Ctrl+Enter、Space／double-click、Alt+Up/Down、Ctrl+Delete、Delete、Undo/Redo、fold、focus、save、Home 與 Escape 已接入；browser `Ctrl+R`、`Ctrl +/-` 未被攔截。
- 空白雙擊可建立並保存 Floating Topic；Map／Outliner 共用 selection、collapse、focus 與 graph state；正式↔Floating subtree 轉換不把自由座標變成正式 BOM authority。
- before／child／after drop preview 在 pointer release 前可辨識，invalid graph 由 repository validation 拒絕；semantic history 上限 100。
- formal graph、floating graph 與 `editor_version` 原子儲存；stale PATCH 回 `409 BOM_DRAFT_EDITOR_VERSION_CONFLICT` 且 winner 不被覆寫。
- unresolved Floating Topic 使 submit 與 approve/release path 回 `409 BOM_FLOATING_TOPICS_UNRESOLVED`；Released Snapshot／正式 export 不含 floating schema 或內容。
- Manufacturing actor PATCH 為 403；Pending review immutable；permission、status、cycle/orphan/depth/finite position validation 均 fail closed。
- 1440×900、1024×768、768×1024、390×844 無水平 overflow；390px 預設 Outliner，editor shell 位於 viewport 內。
- Canonical picker／Insert／More／leaf-delete 修復後的 AI browser manifest：`output/qa/dev-071-xmind-bom-editor/20260813131302/run-manifest.json`（56/56、17 screenshots、console error 0、unexpected HTTP 0）。
- Feature flag 獨立真實瀏覽器 manifest：`output/qa/dev-071-flag-off-browser/20260813131601/run-manifest.json`（10/10；FF-003 blocked handoff、FF-004 409 `BOM_EDITOR_V2_REQUIRED`、floating graph unchanged、FF-002 legacy save）。

## Evidence

- Browser manifest baseline：`output/qa/dev-071-xmind-bom-editor/20260813102707/run-manifest.json`（36/36、13 screenshots）。Latest AI repair recheck：`output/qa/dev-071-xmind-bom-editor/20260813131302/run-manifest.json`（56/56、17 screenshots、console error 0、unexpected HTTP error 0、expected stale 409=1）。
- Contract：`npm run qc:dev-071-contract`，18/18。
- API／repository：`npm run qc:dev-071-api`，16/16。
- Migration path：`npm run qc:bom-workbench-migration-path`，21/21。
- PostgreSQL schema shadow：`npm run qc:postgres-shadow`，27/27。
- Static：`npm run typecheck:app` PASS；affected ESLint 0 errors、1 non-blocking dependency warning。
- 視覺抽查：`01-1440-toolbar-map-initial.png`、`02-1440-floating-stage.png`、`08-1440-drop-child-preview.png`、`10-1440-version-conflict-recovery.png`、`13-390-outliner.png`。

## Non-PASS Boundaries

- Feature flag `PDM_BOM_XMIND_EDITOR_V2_ENABLED` 預設為 `false`；尚未授權在 production 啟用。
- 未執行 live PostgreSQL migration、staging/production smoke 或正式資料 mutation；schema 結論限於 disposable shadow 與 target guard。
- 未執行 stage、commit、push、merge、PR、deploy 或 release。
- XMind 對齊範圍是 command、位置、focus 與結果；未複製其商標、專有素材或品牌 trade dress。
