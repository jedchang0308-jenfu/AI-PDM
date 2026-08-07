# QA-PDM-HUMAN-STATUS-PROJECTION：驗證計畫

狀態：Local RD Implemented / QA-QC Executed / Production Release Gated
日期：2026-08-07
對應：`DEV-055`、`SPEC-PDM-STATUS-UX-004`
風險：Medium

## 1. 驗證目標

證明圖號、料號、圖料三個總表不再直接堆疊多維狀態，而是由同一 domain projection 產生一個可理解、可行動、可追溯的主要狀態；drawer、filter 與 owner module 必須使用同一結果。

QA 不以「畫面更漂亮」作為驗收。可觀察目標是：使用者 5 秒內知道現在能做什麼，且不會把未完成誤認為已完成。

## 2. 驗證範圍

Phase 1 必測：

- `/numbering/drawings`
- `/parts`
- `/numbering/search` 的 relation tree、root/drawing/part selection
- drawing、part、root overlay drawer
- human status filter；drawing workbench 既有 pagination／cursor consistency
- projection engine、unknown／conflicting evidence fallback
- owner module 與圖料模組共用 drawer 一致性

執行邊界：只驗證 `DEV-055 Phase 1A～1D` 本機產品；不連線或修改 production，不執行 migration、deploy、release、commit 或 PR。

不在本輪：approval、task、import、report、settings、dashboard 全面 rollout；DB migration；production release。

## 3. Required Fixtures

| Fixture | 必備資料 | 預期主要狀態 |
|---|---|---|
| HS-01 | 關聯完整、publication 有效、master 可用 | 可使用 |
| HS-02 | 關聯完整、只有 relation completeness evidence | 關聯完整 |
| HS-03 | 完整 submission readiness、尚未送審、使用者可送審 | 可送審 |
| HS-04 | active review，無更高優先 blocker | 待審核 |
| HS-05 | 缺 primary manufacturing drawing | 缺製造圖 |
| HS-06 | multiple primary / relation conflict | 資料衝突或檢查主圖 |
| HS-07 | drawing lifecycle `rd_controlled`，無更高優先 blocker | 研發受控 |
| HS-08 | formalization recovery 或 release status mismatch | 正式化失敗／發布狀態異常 |
| HS-09 | obsolete / merged / cancelled | 已作廢／已合併／已取消 |
| HS-10 | unknown status 或互斥 evidence | 資料需確認 |
| HS-11 | master 為 Draft，但沒有 confirmation event | 不得顯示已確認／草稿確認 |
| HS-12 | drawing／part 同一 entity 從 owner 與圖料 drawer 開啟 | 狀態與 CTA 完全一致 |
| HS-13 | current user 是 owner/reviewer，客觀狀態仍為 waiting | 待你處理 |
| HS-14 | current user 不是 owner/reviewer | 等他人處理 |
| HS-15 | finalizing background job | 系統處理中；完成後自動更新 |
| HS-16 | current user 是 assignee 但缺操作權限 | 待你處理；detail 說明權限阻擋，CTA disabled |
| HS-17 | part/relation 無 assignee，角色有／無對應 capability | 有權限＝待你處理；無權限＝等他人處理；basis=role_capability |
| HS-18 | drawing lifecycle `rd_controlled` | 研發可用 |
| HS-19 | drawing lifecycle `released` 且無發布衝突 | 生產可用 |
| HS-20 | released 但發布衝突或主要製造圖未正式發布 | 可用範圍待確認／不可生產 |
| HS-21 | relation complete + released | 生產可用 |

每個 fixture 必須記錄 raw source、projection output、可用 action、actor role 與 entity version。

### 3.1 Fixture Placement and Isolation

