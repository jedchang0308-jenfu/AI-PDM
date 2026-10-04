# DEV-122：AI-PDM 內部功能缺陷集中紀錄

文件角色：CONTROLLED_ISSUE_LIST；成熟度：Brief Ready；狀態：DEFERRED_BUSINESS_NOT_AUTH_BOUNDARY。

## 目的與唯一邊界

2026-10-03 人類指定 AI-PDM 下一個 native DEV 集中內部功能問題，並將本輪收斂為 Principal-only identity/auth integration。native 索引已登錄 DEV-122，本文件沿用同 ID。owner 是 AI-PDM；發現來源 `AIPDM/DEV-121`，三專案授權主線仍為 `JENFU/DEV-015`／`ORGMASTER/DEV-057`，OrgMaster 只發布穩定身分、角色與 scope，不理解 PDM 內部生命周期。

本列表保存一般功能根因、正常操作前提、source／證據、影響與責任，供後續單專案排程。local source／tests／077 保留未合併、未發布；不再擴寫或執行 lifecycle／附件驗證。已處理歷史問題不能只憑舊 FAIL 再列成現行缺陷；未實測用途標待確認。一般功能延期不加計共同 grant 7/8，也不冒稱業務 PASS。

錯誤 Principal、越權、scope／撤權失效、授權 fallback、既有 release effect 缺 `numbering.publish`，以及安全／可靠發布必要 validator 修正，仍留 [DEV-121 現行契約](DEV-121-target-authorization-boundary.md)。本列表不取消這些安全條件，不新增 Production mutation、IAM、跨 repo source 或資料修補授權。

## 集中問題列表

