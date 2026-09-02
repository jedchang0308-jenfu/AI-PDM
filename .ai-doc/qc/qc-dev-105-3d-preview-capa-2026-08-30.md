# CAPA-2026-3DP-001 - SolidWorks 3D 預覽全面不可用

狀態：Corrective Actions Implemented Locally / Revision B QA-QC Complete / Effectiveness Reclosed / Historical 18 of 18 Retained as Baseline / Primary Backfill Human-Gated / Production Release Gated
日期：2026-08-30
更新：2026-08-31
Owner：Dev PM / RD / QA / QC
對應 DEV：`DEV-105`

## 1. 問題與影響

使用者在圖號工作台選取A0002-M01時，3D區顯示「無可用預覽」，但current `.SLDPRT`原檔、實體bytes與
SHA-256都存在。唯讀擴大盤點顯示A0006同樣沒有job/derivative；因此影響不是單一畫面，而是canonical source
建立、背景工作與worker能力之間的系統性缺口。2D PDF可顯示，不在本CAPA故障範圍。

## 2. 事實與根因

| 層次 | 結論 | 證據狀態 |
|---|---|---|
| 症狀 | source存在但UI顯示無3D預覽 | 已確認 |
| 直接原因A | A0002/A0006沒有current preview job或derivative | 已確認 |
| 直接原因B | A0002/A0044均在`Image.FromHbitmap`轉PNG失敗 | 已確認 |
| 控制失效A | canonical detail只投影，不共用prepare/enqueue | 已確認 |
| 控制失效B | launcher把PID alive當成3D healthy | 已確認 |
| 系統根因 | 無silent-gap不變量、current canary與跨producer completion gate | 已確認 |

反事實檢查：若只是A0002檔案損壞，A0044不應在同一轉換點失敗；若只是worker未啟動，直接source-mode也不應
在HBITMAP轉PNG失敗；若UI文案正確，source asset不應存在。三項反事實均不成立。

## 3. Containment、CA、PA

- Containment：停止用process health宣稱3D可用；先列inventory，不對primary盲目backfill；UI區分no source與not generated。
- CA-1：共用idempotent producer/detail recovery，封住新增與既有silent gap。
- CA-2：修正HBITMAP轉PNG並保留non-blank/hash gate。
- CA-3：新增3D canary capability heartbeat，launcher分離process與renderer狀態。
- CA-4：提供dry-run-first inventory/backfill；primary apply需另授權。
- CA-5：shared Drawing/Part projection改用精確使用者語意。
- PA-1：固定18案跨service/DB/Windows/browser/invariant regression。
- PA-2：release gate要求current representative canary，不接受歷史單點證據。
- PA-3：silent-gap count與capability freshness納入runtime/維運檢查。

使用思考習慣：#多層次分析、#第一性原理、#效用理論。優先方案可同時降低使用者誤判、queue漏接與假健康，
且不增加schema或第二套preview authority，總效用高於只改文案或只手動補資料。

## 4. Trace與結案條件

| Root cause | Corrective action | QA | Evidence |
|---|---|---|---|
| producer/detail漏排 | CA-1 | QA-105-001..006 | PASS：upload/detail/retry/terminal recovery同key零增生 |
| HBITMAP converter失效 | CA-2 | QA-105-007..009 | PASS：A0002/A0006/A0044 real source-mode |
| process-only health | CA-3 | QA-105-010..011 | PASS：degraded/ready/blocked + launcher capability gate |
| 無安全補償 | CA-4 | QA-105-012..013,018 | PASS：dry-run、isolated first apply、second zero delta、primary invariant |
| UI語意錯誤 | CA-5 | QA-105-014..017 | PASS：fake/stale/hash fail closed、Drawing/Part desktop+narrow、failure path |

結案需18/18 PASS、A0002/A0006/A0044 real canary、Drawing/Part兩viewport UI、primary invariant與cleanup全部成立；
primary backfill若未授權，必須明確維持Human-Gated，不得把local CAPA effective誤報成primary data已修復。