- deterministic fixtures 放在 `scripts/qc-dev-055-human-status-projection.mjs` 或其同目錄唯讀 fixture module；不得寫入 production-connected provider。
- API/browser fixtures 使用專案既有 local isolated runtime 與測試 company；每次 run 必須輸出 `productionConnected=false`、`productionWrites=false` 與 cleanup 結果。
- drawing owner projection需覆蓋 candidate、formal、review、released、terminal；part需覆蓋需製造圖與不需製造圖；relation需覆蓋 complete、missing、ambiguous、blocked、draft。
- 若固定 3000 只有使用者資料，browser case以唯讀查閱為主；需要 mutation才能造狀態時改用隔離 runtime，不得改寫使用者既有 A0005/A0014 等資料。

## 4. Acceptance Traceability

| ID | Acceptance Criteria | 自動證據 | 人工證據 |
|---|---|---|---|
| QA-01 | 每列最多一個四分類主要狀態 badge；細分原因只在第二層說明 | DOM count / primary label assertion | 三 route 截圖 |
| QA-02 | 禁止「草稿確認」；完成詞都有 evidence | projection matrix / source scan | HS-11 截圖與 detail evidence |
| QA-03 | 優先序符合 spec | table-driven unit/QC | HS-01～10 抽查 |
| QA-04 | list/drawer/filter 使用同一 server projection | API deep-equality / static client-no-projector guard | 同筆資料前後截圖 |
| QA-05 | owner 與圖料 drawer 一致 | shared-component/static guard | HS-12 操作錄影或成對截圖 |
| QA-06 | drawer 是 overlay，可連續切列，只有 header inline X、無 floating control box | DOM/layout assertions | 1440、1024 互動證據 |
| QA-07 | 正常狀態無重複說明，detail axes 預設收合 | text inventory | 紅筆刪除測試 |
| QA-08 | filter 對完整資料集正確 | API/filter/count test | 翻頁前後抽查 |
| QA-09 | 1440／1024／390 無 overflow、重疊、裁切 | browser metrics | 各 viewport 截圖 |
| QA-10 | 無 visible error；失敗狀態有重試或安全返回 | error sweep | error fixture 截圖 |
| QA-11 | icon＋文字同時存在，鍵盤可操作 | accessibility assertions | focus／Escape 操作證據 |
| QA-12 | raw status、internal ID、generic fallback 不出現在主畫面 | rendered text scan | drawer detail 分層抽查 |
| QA-13 | human status filter 在 response limit 前執行；drawing workbench 保留既有 cursor scan/filter | API filter-order/static contract；drawing workbench cursor regression | parts/relations 無 client pagination，不能宣稱跨頁 cursor |
| QA-14 | permission、lifecycle、publication、relation write 無退化 | existing regression suite | 代表性 restricted actor 抽查 |
| QA-15 | 主狀態不混淆完成與未完成；第二層使用人類語言回答責任、是否自動完成與下一步 | projection/detail assertions；browser hover/focus/click | 代表性 waiting/action/usable/terminal 截圖 |
| QA-16 | 同一客觀狀態依 actor 責任呈現正確 viewer 狀態，assignee/reviewer 優先於 capability | actor role matrix；HS-13～17 | 負責人／非負責人雙帳號截圖 |
| QA-17 | viewer 篩選在 response limit 前執行，且 API 不共享快取 | filter matrix、Cache-Control assertion | DevTools response header 抽查 |
| QA-18 | `研發可用／生產可用` 只作為 usable 的範圍文案，不與工作狀態形成第二 badge | availability projector matrix、DOM one-badge assertion | drawing／part／relation 成對截圖 |
| QA-19 | 生產可用具備正式發布與依賴 evidence；資料不足 fail closed | HS-18～21 projection/API assertions | 缺製造圖、未發布主圖、發布衝突截圖 |
| QA-20 | 圖號總表只有圖號、品名、工作狀態三欄；列內不重複主要操作 | table header／DOM absence assertion | 1440、1024、390 截圖；操作仍可由點列開啟抽屜完成 |

### 4.1 RD Slice Gate