| ID／實際階段 | 復現／共同根因與影響 | Source 與證據 | 責任與後續 |
| --- | --- | --- | --- |
| D122-01／歷史已處理 | PostgreSQL 工作 payload 已是 JSON object，repository 再 JSON.parse 曾使既有工作 matrix-workspace 503。正常入口：既有 Part 編輯工作→矩陣載入。 | `src/lib/repositories/part-number-matrix-async-repository.ts` 字串／物件解析與欄位驗證已修；歷史 R25/R26 及正式矩陣載入／編輯／重載證據。 | AI-PDM Part read-model owner；resolved／復發追蹤，沒有新復現不重開。 |
| D122-02／歷史已處理 | Autosave 曾與 formalPayload 比較，忽略上次 saved work，改回原值不送 PATCH。正常入口：Part 矩陣 idle／blur→重載。 | `src/components/part-number-matrix-workspace.tsx` 已改 last-saved／normalization／timer；歷史 R26 有兩次 PATCH、還原與重載證據。 | AI-PDM Part UI owner；resolved／復發追蹤，不計作 current 缺陷。 |
| D122-03／已本機修改，驗證未完成 | 正常建立 Draft Part 會有 formal anchor；普通欄位核准仍 Draft。沒有 Principal-only 正常首次發行 intent 路徑，使新 fixture 無法滿足技轉 Active/Released gate。anchor 與正式欄位 generation 本身不是發行證據。 | `src/lib/part-change-work.ts`、`src/lib/repositories/part-change-work-async-repository.ts`、matrix UI／repository；local candidate 已凍結 first_release v2 basis、release-only submit、formal/master CAS、same-tx Draft→Released 與 approval_context。見[原始 QA](../qa/DEV-122-canonical-lifecycle-deferred-2026-10-03.json)。 | AI-PDM Part owner；scope 延後後停止。58 focused PASS 僅證明原 slice；native 5-case partial FAIL，UI NOT_RUN。077、source、runner 不可隨本輪發布。 |
| D122-04／已本機修改，只有 focused 證據 | canonical Drawing major 核准原可產 released revision／production pointer，但 legacy drawing_numbers master 未同步 Released，技轉的 canonical＋master gate 仍拒絕。minor 不應發行，terminal／invalid 不得復活，也不能擴張 root／Part scope。 | `src/lib/drawing-revision-work.ts`、`src/lib/repositories/drawing-revision-work-async-repository.ts`；local candidate 已凍結 exact master link/status/hash 並在 major owner transaction 同步。Drawing focused 37/37 為 agent 回報；major native／UI 未驗，不能宣稱完整修復。 | AI-PDM Drawing owner；後續仍需正常 major/minor、映射缺失／多義、漂移與 rollback/replay 驗收。existing major effect 的 publish grant 防漏獨立留 DEV-121。 |
| D122-05／待確認用途與正式功能證據 | 附件／一般 worker 功能及 bytes 持久化仍須依正常用途逐項確認；R75 已有 bucket／exact create-get IAM readback，application storage activation／Production bytes L4 未執行。資源已建立與功能未驗是不同事實，不能再稱「沒有儲存」。 | `src/lib/file-storage.ts`、`src/lib/google-cloud-file-storage.ts` 及各原 caller；[R75 原始 provider readback](../qa/DEV-121-business-storage-provider-readback-2026-10-03.json)。沒有本輪新復現的 UI／附件功能先標待確認。 Root 的 task-owned synthetic CAD COM activation 回 `0x8002802B / TYPE_E_ELEMENTNOTFOUND`，未產檔；屬驗證環境待確認，非已定案產品缺陷。精確 activation cleanup 為 `EXCLUSIVE_TASK_ACTIVATION_CLEANED`，原始 receipt：`JENFU/DEV-015 output/dev-012/inputs/dev121-synthetic-cad-r75/verified-activation-cleanup.json`。 | AI-PDM file／worker owner；general functionality 延後。Principal／workload／scope／initiator／download 防漏洞及可靠發布 validator 留 DEV-121，不轉給 OrgMaster。 |
| D122-QA-01／待修測例，未證產品 defect | native drift case 在最後 receipt readback 使用字面值 `dev087:review.decision`，DB named-parameter normalizer 誤讀 colon 而報 `POSTGRES_NAMED_PARAMETER_MISSING: review`；fault case 預期 500/503，但 route 回400，未到 rollback/replay 最終核對。 | `src/lib/principal-work-review-owner-grant.postgres-contract.test.ts:209`、`:220`；原始 PostgreSQL 整批 FAIL、22 producer PASS／D57-21 FAIL，cleanup 全true。沒有為結案修掉原始失敗或重新標 PASS。 | AI-PDM QA；後續啟動 DEV-122 時先修測例與故障 envelope 的預期，再重新證明 rollback/replay；當前不擴寫。 |
| D122-06／正式可用性異常，根因待確認 | 2026-10-04T00:28:01Z，Jed 自有 `GET /api/integrations/procurement/releases` 回500、非JSON；同次 MAXIMA query 回403 `numbering_permission_denied`，為預期公司／權限拒絕。列表用途是供 procurement consumer 取得 Released package links；實際外部 caller 未在 AI source join。不可因一筆500猜測 auth fallback／跨公司漏洞或發布阻斷。 | 正式 source `d55ceeaf67748663da3d107e2c904034e9f40bf4`：`src/app/api/integrations/procurement/releases/route.ts` 先驗 `integration.procurement.view`，僅把 verified company 傳入 `handoff-async.ts`／`handoff-async-repository.ts`，再 hydrate submission details。當次證據 `JENFU/DEV-015 output/dev-012/inputs/dev015-r78-procurement-list-auth.json`；runtime logs 尚待 gcloud reauthentication，根因未知。既有 handoff mock／PG package-download 測例不證這個列表的正式可用性。 | AI-PDM read-model／integration owner；列 general availability 待確認，不改成PASS、不擅自退役、不重開歷史問題。取得對應日誌後再判 query／detail hydration／依賴的具體問題；本輪不修一般功能，不移動 DEV-121 的 suspended-account 安全分類修正。 |

## D122-07：外部供應商回覆入口缺少已定義的 Principal／權限政策

外部供應商回覆仍是待決的業務可用性項目。現行 `POST /api/public/shares/[token]/responses` 先要求已驗證的 AI-PDM Principal，再以 `503 supplier_reply_policy_unavailable` 和 `DEFERRED_DEV122_POLICY_NOT_RETIRED` 回覆；它不讀取 share token 或 body，也不建立回覆或稽核紀錄。這是安全收斂，不代表外部回覆功能通過或已退役。現有角色目錄沒有定義外部收件人 actor、公司範圍或回覆權限；不能把 share bearer token 當安全主體，也不能自行新增外部 grant。

證據與後續：`src/app/api/public/shares/[token]/responses/route.ts`、`src/lib/principal-readonly-share.ts` 及 `src/app/api/public/shares/[token]/principal-share-access.test.ts`；`scripts/qc-api-test.mjs` 保留 `SUPPLIER-001` 至 `SUPPLIER-011` 原有 case IDs，對本地 SQLite／cookie 模式標記 `NOT_RUN/DEFERRED_DEV122`，不把它們算 PASS。後續先由 AI-PDM 業務 owner 定義外部 actor、公司界線、可回覆用途及 revoke/expiry 行為，再以實際正常入口驗證。R81 中 `POST /api/settings-secret-probe-jobs/claim` 的 `403 feature_not_open` 是不同 worker route，不能作為本分享回覆入口的授權或可用性證據。

