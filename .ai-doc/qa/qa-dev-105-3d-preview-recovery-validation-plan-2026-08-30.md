# QA-DEV-105 - SolidWorks 3D Preview Recovery CAPA Validation Plan

狀態：Revision B QA-QC Complete / QA-105-019..030 12/12 PASS / Historical 18 of 18 Retained as Baseline / Primary Backfill Not Applied / Production Release Gated
日期：2026-08-30
更新：2026-08-31
風險：High / P1
對應：`DEV-105`、`CAPA-2026-3DP-001`

## 1. 驗證範圍與角色

目標角色為已登入、可讀該公司圖料資料的Engineer；正常入口為側欄「圖號工作台」與「料號工作台」。
QA建立隔離fixture與凍結case；QC不修改產品，只執行候選版本。所有可寫測試使用task-owned
`PDM_DATA_DIR`／`PDM_REPOSITORY_DIR`，不得seed、clean或repair primary。

## 2. FMEA

| Failure mode | Effect | Detection |
|---|---|---|
| source已綁定但producer漏排job | 永久顯示空白 | silent-gap inventory + upload/detail case |
| repeated detail重複排job | queue膨脹、重複轉檔 | exact idempotency key/count |
| HBITMAP轉換器全域失效 | 所有3D job失敗 | A0002/A0006/A0044 real canary |
| PID alive卻renderer失效 | 假healthy、無人處理 | capability pending/ready/blocked + launcher gate |
| source存在卻顯示沒有檔案 | 誤導使用者 | rendered UI copy + DTO state |
| stale/fake/hash-mismatch derivative被顯示 | 錯圖／證據污染 | resolver/file-read negative cases |
| backfill誤改source或正式資料 | 資料完整性風險 | dry-run default、isolated apply ledger、primary invariant |

## 3. 固定 Acceptance Matrix（18/18）

| ID | 前置／操作 | 預期與 evidence layer |
|---|---|---|
| QA-105-001 | isolated native upload完成binding | exactly one current-hash queued job；DB/service |
| QA-105-002 | 相同upload retry與detail連續讀三次 | idempotency key與job count不變；DB/service |
| QA-105-003 | source存在、無artifact/job後讀detail | recovery建立job並回queued/pending；API/DB |
| QA-105-004 | current ready derivative存在後讀detail | 不排新job且顯示ready；API/DB |
| QA-105-005 | succeeded job但derivative遺失 | 同key安全重排，不新增第二筆；DB/service |
| QA-105-006 | failed/skipped terminal job | recovery可重排且錯誤已清理；DB/service |
| QA-105-007 | A0002真實SLDPRT source-mode | PNG signature/dimensions/quality PASS；Windows artifact |
| QA-105-008 | A0006真實SLDPRT source-mode | PNG signature/dimensions/quality PASS；Windows artifact |
| QA-105-009 | A0044歷史成功source-mode | PNG signature/dimensions/quality PASS；Windows artifact |
| QA-105-010 | canary未執行／成功／converter失敗 | capability依序degraded/ready/blocked且fresh；API/DB/status |
| QA-105-011 | launcher只見PID、capability非ready | 不宣稱3D renderer healthy；runtime status/command |
| QA-105-012 | inventory不帶apply參數 | dry-run、零DB mutation、列出silent gaps；CLI/DB |
| QA-105-013 | isolated apply後重跑 | first run補齊、second run zero delta、source零修改；CLI/DB |
| QA-105-014 | fake/stale/hash mismatch derivative | resolver與file-read fail closed；unit/API |
| QA-105-015 | 圖號工作台正常入口 desktop+narrow | 正確pending/ready copy、實際image、無overflow；browser/screenshots |
| QA-105-016 | 料號工作台正常入口 desktop+narrow | shared projection顯示同一ready preview；browser/screenshots |
| QA-105-017 | worker/API/UI failure path | redacted可行動狀態、原檔仍可下載、console/network無意外錯誤；browser/API |
| QA-105-018 | 完整run前後 | primary schema/identity/residue/FK不變，task port/temp已清理；hash/manifest |

## 4. 證據與判定

Evidence輸出至`output/qa/dev-105-3d-preview/<runId>/`，至少包含manifest、source allowlist metadata、
source/PNG SHA-256、quality metrics、job/derivative/capability allowlist、before/after invariant、browser版本、URL、
1440x900與390x844截圖、console/network摘要、PID/port/runtime宣告與cleanup receipt。不得保存CAD raw bytes副本、
token、secret、完整absolute repository path或primary DB copy。