| Slice | 允許修改面 | 必須通過才可前進 | 失敗回送 |
|---|---|---|---|
| 1A Contract / projector | shared types、三 projector、badge component | `qc:dev-055:projection`、typecheck、scoped lint | mapping、evidence或unknown fallback 回 1A |
| 1B API / filtering | workbench、part、relation read adapters與 server project/filter | `qc:dev-055:contract`，list/detail parity、filter ordering、permission一致 | drawing cursor維持；parts/relations pagination列 future capsule |
| 1C UI / drawer | drawing/part/relation list與 shared drawer | `qc:dev-055:contract` + drawer/layout regressions | 多 badge、平行 drawer、stale detail回 1C |
| 1D Browser QC | 無新增產品 scope | `qc:dev-055:browser` + aggregate regressions | 第一個失敗即停止，依最早分歧 slice 回 RD |

## 5. Projection Matrix Tests

每個 projector 至少測：

1. terminal 覆蓋其他狀態。
2. failed／blocked 覆蓋 missing、waiting、ready、usable。
3. missing 覆蓋 waiting、ready、usable。
4. waiting 覆蓋 ready、usable。
5. ready 覆蓋 usable。
6. 同一輸入重跑結果相同。
7. 輸入順序改變不影響結果。
8. unknown input 不洩漏 raw value。
9. 沒有 completion evidence 不得輸出完成語法。
10. `nextAction.enabled`、permission 與 disabled reason 與既有 capability 一致。
11. client source不 import projector function；只能 import `HumanStatusProjection` type與 badge renderer。
12. list/detail對相同 entity與 actor回傳的 `schemaVersion/key/phase/label/nextAction` deep-equal。

## 6. User Flow Cases

### UF-01 快速查閱

前置：清單至少 5 筆，包含 usable、waiting、action required。

步驟：

1. 開啟第一筆 drawer。
2. 不關閉 drawer，依序點選另外 4 筆。
3. 檢查 header identity、human status、CTA 與 body 是否同步更新。

通過：沒有上一筆殘影；drawer 不關閉、不推擠清單；切換後回到 body 頂端；每筆只有一個 primary status；沒有獨立浮動 X 或上一筆／下一筆控制盒。

### UF-02 圖料與 owner drawer 一致

步驟：

1. 在 `/numbering/search` 點 drawing。
2. 記錄狀態、CTA、關鍵內容。
3. 在 `/numbering/drawings` 開啟同一 drawing。
4. 對 part 重複相同步驟。

通過：相同 entity/version 的狀態、CTA、owner detail sections 一致；差異只允許外層返回脈絡。

### UF-03 狀態篩選

步驟：依序切換 `待我處理／等他人處理／系統處理中／可使用／歷史`；drawing workbench 另抽查既有下一頁 cursor。

通過：每筆 viewer category 都屬於該 filter；同一資料以負責人／非負責人登入時可落入不同 filter；response limit 前的結果與 API summary 一致；drawing workbench 下一頁仍能沿用 cursor；清除篩選後恢復全部結果。

### UF-04 例外恢復

步驟：觸發 projection load error 或 unknown fixture。

通過：顯示「資料需確認」與重試／安全返回；沒有 raw enum、API route、HTTP 4xx/5xx 或上一筆內容。

## 7. Now What State Matrix

| State | 使用者問題 | 第一個可見答案 | 下一步 | Detail layer |
|---|---|---|---|---|
| action_required | 哪裡壞了？ | 缺製造圖／發布失敗等精確原因 | 修正、重試或 owner route | blockers / audit |
| waiting | 我要做嗎？ | 待審核／發布中 | 等待指定角色或查看進度 | workflow detail |
| ready | 現在可以做什麼？ | 可送審／可發布 | 唯一 primary CTA | readiness detail |
| usable | 能用了嗎？ | 研發可用／生產可用 | 無需說明；需要時開詳細 | scope evidence detail |
| terminal | 還要處理嗎？ | 已作廢／已合併／已取消 | 不用處理或查看歷史 | audit/history |
| error | 為何看不到？ | 資料載入失敗，請重試 | 重試／關閉 drawer | technical detail hidden |

