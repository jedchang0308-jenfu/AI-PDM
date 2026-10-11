# DEV-121 RD v7 ordinary worker evidence checkpoint（2026-10-11）

範圍：既有AI-PDM/DEV-121#rd-capabilities的owner-release corrective cycle；依賴DEV-122既有daily流程。Base官方main a16eaba2e5003d228fd4438599f8d84cd7ca2231，branch codex/dev121-rd-v7-worker-continuation；沿用本對話原worktree、完整AGENTS已讀、開始tracked clean，其他人的workspace及private output保留。Platform與OrgMaster來源未在本slice修改。

已證實source接縫：普通full35不能直接用跨source舊descriptor/operational receipts。既有artifact reuse只輸出program-only wrapper，DAILY_REFRESH receipt完成也沒有producer發布普通full descriptor。兩個positive fixture在原source各因missing descriptor REF而RED；不存在的正式帳戶或畫面文案不是此slice根因。

Diff：reuse producer另產current association-bound V2 build-only descriptor，移除所有歷史operational refs；existing DAILY bootstrap及same-input完成重播，將new bootstrap/preflight/pause及numeric credentials組成完整ordinary descriptor，在全部full evidence／PAUSED／all-terminal／actual selftest檢查後create-only發布。CLI只回immutable REF。FIRST、B35 closed34/effective33、085／Principal fence與既有auth規則不放寬；沒有新worker image、Secret或IAM操作。

未知發布獨立review曾指出P1：成功bootstrap後descriptor上傳未知被原catch恢復成prior Job，阻斷same-input重播。已修為成功bootstrap後獨立checkpoint，失敗保持selftest/PAUSED；exact URI可讀後由native bytes/hash/generation驗證adopt，零重送POST/PATCH/run。最終獨立gpt-6-luna xhigh只讀source review未見P0/P1，沒有執行雲端。

本機：五項新增tests＋既有source reuse→pause→bootstrap→ordinary owner pipeline聚焦6/6 PASS，零skip。涵蓋same-source完整鏈、readonly artifact reuse、same immutable input replay、source/prior/preflight tamper、ENABLED Scheduler與Job drift拒絕、unknown applied寫入adopt、三次暫時missing後保留checkpoint並在可讀後adopt零重送。完整continuous 285/285 PASS、owner Node regression 339/339 PASS，均零skip；native QC另含sharp contract與image-only驗證、v7 catalog generator 3/3、abort 6/6、db boundary PASS（22 governed files）、typecheck:app PASS及isolated build PASS（artifact/primary/cleanup=true）。原生LOCAL_CONTRACT報告 DEV117-S1B-20261011T104533133Z-FB7ED8C7 保存在private output；source snapshot涵蓋執行時的受控檔案，QA本頁結果後記不在該snapshot清單。建置沿用既有middleware/Edge Runtime警告，未修改無關程式；本機PASS不替代Production。初次wire fixture未含native LF及重播fixture重造deadline的失敗私下保留，修正fixture後通過；沒有更改產品guard。

正式分界：指定OrgMaster事故通知訂閱原設定恢复及candidate smoke v10已native APPLIED；後續OrgMaster owner十階段SUCCESS，fresh sealed canonical/terminal/traffic仍因指定SDKreauth失效未讀回。AI-PDM085 NOT_APPLIED／RD v7 NOT_DEPLOYED；runner build與0% static recovery只證明準備，未取得停寫/fence/migration/traffic證據。私有Production inputs、readbacks、logs不提交public repo。新兩fixture正常drawing/item edit/submit及approval拒絕NOT_RUN；Google延遲正式情境未證，本人DEFERRED_UNVERIFIED，指定歷史資料仍FK阻擋未刪且不擴大清理。

Runtime：本slice Node tests只用memory／原有task-owned temp，port=null；依賴採原canonical node_modules暫時junction，主要資料不seed。完整QC／isolated build由原native driver保護primary invariants及自身temp cleanup；Root於交付移除本slicejunction並讀回程序終了。worktree保留source與私下證據供protected release續接，cleanup owner Root。