## 5. 執行紀錄

- 2026-08-30：完成唯讀診斷、根因鏈、Spec Impact、RD Implementation Contract與固定QA plan；產品修正與效果驗證進行中。
- 2026-08-30：完成共用native source prepare/recovery、upload lifecycle enqueue、HBITMAP `GetDIBits` + WPF PNG、
  3D capability heartbeat、launcher health gate、dry-run-first backfill與精確UI狀態。
- 2026-08-30：service evidence 24/24、browser evidence 35/35；固定QA-105-001..018為18/18 PASS。
  A0002/A0006/A0044真實Windows canary均通過；Drawing/Part於1440x900與390x844均顯示同一ready derivative；
  failure path保留受控原檔下載且無console/network意外錯誤。
- 2026-08-30：native preview 112/112、redaction 68/68、DEV-065 contract 30/30、TypeScript、受影響檔案ESLint
  0 error及isolated production build全部PASS。browser primary invariant hash前後皆為
  `fdbba44e3c8b52f47712fc6a1245d849d18da15e5d07bd4b8fdab6ee0b9fd9ea`；port/process/temp cleanup全部完成。

## 6. 2026-08-30 歷史結案判定與未授權邊界

本CAPA的產品程式corrective action與prevention controls已完成並通過固定分母，判定`Local CAPA Effective`。
正式資料修復不是本次授權的一部分：primary dry-run仍有A0002-M01、A0006-M01兩筆silent gap，未執行apply；
production deploy/release亦未執行。後續若要直接補primary，必須以當下DB exact SHA-256重新做fingerprint-gated明確授權，
不得重用本次dry-run指紋。這個Human-Gated後續不否定本機產品CAPA結案，也不得被描述為primary已修復。

Authoritative evidence：

- `output/qa/dev-105-3d-preview/DEV105-service-2026-08-30T13-54-44-787Z/service-manifest.json`
- `output/qa/dev-105-3d-preview/DEV105-browser-2026-08-30T13-56-01-283Z/browser-manifest.json`

上述結案只代表2026-08-30固定18案涵蓋的converter、worker、detail recovery與指定UI路徑；2026-08-31新失敗訊號已使
「整體effectiveness verified」失效。歷史evidence不得刪除或改寫，但不得再用來宣稱首次載入不需manual refresh。

## 7. 2026-08-31 Effectiveness Reopen

### 7.1 新不符合事實與影響

- 第一次進入圖號預覽圖模式時，client只保留第一次list snapshot；worker約3.7秒後完成，畫面仍顯示placeholder，
  使用者必須reload才看見ready image。
- no-source row可能因resolver以drawing number推定`primary_manufacturing_drawing`，或gallery對map缺鍵silent fallback，
  被誤顯示為「預覽尚未建立」。
- 原18案的browser流程會重開detail／重新讀取結果，沒有驗證同一gallery session自動收斂；因此18/18是有效但不足的歷史基線。

影響是P1使用者流程與完成判定失真：系統工作其實成功，UI卻讓使用者判斷失敗並形成reload依賴；同時正常no-source與contract defect
無法區分。Converter與3D capability本身沒有新反證，故不重開已證實的HBITMAP／canary根因，而是重開lifecycle synchronization與evidence control。

### 7.2 多層次根因與反事實

| 層次 | 根因／控制失效 | 證據狀態 |
|---|---|---|
| UI/session | list只在入口讀一次，worker完成後沒有pending convergence | 已由等待後不更新、reload後ready確認 |
| Contract/state | sourceType由drawing identity推定；map缺鍵被fabricate為missing | 已由current resolver／gallery code確認 |
| Service/lifecycle | source binding與job intent跨transaction；detail GET recovery承擔正常producer缺口 | 已由current write/detail call path確認 |
| Verification | 18案測到worker與重讀後ready，未測同session cold-first-load | 已由QA runner與case matrix確認 |
| 系統根因 | preview completion不變量只涵蓋backend artifact，沒有端到端「durable intent→background completion→visible convergence」gate | 確認 |