## 已完成 local 檔案與證據保護

[QA 紀錄](../qa/DEV-122-canonical-lifecycle-deferred-2026-10-03.json)列出 18 個 Part/shared/UI/migration/runner 檔與 capture hashes、raw evidence、原始 FAIL、58 focused tests、較早 typecheck、UI NOT_RUN 及 cleanup。Drawing slice由同分支 owner 保留；這是記錄時的 local candidate，未合併、不是官方發布來源。`deferredFiles` 是完整 dirty file capture 與未發布功能的證據清單，不是 deployment allowlist／全檔 stage 清單；同一路徑可能混有延期功能與可分離的安全 hunk。`authOnlyCandidates` 只表示候選判定，不能直接全檔加入發布：root 必須由 exact HEAD `7b02d83d9f5a1ac76002f955f9c9f48939ec8c8d` 抽取選定 hunk，另以實際 variant／patch manifest、paths／hashes 與排除範圍建立 source fence；本 QA 的 capture hashes 不等於該發布來源。當前 owner profile 工作樹包含新增 077，此項屬本 DEV 延後候選；root 必須在 auth-only release source fence 排除這項，不能因 profile dirty path 可讀而誤發布。已套用的既有 migrations 不改寫。

安全 hunk 已完成抽取及合併：Drawing既有major effect的current `numbering.publish`重驗與shared selector `requirePublish`，及可靠發布validator，隨DEV-121 PR199進入官方main `c17b0a73dfaec5811857a373dbd38118731fd825`。上段capture／NOT_MERGED描述是抽取前歷史證據，不是當前待辦；一般077、basis v2、master lifecycle、Part首次發行及UI仍保留未合併候選，不撤回。R76 candidate verify失敗、安全中止且未切流，未算Production PASS；後續安全／可靠owner release／recovery由DEV-121續行，不能因一般功能延期豁免或移到本列表。

Part 額外 owner-Principal guard 判定為「未納入／防禦性候選延期」，不是已證漏洞的必要 mainline fix。r46 獨立查證及 source readback 確認既有 065 `principal_accounts.principal_id PRIMARY KEY`、`pdm_user_id UNIQUE` 保持 one-to-one；HEAD reviewer selector 已排除同 owner profile，decision 已綁 assigned reviewer profile。同 Principal／不同歷史 profile 的 mock 並未證明在既有約束下可到達的正式漏洞。保留 local hunk／原測試證據，但不得以該測例或全檔 path 將它升格為本輪已證必要修正。

native 命令是 OrgMaster existing `node scripts/qc-dev-047-postgres.mjs --suite=dev057`，consumer 指向 AI feature root；只有 disposable PostgreSQL 18.4、Org001–029 與 AI owner profile。它沒有改 OrgMaster producer source／API，沒有寫 primary／Production。fresh lease 與 PID、port50543、temp cluster、清理結果均在 QA；原始 output 先保存後刪除本任務 temp。

歷史 resolved 原證據來源為 [DEV-121 HISTORY_ONLY](DEV-121-target-authorization-boundary-history-2026-10-03.md) R25/R26 以及 `JENFU/DEV-015` 的 `output/dev-012/inputs/dev015-r26-jed-daily-edit-production.json`、`dev015-r26-owner-result-readback.json`、`dev015-r26-restored-work-read.log`。history 只取證，不恢復舊 UID／bridge／future phase 指令。

## 恢復條件與驗收方向

後續由人類啟動 AI-PDM 單專案功能修復排程，先確認 current source、重現與業務語意，再提升同一文件所需成熟度。不把這份 Brief Ready 當 RD 或 Production 操作命令。

生命周期恢復時，最小方向是明確意圖／immutable review basis／不同 Principal／current grants、exact work/formal/master CAS、同交易 owner effect。首次 Part anchor仍不得視為 Released；普通 edit 不改狀態，minor 不發行，終止／invalid 不復活。正常 UI→API→service→native PG 保存、重載、review return/approve、撤權／漂移拒絕、並行／重播、故障 rollback 及技轉 readiness 按實際層級驗證；不使用合成 Active seed、人工 Production SQL 或退役 UID release caller。

附件／worker僅在用途確認後驗其 metadata/bytes/company/purpose/initiator/generation與正常入口；新發現先追加同一列表，不為症狀另建 DEV。文件 ready、本機 PASS、raw FAIL 或資源 readback 都不替代功能完成與正式 L4。
