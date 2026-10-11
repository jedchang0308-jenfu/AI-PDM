# DEV-121 RD v7 ordinary worker evidence checkpoint（2026-10-11）

範圍：既有AI-PDM/DEV-121#rd-capabilities的owner-release corrective cycle；依賴DEV-122既有daily流程。Base官方main a16eaba2e5003d228fd4438599f8d84cd7ca2231，branch codex/dev121-rd-v7-worker-continuation；沿用本對話原worktree、完整AGENTS已讀、開始tracked clean，其他人的workspace及private output保留。Platform與OrgMaster來源未在本slice修改。

已證實source接縫：普通full35不能直接用跨source舊descriptor/operational receipts。既有artifact reuse只輸出program-only wrapper，DAILY_REFRESH receipt完成也沒有producer發布普通full descriptor。兩個positive fixture在原source各因missing descriptor REF而RED；不存在的正式帳戶或畫面文案不是此slice根因。

Diff：reuse producer另產current association-bound V2 build-only descriptor，移除所有歷史operational refs；existing DAILY bootstrap及same-input完成重播，將new bootstrap/preflight/pause及numeric credentials組成完整ordinary descriptor，在全部full evidence／PAUSED／all-terminal／actual selftest檢查後create-only發布。CLI只回immutable REF。FIRST、B35 closed34/effective33、085／Principal fence與既有auth規則不放寬；沒有新worker image、Secret或IAM操作。

未知發布獨立review曾指出P1：成功bootstrap後descriptor上傳未知被原catch恢復成prior Job，阻斷same-input重播。已修為成功bootstrap後獨立checkpoint，失敗保持selftest/PAUSED；exact URI可讀後由native bytes/hash/generation驗證adopt，零重送POST/PATCH/run。最終獨立gpt-6-luna xhigh只讀source review未見P0/P1，沒有執行雲端。

本機：五項新增tests＋既有source reuse→pause→bootstrap→ordinary owner pipeline聚焦6/6 PASS，零skip。涵蓋same-source完整鏈、readonly artifact reuse、same immutable input replay、source/prior/preflight tamper、ENABLED Scheduler與Job drift拒絕、unknown applied寫入adopt、三次暫時missing後保留checkpoint並在可讀後adopt零重送。完整continuous 285/285 PASS、owner Node regression 339/339 PASS，均零skip；native QC另含sharp contract與image-only驗證、v7 catalog generator 3/3、abort 6/6、db boundary PASS（22 governed files）、typecheck:app PASS及isolated build PASS（artifact/primary/cleanup=true）。原生LOCAL_CONTRACT報告 DEV117-S1B-20261011T104533133Z-FB7ED8C7 保存在private output；source snapshot涵蓋執行時的受控檔案，QA本頁結果後記不在該snapshot清單。建置沿用既有middleware/Edge Runtime警告，未修改無關程式；本機PASS不替代Production。初次wire fixture未含native LF及重播fixture重造deadline的失敗私下保留，修正fixture後通過；沒有更改產品guard。

正式分界：指定OrgMaster事故通知訂閱原設定恢复及candidate smoke v10已native APPLIED；後續OrgMaster owner十階段SUCCESS，fresh sealed canonical/terminal/traffic仍因指定SDKreauth失效未讀回。AI-PDM085 NOT_APPLIED／RD v7 NOT_DEPLOYED；runner build與0% static recovery只證明準備，未取得停寫/fence/migration/traffic證據。私有Production inputs、readbacks、logs不提交public repo。新兩fixture正常drawing/item edit/submit及approval拒絕NOT_RUN；Google延遲正式情境未證，本人DEFERRED_UNVERIFIED，指定歷史資料仍FK阻擋未刪且不擴大清理。

Runtime：本slice Node tests只用memory／原有task-owned temp，port=null；依賴採原canonical node_modules暫時junction，主要資料不seed。完整QC／isolated build由原native driver保護primary invariants及自身temp cleanup；Root於交付移除本slicejunction並讀回程序終了。worktree保留source與私下證據供protected release續接，cleanup owner Root。

## Reviewed LF release inputs corrective checkpoint

沿用 AI-PDM/DEV-121#rd-capabilities；本 corrective slice 從官方 protected main d3fc1bf72b3630f8a748746c40584e595d396dac 建立 codex/dev121-release-input-lf，tracked clean。readback IAM 的九個 sourceHash inputs 在 Git 為 LF，Windows core.autocrlf=true checkout 為 CRLF；native metadata executor 在 Terraform／provider operation 前以 SOURCE_NOT_FROZEN 拒絕。這是 source materialization 接縫，與有效授權、Principal 或應用 session 拒絕分開。

最小修正只在 .gitattributes 為 release-readback 的 Terraform／README、原 B35 核准 JSON 及兩個 secret-version-IAM execution files 固定 LF；不修改來源 SHA guard、IAM plan guard、任何 Terraform 或帳戶規則。暫時 rewrite-and-restore 的執行方法遭自動審核拒絕且未執行；本方案須 PR／required Windows CI／官方乾淨來源，再由 Git 全新 materialize checkout，不能把 dirty rewrite 當成發布來源。

Synthetic baseline 12/13（checkout assertion RED，其餘12 PASS），新增規則後全新 reviewed checkout 13/13 PASS：九個 raw bytes 與 Git blob SHA完全一致、i/lf+w/lf、每項eol=lf；無關文字仍CRLF。Git只切換attributes commit不保證重寫相同blob的既有檔案，因此fixture與正式下一步都使用新乾淨checkout。另以單byte竄改驗 native SOURCE_NOT_FROZEN、零Terraform／provider呼叫／immutable putBytes及putJson；兩個temp scope有精確父目錄與prefix清理，port=null。focused測試不使用雲端憑證；既有同套原生finite executor／unknown request replay不變。最終native QC Node 341/341、另一份 test:dev-117:continuous owner回歸285/285 PASS，均零skip，分母有重疊不相加；v7 catalog generator3/3、abort6/6、DB boundary22檔、app typecheck及isolated build PASS（artifact／primary／cleanup=true），sharp image-only contract／task temp cleanup PASS。LOCAL_CONTRACT報告 DEV117-S1B-20261011T142728552Z-6BBC143E 的source snapshot為605f9c6ab848ab3eaa08b586687582aba63ffc6399392034f913a6b19ebc73fd，QA本段是執行後結果後記；不將它當成provider或Production驗收。

正式readback分界：OrgMaster已RELEASED／canonical正常SSO及reload PASS／100%；AI-PDM原事故訂閱ACTIVE及runner rotation APPLIED，但只是發布前置修正，085／RD v7仍NOT_APPLIED／NOT_DEPLOYED。既有worker映像、runner build provenance及paid build證據沿用，不因attempt或source-doc差異重建同輸入。完整Production證據只在private bucket／ignored output；兩fixture新RD能力、Google正式延遲完成及Dani本人仍未證，歷史外鍵處置不擴張。本頁不是Production驗收。