反事實：若只有worker慢，等待完成後client應在同頁更新；實際不會。若只缺動畫，背景state仍不會轉ready；加動畫不能修正同步。
若resolver state正確，no-source不應帶primary sourceType，map mismatch也不應渲染成正常empty。若原QA足以證明使用者路徑，
首次載入失敗不應在同一候選出現。四項反事實支持本次重開範圍。

使用思考習慣：#多層次分析、#第一性原理、#批判

### 7.3 Containment、CA、PA與效用判斷

- Containment：立即撤回DEV-105整體`Local CAPA Effective`結論，保留18/18為歷史基線；primary/backfill/release gates不變。
- CA-6：對可見pending/delayed卡片加入bounded foreground polling，使worker完成後同一canonical list就地收斂。
- CA-7：修正no-source／sourceType／map exactness；contract mismatch fail-closed，不再以missing placeholder掩蓋。
- CA-8：pending media區加入最小loader＋`預覽建立中`；reduced motion為靜態icon＋文字，狀態完成即停止。
- PA-4：source binding＋job intent改為同transaction durable invariant；detail recovery降為有retirement trigger的legacy safety net。
- PA-5：QA固定新增cold-first-load、poll race、no-source、animation/a11y、transaction與cleanup 12案，禁止reload作成功步驟。

| 根因 | CA | PA | 效用判斷 | 驗證證據 | 建議流向 |
|---|---|---|---|---|---|
| client無visible convergence | CA-6 pending-only poll | PA-5 cold-first-load gate | 低複雜度、短延遲；比SSE/WebSocket更符合目前負載與維運成本 | QA-105-019,020,026,027 | `dev_task`＋QA plan |
| state/map silent fallback | CA-7 strict fail-closed | PA-5 mismatch/no-source regression | 降低誤判與漏檢，無schema／新endpoint成本 | QA-105-023..025 | SPEC＋QA plan |
| pending缺少可理解回饋 | CA-8 local loader＋文字 | PA-5 visual/a11y gate | 最小視覺成本即可降低reload行為；不新增第二焦點 | QA-105-021,022,029 | Gallery SPEC＋QA plan |
| binding/job跨transaction | CA-7以真實state呈現 | PA-4 durable invariant＋retirement trigger | 從源頭降低silent gap，避免長期靠GET副作用；成本低於新增outbox authority | QA-105-024,028 | `dev_task`＋native SPEC |
| QA delivery path缺口 | 撤回整體effectiveness | PA-5固定新分母 | 直接阻止false pass，證據成本與P1風險相稱 | QA-105-030 | QA/QC gate |

使用思考習慣：#設計思考、#效用理論、#當責

### 7.4 Effectiveness re-close gate與routing

DEV-105已完成本機RD與Revision B QA/QC。QA依
`.ai-doc/qa/qa-dev-105-3d-preview-recovery-validation-plan-2026-08-30.md` §7執行新固定
`QA-105-019..030 = 12/12`並重跑001..006、010、014..018；aggregate=`output/qa/dev-105-3d-preview/DEV105-aggregate-2026-08-31T02-21-16-600Z/aggregate-manifest.json`，
同一source revision、task-owned isolated環境、真實browser與Windows worker evidence均齊備。Reload後成功、歷史PNG、direct API或動畫存在都不能替代同頁transition。

Routing recommendation：

- Suggested route：`dev_task`、native/gallery SPEC、QA plan、QC effectiveness report。
- Reason：需要RD修正產品lifecycle與UI，並補原evidence gap；不是只補文件或只做QC。
- Required owner：Dev PM凍結契約；RD實作；QA維護固定case；QC執行且不修改產品。
- Required evidence：QA-105-019..030 12/12、指定回歸、transaction、Drawing/Part visual、a11y、network與cleanup manifest。
- Human decision needed：no；使用者已明確要求重開DEV-105與更新開發文件，且本輪已完成local effectiveness re-close。Primary apply與production release仍另需明確授權。
