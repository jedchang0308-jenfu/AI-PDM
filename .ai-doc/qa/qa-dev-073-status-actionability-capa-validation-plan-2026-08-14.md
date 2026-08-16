# QA-DEV-073：狀態、責任與審核工作項一致性 CAPA 驗證計畫

狀態：`QA Executed / QC Passed / Human Confirmed / Local Only`  
DEV：`DEV-073`  
SPEC：`.ai-doc/specs/SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001-state-workitem-consistency.md`

## 1. 驗證範圍

驗證 Drawing list、unified detail、approval active inbox 與 canonical/effective lifecycle 是否使用一致事實；驗證「待你處理」具有實際責任 action，不以 owner、歷史或 utility action冒充待辦；驗證 local repair安全、可回復、可重跑。

## 2. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／測試 |
|---|---|---|---|---|---|
| 已完成審核仍顯示待你處理 | published candidate／physical Pending壓過effective evidence | 找不到可做的事、誤判漏件 | A0005 list/detail/inbox交叉比對 | P0 | CAPA-001～004 |
| active review消失但仍標in_review | workflow/request orphan | 無人能處理、流程永久卡住 | DB invariant＋missing-request fixture | P0 | CAPA-005～007 |
| 為修畫面把歷史核准塞回active inbox | 把結果與工作項混為一談 | 重複審核／錯誤決策 | inbox status與decision count | P0 | CAPA-008 |
| current_user只有history/return | viewer只看owner | phantom task | actionability invariant matrix | P0 | CAPA-009～012 |
| repair改壞physical package或重播決策 | 直接SQL／缺交易與hash gate | 稽核與生命週期破壞 | before/after counts/hash/idempotency | P0 | CAPA-013～017 |
| UI錯誤或恢復提示不可達 | 只做server測試 | 使用者仍無法理解／操作 | 三viewport browser＋hover/focus/touch | P1 | CAPA-018～022 |

## 3. Test Matrix

| ID | 前置／操作 | 預期結果 | 證據 |
|---|---|---|---|
| CAPA-001 | published workspace + formal decimal package Pending + terminal FFF confirmation | effective state=`rd_controlled`; workspace僅provenance | projector test |
| CAPA-002 | 同上讀 Drawing workbench | viewer=`usable`、availability=`rd` | API fixture |
| CAPA-003 | 同上讀 unified detail | 不含candidate-controlled history-only shortcut；顯示formal applicable actions | API fixture |
| CAPA-004 | active inbox查同圖號 | 歷史已核准不在active；`status=all`仍可追溯 | inbox/API evidence |
| CAPA-005 | physical/canonical in_review + active request + exact reviewer | reviewer=`current_user`且有decision action | resolver fixture |
| CAPA-006 | 同一request由非reviewer讀 | viewer=`other_user`，可查看進度但非待辦 | resolver fixture |
| CAPA-007 | in_review無request/workflow亦無terminal evidence | viewer=`unknown`；locked查看審核有管理者恢復提示 | API/DOM fixture |
| CAPA-008 | terminal FFF evidence | 不新增request/decision、不改physical Pending | data count diff |
| CAPA-009 | owner相同但rd_controlled | viewer仍usable | pure contract test |
| CAPA-010 | owner相同但只有history/return | 不得current_user | pure contract test |
| CAPA-011 | building owner且edit/submit locked by permission/prerequisite | 可為current_user；reason精確且execution=null | resolver fixture |
| CAPA-012 | `canAct=true` | 至少一個責任action enabled | invariant scan |
| CAPA-013 | protected source執行dry-run | source SHA-256前後相同 | repair report |
| CAPA-014 | 未帶apply確認/hash/backup | apply在寫入前拒絕 | negative command |
| CAPA-015 | 隔離copy apply | 只同步canonical Drawing/Revision；package/event/request/decision counts不變 | before/after JSON |
| CAPA-016 | 相同copy重跑 | changed count=0 | idempotency report |
| CAPA-017 | A0005 current local plan/apply | before drift可見、backup存在、after一致 | redacted local report |
| CAPA-018 | 1440×900 A0005 list→drawer | 5秒內可辨識研發可用；無phantom待辦 | screenshot/DOM |
| CAPA-019 | 1024×768 同流程 | 無裁切、overflow、visible error | screenshot/metrics |
| CAPA-020 | 390×844 同流程 | action footer與狀態可讀可操作 | screenshot/metrics |
| CAPA-021 | orphan fixture hover/focus/touch locked查看審核 | 同一恢復原因可達，不導航、不發request | interaction/network log |
| CAPA-022 | visible error sweep | `.inline-error`／alert／4xx/5xx／route error、console/page error皆0 | browser manifest |

## 4. 資料與安全邊界

- 自動 mutation 只使用 disposable SQLite copy；current local repair須先dry-run、來源hash、備份與明確confirmation。
- 不連 staging／production，不改 schema，不刪 package/event/request/decision，不把小數版轉 `Released`。
- 報告只留 drawing number/revision、狀態、count、hash與backup path；不留cookie、token、檔案內容或使用者隱私資料。

## 5. 通過標準與 QC 指令

全部 CAPA-001～022 有可重跑證據；P0/P1=0；A0005與一般 active/orphan fixtures皆符合契約；TypeScript、affected lint、既有 DEV-072 action resolver與 DEV-055 status回歸通過；真實 browser三viewport有截圖、visible error與資料 sanity證據。

預定指令：

- `npm run qc:dev-073`
- `npm run qc:dev-073:contract`
- `npm run qc:dev-073:data`
- `npm run qc:dev-073:browser`
- `npm run typecheck`

任一測試發現需改 permission、decision authority、schema、production data或無法唯一決定的歷史狀態，停止並回 Dev PM，不以放寬 assertion 結案。

## 6. 執行結果（2026-08-14）

- CAPA-001～012：`qc:dev-073:contract` PASS；DEV-072 action API/resolver回歸 PASS。
- CAPA-013～017：apply前 dry-run只預告 A0005-M01 1筆 Drawing與3筆 Revision；protected counts全0；hash-gated apply建立備份後套用；修復後 dry-run與second pass皆0差異；缺confirmation/hash/backup的negative apply以exit 1拒絕且來源hash不變。
- CAPA-018～022：最終 Chromium run `output/qa/dev-073-status-actionability/DEV073-20260814T103234Z-bb1449b0/` 為7/7。A0005桌機／1024／390皆=`rd_controlled / usable / 研發可用`，動作固定為建立新版次、查看歷史、返回；active inbox不含A0005；orphan fixture於hover／focus／touch皆顯示相同管理者恢復原因，無導航、mutation、HTTP 4xx/5xx、console/page error或visible error。
- 回歸：DEV-055 projection 71/71、contract 13/13；affected ESLint 0 error；TypeScript PASS。