## 8. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| blocker 被 usable 蓋過 | 優先序錯誤 | 誤用未完成圖料 | projection matrix | P0 | terminal/blocker precedence negative tests |
| 未確認顯示成已確認 | 由 Draft 或無 blocker 推論 | 誤認資料已審查 | HS-11 / evidence assertion | P0 | completed label evidence gate |
| list 與 drawer 不一致 | 各自推導狀態 | 使用者不信任系統 | same-entity contract test | P0 | 單一 projection authority |
| 圖料與 owner drawer 不一致 | 平行元件或本地 label map | 同物件兩種答案 | UF-02 | P1 | shared owner detail + static guard |
| filter 只篩目前頁 | client-only filtering | 漏資料、計數錯 | UF-03 / API assertions | P1 | bounded read 後 server projection/filter，再套 response limit；drawing workbench 另維持 cursor scan |
| UI 仍出現多 badge | 舊 StatusBadge 殘留 | 閱讀負擔未改善 | DOM count / text scan | P1 | route-level one-primary-status gate |
| 狀態過度精簡而藏警告 | projector 未納入 blocker | 誤送審／誤製造 | blocker fixtures | P0 | blocker inventory + negative tests |
| drawer 切換顯示上一筆 | async race / stale cache | 看錯物件 | UF-01 slow-response test | P1 | identity-bound loading state |
| drawer / body 雙捲動 | scroll owner 不清 | 快速查閱中斷 | viewport wheel test | P2 | single scroll owner / contain |
| visible error 或 raw code | fallback 直接 render error | 使用者無法恢復 | Visible Error Sweep | P1 | mapped fallback + retry |
| 只靠顏色 | badge 無 icon/文字 | 無障礙誤判 | accessibility check | P1 | icon + text + contrast gate |

## 9. Viewport / Visual QC

必測：

- 1440x900：桌面清單＋overlay drawer。
- 1024x768：低高度桌面，確認 header、drawer 與 scroll owner。
- 390x844：全寬 drawer、無水平 overflow。

每個 viewport 檢查：初始、selected、drawer open、row switch、status detail expanded（hover、focus、click 各一次）、loading、error、terminal。

紅筆刪除測試：逐一檢查頁首副標、列第二行、counts、badge、drawer summary 與 status details；刪除後不影響判斷、下一步或風險者必須移除或降層。

## 10. Visible Error Sweep

每個 route 紀錄：

- URL、viewport、timestamp、fixture、screenshot path。
- `.inline-error`、`[role=alert]`、visible HTTP 4xx/5xx、`Not Found`、`Internal Server Error`、visible `/api/` text。
- console errors 與 failed network requests。
- 關鍵 count 是否符合 fixture；非空 fixture 的全零計數直接 fail。

使用者目前可見畫面若與 QC 證據矛盾，QC 必須 reopen。

## 11. 必建自動化與 QC 指令

RD Phase 1 應新增：

- `qc:dev-055:projection`：table-driven projector、precedence、evidence、unknown fallback。
- `qc:dev-055:contract`：additive DTO、list/detail parity、server filter ordering、drawing cursor regression、permission parity、one badge、禁止詞與 shared drawer contract。
- `qc:dev-055:browser`：三 routes、三 viewport、drawer switching、visible-error、overflow metrics與 screenshots。
- `qc:dev-055`：依序執行 projection → API → UI → browser；第一個失敗即 non-zero exit。

預期檔案：

- `scripts/qc-dev-055-human-status-projection.mjs`
- `scripts/qc-dev-055-human-status-contract.mjs`
- `scripts/qc-dev-055-human-status-browser.mjs`

Phase 1D focused commands：