通過必須18/18且沒有visible error、fake derivative、primary write或cleanup遺漏。任何一案FAIL即回送RD；環境缺少
真實Windows source或可控browser時標`BLOCKED/未充分驗證`，不得縮小分母。

## 5. Stop Conditions

- 需要改寫CAD source、放寬hash/blank quality gate或在Next.js request handler執行native CAD。
- 需要primary/production backfill apply但尚未取得fingerprint-gated明確授權。
- 只能用mock、歷史PNG、direct URL或靜態字串替代指定real Windows/rendered UI evidence。

## 6. 2026-08-30 Execution Result

判定：`QA-105-001..018 = 18/18 PASS`。產品程式的corrective action在本機隔離環境有效；未連線production，
未對primary執行backfill apply，亦未修改任何CAD source。

| Evidence slice | 結果 | Authority |
|---|---|---|
| Service/DB/Windows/backfill | 24/24 checks PASS；包含003..009、011..014與018 | `output/qa/dev-105-3d-preview/DEV105-service-2026-08-30T13-54-44-787Z/service-manifest.json` |
| Authenticated browser/worker/capability | 35/35 checks PASS；包含001..006、010、015..018 | `output/qa/dev-105-3d-preview/DEV105-browser-2026-08-30T13-56-01-283Z/browser-manifest.json` |
| A0002/A0006/A0044 real canary | 三份source-mode PNG signature、dimensions、visible pixels、color/luminance quality均PASS | 同一service evidence的`canaries/`與manifest |
| Drawing + Part rendered UI | desktop 1440x900與narrow 390x844均載入實際image；兩工作台使用同一derivative；failure path可下載原檔 | 同一browser evidence的`screenshots/` |
| Existing regressions | native preview 112/112、redaction 68/68、DEV-065 contract 30/30、TypeScript PASS | 2026-08-30 command receipts |
| Build/invariant/cleanup | isolated production build PASS；artifact=true、primary=true、cleanup=true | `npm.cmd run build:isolated` |

Primary dry-run仍列出A0002-M01、A0006-M01兩筆silent gap；DB SHA-256在dry-run前後皆為
`ecd9f8c377649e22c85315c2774f371fd625603a04b395aab8ccfcc5e4af4525`，native source fingerprint前後皆為
`a057e4d0072068982ea5dc15982be5e2142e798db47fe30a3c9886b5b1fec4b0`。isolated apply第一次建立2筆、第二次
zero delta；primary apply維持Human-Gated。

## 7. 2026-08-31 Effectiveness Reopen — Revision B Fixed Matrix（12/12）

### 7.1 Reopen basis與evidence boundary

2026-08-31使用者可見失敗證明原18案沒有覆蓋「首次list snapshot後，worker在背景完成，而同一gallery必須在不reload下轉ready」。
原QA-105-001..018及其manifest保留為converter／worker／指定detail recovery的歷史基線，但不得再支持整體CAPA結案。

Revision B固定新增`QA-105-019..030`，分母不得縮小；12/12全部PASS後，還必須重跑受影響回歸
`QA-105-001..006,010,014..018`。任一新案FAIL、既有回歸FAIL、visible error、資料sanity異常或cleanup缺漏即回送RD。

所有可寫案例使用task-owned isolated`PDM_DATA_DIR`／`PDM_REPOSITORY_DIR`。Runtime啟動前必須記錄project、purpose、port、
owning process tree、cleanup condition與mutation scope；結束後只停止該task tree、刪除task-owned temp並確認port released。
Primary只做before/after fingerprint、schema、canonical identity、migration residue與`PRAGMA foreign_key_check`唯讀比對。

### 7.2 Reopen FMEA

| Failure mode | 使用者／系統影響 | Fail-seeking detection |
|---|---|---|
| worker完成但client保留first snapshot | 必須手動reload，使用者誤認為失敗 | cold-first-load同頁等待，禁止`page.reload()` |
| timer重疊或stale response覆蓋新filter | 畫面跳回舊資料、額外流量 | artificial latency＋快速搜尋／翻頁＋request ledger |
| no-source／map缺鍵被fabricate為pending或missing | 語意錯誤、永久poll、contract defect漏檢 | no-source fixture＋missing/extra key injection |
| pending動畫造成干擾或成為唯一訊號 | 視覺疲勞、reduced-motion/a11y失效 | screenshot、layout metric、media emulation、accessible tree |
| background refresh重設工作上下文 | selection/focus/scroll/drawer遺失 | 開drawer、keyboard focus、scroll後等待transition |
| failed/unavailable仍無限poll | 網路與server負擔、無法辨識terminal | terminal fixture＋network count/time window |
| transaction仍可commit binding without job | 新silent gap繼續產生 | controlled enqueue failure／concurrency transaction test |

