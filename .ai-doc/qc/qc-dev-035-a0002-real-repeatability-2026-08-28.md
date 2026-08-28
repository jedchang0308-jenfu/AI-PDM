# DEV-035 現行 A0002 真實讀取重複性完成收據

Current Status：`LOCAL RD/QA-QC COMPLETE / 21 OF 21 PASS / PRODUCTION RELEASE GATED`

2026-08-28於task-owned SQLite、repository、Next dist與free port中，從canonical Drawing workspace的正常「重新辨識」按鈕連續建立兩個successor，並各以one-shot真實SolidWorks Document Manager worker完成讀取。來源皆為`A0002.SLDPRT`、495749 bytes、SHA-256 `15cd458b983e4dddd0836555dfa8eac0f4d3ac87c056403d4279ebbf3d3ec7f4`；兩次均回報`solidworks-document-manager.v1 / succeeded / 14 observations`，八個expected fields的missing、value、owner與scope mismatch均為0，兩份現行projection SHA-256一致。

Current parent：`output/qa/dev-035-a0002-repeatability/DEV035-A0002-REPEATABILITY-2026-08-28T06-49-41-924Z/manifest.json`，21/21 PASS。受控命令為`npm run qc:dev-035:a0002-repeatability`；closure run已在同一隔離資料存活期間執行`qc-dev-035-completion-gate.mjs`，並把可持久重驗的sanitized evidence摘要寫入manifest。

真實secure provider為Windows DPAPI；real probe passed，worker heartbeat的applied secret version／fingerprint與active reference精確一致。Browser unexpected console／page／network／HTTP failure=0，isolated FK=0，runtime、port、temp data／repository／dist皆於finally精確清理，primary protected schema／canonical identity／master counts／migration residue／root references／FK before=after。

語意邊界：本次projection中的`configuration_name`與`applicability_scope`用來保留欄位來源、組態與審查範圍，使同一現行Reader＋Mapper契約的兩次輸出可被精確比較；它們屬provenance／review-scope evidence，不因SolidWorks存在「彎折／展開」組態就自動升格成PDM正式主檔欄位。只有經欄位權威規則、業務用途與人工審查確認後的mapped value，才可進入canonical formal state。

本收據只關閉本機DEV-035。Production credential、worker deployment、migration、traffic、smoke與release仍須另走production release gate。