```powershell
npm.cmd run qc:dev-055:projection
npm.cmd run qc:dev-055:contract
npm.cmd run qc:dev-055:browser
npm.cmd run qc:dev-055
```

既有 regression：

```powershell
npm.cmd run qc:pdm-status-ui-vocabulary
npm.cmd run qc:pdm-status-scope-coverage
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-entity-detail-drawer
npm.cmd run qc:pdm-master-workbench-layout
npm.cmd run typecheck
npm.cmd run lint -- --quiet
```

若 build 受固定 3000 local-dev guard 阻擋，不得繞過；改用專案既有 isolated build 流程或記錄未執行原因。

## 12. QC Evidence Required

- projector matrix JSON / report。
- API list/detail/filter/permission parity report；drawing workbench cursor regression report。
- static authority 與禁止詞報告。
- browser metrics：route、viewport、DOM badge count、page/drawer overflow、visible errors、console/network errors。
- HS-01～21 fixture 對照表，含 viewer responsibility 與 availability scope。
- 1440、1024、390 截圖；至少包含正常、阻擋、等待、終止、drawer switch、expanded status details。
- manual UX review 與紅筆刪除結果。

證據根目錄：`output/qc-pdm-human-status-projection/`。browser 子目錄以 run id 隔離；報告必須記錄 source SHA 或 scoped file hash、啟動入口、feature flag狀態與 provider safety proof。

本機實際證據：`.ai-doc/qc/qc-dev-055-human-status-projection-2026-08-06.md`；Chromium 截圖：`output/playwright/dev-055-human-status/<run-id>/`（1440、1024、390）。

### 12.1 失敗時必收證據

- case ID、fixture、actor role、entity ID/version 與完整 projection input/output。
- 預期與實際 primary status、priority rule、evidence gate、CTA capability。
- route、操作步驟、viewport、timestamp、DOM 可見文字與截圖。
- console error、failed request、response status 與已遮蔽敏感資訊的 response 摘要。
- list、drawer、filter、owner module 中最先出現分歧的位置。

QC 只記錄事實，不修改產品；未通過項目回送 RD。

### 12.2 Manual UX Review

| 問題 | 通過條件 |
|---|---|
| 5 秒內知道現在能做什麼？ | 不開 detail 即可說出可用、等待、要修正或已結束 |
| 完成／未完成是否明確？ | 不依賴顏色，也不需猜「確認」是否完成 |
| 有沒有可刪除的重複文字？ | 正常列沒有同義 badge、第二行或 drawer 重複摘要 |
| drawer 是否支援連續查閱？ | 不關閉即可切換資料，identity/status/CTA 同步更新 |
| 原任務不可執行時是否知道下一步？ | 顯示修正、重試、owner route 或明確不用處理 |
| 是否看見 internal/raw status？ | 主畫面與一般 drawer 均不可見 |

## 13. Pass / Fail

通過：QA-01～20 全數有自動與人工證據；P0/P1 finding 為 0；四個 slice gate、三 viewport 與主要互動無破版或 visible error。

未通過：任一筆顯示多個主要狀態、未完成被寫成已完成、list/drawer/filter 不一致、owner drawer 分叉、blocker 被隱藏、filter/count 失真或關鍵 viewport 無法操作。

未充分驗證：缺真實瀏覽器、截圖、viewport、Now What matrix、drawer switch、Visible Error Sweep 或 manual text-noise review。

阻塞：缺必要 fixture／權限、無法啟動 app，或正確狀態需要 schema／正式資料變更而超出 Phase 1。

## 14. QC Role Boundary

- RD：依 slice實作並提供自我驗證，不得自行把 expected label改成錯誤實作。
- QA：依本計畫維護案例、風險與接受標準；產品契約變動先回 SPEC。
- QC：只依 current source與可重現證據判定；預設不修改產品檔。
- 使用者截圖或實際操作與 QC PASS矛盾時，自動 reopen，舊 PASS降為歷史證據。