### 7.3 Fixed acceptance cases

| ID | 前置／操作 | 預期與 evidence layer |
|---|---|---|
| QA-105-019 | isolated source＋matching queued job；正常入口首次開Drawing preview；worker延遲後完成 | 不reload、不切mode，同row card由`預覽建立中`轉actual ready image；browser video/trace、network、DB/job/derivative timestamps |
| QA-105-020 | pending card保持selected、keyboard focus、page scroll與open drawer | poll完成後selected key、active element、scroll offset、drawer/detail identity不變；DOM metrics＋screenshot |
| QA-105-021 | pending持續至少一個poll interval | media區只有14–16px低干擾loader＋`預覽建立中`；無toast/helper/full-list loading、無card尺寸或grid位移；1440×900與390×844 screenshot＋bounding boxes |
| QA-105-022 | browser emulates`prefers-reduced-motion: reduce`並重跑pending→ready | 無rotation/pulse；靜態progress icon＋文字仍可辨識，`aria-busy`／accessible name正確，ready後清除；computed style＋accessibility snapshot |
| QA-105-023 | 同頁同時有ready、no-source、pending；pending再轉terminal | no-source固定`無 3D 預覽`且不單獨觸發／延長poll；ready不重抓image；只有pending/delayed驅動list poll，terminal後零新增request；network ledger＋DTO |
| QA-105-024 | source為null但drawing number存在；另注入source exists/no artifact/job | 前者`sourceType=none,state=missing`；後者不可被no-source文案掩蓋，detail safety-net同key補償且不duplicate；unit/service/API |
| QA-105-025 | list response分別缺一個preview key、含extra key、duplicate row key | 三者皆contract fail-closed，不渲染fabricated missing card、不沿用錯row image；contract runner＋browser visible error |
| QA-105-026 | poll request artificial latency；其間快速搜尋、篩選、翻頁，再切document hidden/visible | 同時最多一個in-flight；舊response不覆蓋新結果；hidden零timer/request，visible立即一次recheck；trace＋request IDs |
| QA-105-027 | queued→failed、unavailable與image decode error三條terminal path | card就地顯示`預覽暫時無法顯示`、保留row/drawer；terminal後觀察至少兩個interval零poll；browser/network/console |
| QA-105-028 | controlled job-intent insert failure、transaction retry與兩個concurrent upload retry | 無commit後的binding-without-job；同hash最多一筆job intent；bytes compensation符合既有契約；SQLite＋disposable PostgreSQL service/DB ledger |
| QA-105-029 | Drawing與Part正常入口，desktop 1440×900及narrow 390×844，鍵盤開卡／關drawer | 兩工作台共享正確state transition，無overflow／重疊／截斷／focus loss；visible-error sweep、data sanity、screenshots |
| QA-105-030 | 完整Revision B run前後 | 新12案exact set 12/12、指定舊案回歸PASS；console/network無意外4xx/5xx，primary invariants unchanged，task process/port/temp cleanup complete；aggregate manifest |

### 7.4 判定與必備artifact

新evidence輸出至新的`output/qa/dev-105-3d-preview/<runId>/`，不可覆寫2026-08-30歷史manifest。Aggregate至少保存：

- exact case registry與`QA-105-019..030`逐案PASS/FAIL/BLOCKED結果；
- source revision／dirty boundary、browser exact version、URL、viewport、reduced-motion設定、操作步驟、screenshots與trace；
- poll request count、interval、in-flight最大值、abort/stale response ledger、job/derivative timestamps與transaction evidence；
- visible-error sweep、critical count/data sanity、console/network summary；
- runtime/PID/port/PDM dirs declaration、cleanup receipt與primary before/after invariants。

只有新12/12、指定回歸、visible UI、transaction與cleanup全部成立，QC才可把DEV-105移到`◇ 驗證中`後判定effectiveness；本次 aggregate 已全部成立。
文件完成、typecheck、direct API、worker完成或reload後顯示ready均不得單獨視為PASS。Revision B aggregate=`output/qa/dev-105-3d-preview/DEV105-aggregate-2026-08-31T02-21-16-600Z/aggregate-manifest.json`，
包含contract 8/8、service 25/25、browser 39/39與固定新案12/12；若無safe disposable PostgreSQL或可控真實browser，
對應案例標`BLOCKED／未充分驗證`，不得以SQLite／人工reload／使用者截圖替代。
