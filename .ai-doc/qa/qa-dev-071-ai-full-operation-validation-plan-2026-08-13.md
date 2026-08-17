# QA 驗證計畫：DEV-071 AI 全功能真實操作

對應任務：`DEV-071 / DEV-PDM-BOM-VISUAL-EDITOR-002`  
對應規格：`SPEC-BOM-VISUAL-EDITOR-001` Phase 2  
角色：QA（本文件只制定計畫，不執行 QC、不修改產品）  
狀態：`AI-operated QC Passed for implemented local scope / Production Release Gated`  
版本：1.0  
日期：2026-08-13  
風險：High；BOM 結構、誤刪、並行覆寫、權限與 Released data 缺陷最高為 P0

## 1. 新驗證門檻與既有證據邊界

使用者新增硬性要求：`每個功能都必須由 AI 在真實 rendered browser 中實際操作`。因此：

- 既有 `20260813102707` browser 36/36、contract/API/schema/typecheck 結果只保留為 focused baseline，不足以讓本計畫 PASS。
- DOM 存在、source assertion、直接呼叫 React callback、`element.click()`、`dispatchEvent()`、直接 API mutation、單元測試、build、lint 或 RD 自述，均不能代替使用者可見功能的真實操作。
- 規格存在但 UI 缺少、無法操作或結果不符時，案例判定 `Fail`；不得標示 `N/A` 或把規格改成配合現況。
- 本計畫原始 gate 為 `Pending`；本輪已由 AI 以真實 rendered Chromium 完成受影響功能與四 viewport recheck，並由獨立 flag-off server session 補 FF-002～004。完整 evidence 及本機 scope 結論已寫回 QC artifact；production rollout 仍受 release gate 管制。

建議以一次完整 AI browser session 跑完桌機全部功能，再以獨立 fixture 執行權限、並行、lifecycle 與 viewport matrix，避免案例彼此污染。

使用思考習慣：#設計思考、#可驗證性、#溝通設計

## 2. 「AI 真實操作」操作定義

每個 UI 案例必須同時符合以下條件：

1. 使用本機實際 Next runtime 與真實 Chromium；由 AI browser control 或 Playwright 的 mouse／keyboard／touch API 操作。
2. 點擊使用可見座標或可及角色定位後的 browser click；按鍵使用 keyboard press/type；拖放使用 pointer down → 至少 6 段 move → preview 停留 → pointer up。
3. 禁止用 `page.evaluate`、React internals、store setter、DOM `click()`、`dispatchEvent()` 或 API 直接製造 UI 成功狀態。`evaluate` 只可讀取 rect、focus、ARIA、overflow、可見文字與資料摘要。
4. 每個 mutation 都要從 UI 看到結果；涉及 persistence、排序、父子關係、數量或狀態時，再 hard reload／back-forward 或 GET readback 證明沒有只改 client state。
5. 每個案例獨立記錄 `caseId、route、actor、fixture、viewport、AI action、actual result、console/network、before/during/after evidence、result`。
6. 若操作工具做不到真實 pointer／keyboard／雙頁籤，該案例是 `Blocked`，整體只能判定 `未充分驗證`，不可改用靜態檢查補成 PASS。

### 2.1 證據最低要求

- 一般 click／keyboard：操作前與結果後 screenshot，加 action log。
- 拖放：before、pointer 尚未放開的 drop preview、after 三張 screenshot 或完整 Playwright trace。
- modal／menu／picker／drawer：開啟、實際操作、關閉／提交後各有證據。
- persistence：UI after screenshot + hard reload after screenshot + server readback 摘要。
- 錯誤／阻擋：人類可理解訊息、可發現的恢復動作、對應 network status、mutation 前後 hash/count。
- 快捷鍵：記錄實際 chord；不得用按鈕結果代替快捷鍵案例，也不得用快捷鍵結果代替按鈕案例。
- 每個案例均須執行 visible error sweep；預期 409/403 可以存在於 network，但 UI 不得顯示 raw API route、SQL、stack、table 或 secret。

## 3. 範圍與不在範圍

### 3.1 必驗範圍

- 工具列 10 個 slot 與所有 pressed／disabled／saving／dirty 狀態。
- 所有 XMind 對應快捷鍵、Windows redo alias 與 Web 原生快捷鍵例外。
- Map、Outliner、節點、hover `+`、inline picker、右鍵選單、三區拖放、Floating stage。
- group／item 編輯、Inspector、fold、focus branch、canvas zoom／fit／pan。
- delete single、delete branch、Undo／Redo、100-step semantic history。
- save／reload／dirty navigation／network failure／stale two-tab recovery。
- unresolved Floating review gate、submit、approve/release/export authority、權限與 immutable 狀態。
- feature flag on/off、legacy compatibility、四種 viewport、keyboard accessibility、visible error 與 information-noise sweep。

### 3.2 執行邊界

- 使用 copied SQLite／disposable fixture、random test port 或固定 `npm run dev:local`；不得連線 production。
- 不執行 live PostgreSQL migration、正式資料 mutation、deploy 或 release。
- PostgreSQL schema shadow、contract、API 測試是 server supporting evidence；不替代 UI 真實操作。

## 4. 測試資料與角色

每一組 destructive／lifecycle／concurrency 案例使用新的 fixture，禁止沿用已被前一組改壞的 Draft。

| Fixture | 必要資料 | 用途 |
|---|---|---|
| `F01-editable-tree` | owner Engineer 的 Draft；3 個 root children；至少一個 3 層 branch、一個 group、一個 leaf；正式節點 10+ | 建立、編輯、排序、折疊、刪除、history |
| `F02-floating-tree` | 正式樹 + 2 棵 Floating subtree，其中一棵有 2 個後代；座標分散 | Floating、雙 graph、歸位、reload |
| `F03-depth-boundary` | 正式深度 9/10、Floating 深度 9/10 | depth fail-closed、invalid drop |
| `F04-clean-review` | 無 Floating、已儲存、可送審、具 change reason | submit → PendingReview → approve → release/export |
| `F05-two-tab` | 同一 Draft、同一 editor version，由兩個 browser context 開啟 | stale winner/loser recovery |
| `F06-permissions` | owner Engineer、other Engineer、R&D Manager、Admin、Manufacturing、Procurement | read/write matrix |
| `F07-statuses` | Draft、Rejected、PendingReview、Released、Archived 各一 | mutable/immutable UI |
| `F08-long-content` | 40+ nodes、長中英文 group name、長料號/品名、quantity 999999.999 | layout、overflow、scanability |
| `F09-legacy-off` | flag off + floating=0；另備 flag off + floating>0 Draft | legacy compatibility／data loss guard |

Canonical picker 至少準備：可用料件 3 筆、同詞多結果 2 筆、無結果 query、不可用／不存在料件各 1 筆。所有 fixture ID、DB path、actor 與初始 graph hash 寫入 manifest。

## 5. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---:|---|
| Toolbar／shortcut 做不同事情 | handler 對應錯誤或模式未分流 | XMind 肌肉記憶造成誤操作 | 分別真實 click 與 keypress，比對 graph diff | P1 | `TB-*`、`KB-*` 全案例逐項執行 |
| UI 有按鈕但無法由 pointer/keyboard 使用 | overlay、z-index、focus、disabled 錯誤 | 功能實際不可達 | 實際 hover/click/Tab/Enter | P1 | 禁止 DOM callback 替代操作 |
| Floating 混入正式 lines／snapshot／export | 雙 graph conversion 或 lifecycle gate 缺陷 | 發行 BOM 污染 | UI 歸位／送審 + reload/API/export readback | P0 | `FL-*`、`LC-*` |
| stale tab 覆蓋 winner | editor version 或 client rehydrate race | 工程變更遺失 | 兩個真實 browser context 交錯儲存 | P0 | `SV-009..012` |
| 拖放落點與預覽不同 | pointer zone、hysteresis、座標計算錯 | 父子關係或順序錯誤 | 真實 mouse drag，放開前/後 graph 比對 | P0 | `DG-*` 三區與轉換矩陣 |
| delete single／branch 語意混淆 | shortcut/menu mapping 錯 | 整枝誤刪 | 真實按鍵、dialog、Undo、reload | P0 | `DH-*` |
| Undo 不是 semantic atom | input/drag/save history 切分錯 | 無法安全復原 | 每種 mutation 做一次再一次 Undo/Redo | P1 | `DH-009..017` |
| input/modal 仍攔截畫布快捷鍵 | focus boundary 漏判 | 輸入時意外新增、刪除、儲存 | 各 overlay 實際輸入所有 mutation keys | P0 | `KB-022..025` |
| unresolved gate 只存在 UI | direct API／stale UI 可繞過 | 游離料件進入審核／發行 | UI + direct HTTP + DB hash | P0 | `LC-001..005` |
| 角色可越權讀寫 | company/owner predicate 錯誤 | BOM 資料外洩或竄改 | 六角色真實登入 + network/DB readback | P0 | `PR-*` |
| mobile／low-height 控制被遮蔽 | fixed toolbar/inspector/scroll owner 錯 | 無法完成主要任務 | 4 viewport 實際點完整關鍵流程 | P1 | `VP-*` |
| 可見錯誤被 fresh browser 掩蓋 | 只看 API/test 成功 | 使用者仍停在失敗畫面 | 同一 surface hard reload + visible error sweep | P1 | `UX-001..006` |
| feature flag off 丟失 Floating data | legacy PATCH 未 guard | 草稿資料被靜默刪除 | flag off 開啟既有 Floating Draft並嘗試儲存 | P0 | `FF-001..004` |

## 6. Gate A－進場、版面與工具列逐項實操

| ID | AI 真實操作 | 預期結果 | 必留證據 |
|---|---|---|---|
| `UI-001` | 以 owner Engineer 登入，hard reload editor route | 5 秒內辨識 root、正式樹、Floating 區、toolbar、view controls；無 visible error | 初始全頁、route、資料 count |
| `UI-002` | 依序用 pointer hover 10 個 toolbar slot | tooltip／label 可理解，按鈕位置與尺寸不跳動 | 10 slot rect + hover montage |
| `UI-003` | 量測 toolbar | 單列 52px；順序 `Undo→Redo→Topic→Subtopic→Insert→Fold→Focus→Save→Detail→More`；save 前靠左、後三項靠右 | screenshot + rect JSON |
| `TB-001` | 真實點擊「復原」 | 只復原最近一個 semantic atom | before/after graph |
| `TB-002` | 真實點擊「重做」 | 恢復剛復原的 atom | before/after graph |
| `TB-003` | 真實點擊「主題」並完成 picker／名稱 | 建立同層主題；取消前零 mutation | picker/action/reload |
| `TB-004` | 真實點擊「子主題」並完成 picker／名稱 | 建立選取節點子主題 | picker/action/reload |
| `TB-005` | 真實點擊「插入」並逐一走 Parent Topic、Floating Topic、群組入口 | menu 項目、位置與結果符合 SPEC；缺項即 Fail | menu + 每項結果 |
| `TB-006` | 真實點擊「摺疊」兩次 | 選取 branch 收合再展開 | before/after |
| `TB-007` | 真實點擊「專注」兩次 | 只看選取 branch，再回完整樹；pressed state 正確 | focus/full screenshots |
| `TB-008` | 製造 dirty 後真實點擊「儲存」 | dirty→saving→已儲存，slot 不位移 | 三狀態 + PATCH |
| `TB-009` | 真實點擊「詳細資料」開關兩次 | Inspector 開／關；畫布不被推擠 | rect before/open/close |
| `TB-010` | 真實點擊「更多」並關閉 | menu 在 viewport 內、focus 可到達、再次點擊或 Escape 關閉 | open/close |
| `UI-004` | 依序檢查 clean、dirty、saving、readonly | mutation controls 的 enabled/disabled/pressed 狀態與原因正確；位置不變 | state matrix |

## 7. Gate B－建立、Picker、編輯與 Inspector

| ID | AI 真實操作 | 預期結果 | 必留證據 |
|---|---|---|---|
| `CR-001` | 在 Map 選正式 item，Toolbar Topic → 搜尋 2+ 字 → click result | 以 canonical item 建立同層，不可自造不存在料號 | picker/result/reload |
| `CR-002` | Toolbar Subtopic → 搜尋 → keyboard Enter 第一筆 | 建立子層，focus/selection 到新節點 | keyboard log + graph |
| `CR-003` | 點節點 hover `+`，完成 picker | 等同 Add Subtopic；hit target ≥32×32，節點不跳動 | hover/click/after |
| `CR-004` | 空白畫布真實 double-click，選料件 | 在 click world coordinate 建 Floating item；node/edge/control double-click 不誤建 | click coordinate + reload |
| `CR-005` | 空白畫布右鍵 → `插入暫存料件` | context menu 留在 viewport；建立 Floating item | menu + after |
| `CR-006` | 建立 Floating group，輸入名稱後 Enter | 一個新 Floating group、一個 history atom | input/after/undo |
| `CR-007` | picker 輸入 1 字、2 字、快速換 query | 1 字不搜尋；2 字搜尋；舊 response 不覆蓋新 query | network timeline |
| `CR-008` | picker 使用同詞多結果，pointer 選第二筆 | 插入第二筆，不誤用第一筆 | results + selected data |
| `CR-009` | picker 輸入無結果 query | 顯示人類可理解 empty state，無 graph mutation | empty + hash |
| `CR-010` | picker 搜尋中按 Escape | 關閉／取消 request；零 mutation；focus 回來源節點 | trace + hash |
| `CR-011` | 模擬 search 失敗後在同一 UI 重試 | 無 raw HTTP/API 文案；可恢復且不重複插入 | error/recovery/network |
| `ED-001` | 選 group 按 Space | 進入 inline edit，文字全選、focus 可見 | input/focus |
| `ED-002` | double-click group，改名後 Enter | 名稱更新且只產生一個 history atom | before/after/undo |
| `ED-003` | inline 改名後 Escape | 還原原名、dirty/hash 不變 | input + after |
| `ED-004` | inline 改名後點外部 blur | 有效非空名稱 commit 一次 | before/after |
| `ED-005` | 選 item 按 Space／double-click | 開 Inspector，不進入可任意修改料號的 inline input | screenshot |
| `IN-001` | 選 root、group、item、Floating item | Inspector 分別顯示 empty/group/item 資訊，selection 同步 | 4 state screenshots |
| `IN-002` | 在 group Inspector 改名，Enter／blur | 更新 group name；一個 history atom | before/after/undo |
| `IN-003` | 在 item Inspector 改 quantity 為 `2.5` | quantity 更新、保存／reload 一致 | field/PATCH/reload |
| `IN-004` | 嘗試 quantity 0、負值、空白、非數字 | 不提交 invalid value；顯示可理解欄位回饋 | 4 attempts + graph hash |
| `IN-005` | 嘗試修改 item 料號、品名、版次 | 欄位唯讀；不得改 canonical identity | DOM + pointer/keyboard attempt |
| `IN-006` | 開 Inspector 後按 Escape | 關閉並回復原節點 focus；selection 保留 | focus evidence |
| `IN-007` | 調整 drawer/Inspector 寬度、reload | desktop 預設/最小寬度與記憶符合 SPEC；overlay 不推擠畫布 | rect + storage/reload |

## 8. Gate C－每個快捷鍵都要實際按

所有案例先用 pointer 選定目標，再由 AI 送出真實 keyboard chord；不得改點同名按鈕。

| ID | 快捷鍵與情境 | 預期結果 |
|---|---|---|
| `KB-001` | Map `Enter` | 開同層 canonical picker；完成後建立同層 |
| `KB-002` | Map `Tab` | 開子層 picker；完成後建立子層 |
| `KB-003` | `Ctrl+Enter` | 新 group 包住選取節點；取消零 mutation；完成為一個 atom |
| `KB-004` | `Space` | group inline edit；item 開 Inspector |
| `KB-005` | `Alt+ArrowUp` | 同父層上移一格；第一筆為 no-op＋低干擾回饋 |
| `KB-006` | `Alt+ArrowDown` | 同父層下移一格；最後一筆為 no-op＋低干擾回饋 |
| `KB-007` | `Ctrl+Delete` | 只刪節點並提升 children，順序不變 |
| `KB-008` | `Delete` leaf | 依契約直接刪除且可 Undo，不誤開 branch-impact 文案 |
| `KB-009` | `Delete` branch | 顯示後代數確認；取消零 mutation；確認後可 Undo |
| `KB-010` | `Ctrl+Z` | Undo 一個 semantic atom |
| `KB-011` | `Ctrl+Shift+Z` | Redo 一個 semantic atom |
| `KB-012` | `Ctrl+Y` | Windows alias Redo 一個 semantic atom |
| `KB-013` | `Ctrl+/` | 收合／展開選取 branch，顯示隱藏後代數 |
| `KB-014` | `Ctrl+Alt+/` 兩次 | 全部收合，再全部展開 |
| `KB-015` | `Ctrl+;` 兩次 | 只看 branch，再回完整樹；左上 recovery 同步 |
| `KB-016` | `Ctrl+S` dirty | 真實保存；clean 時不發 PATCH |
| `KB-017` | `Home` | 選取 root 並置中，page 不意外捲到頂部 |
| `KB-018` | `Escape` inline/picker/menu/context/dialog/Inspector/focus branch | 依最上層暫態逐層關閉；selection 不被清掉 |
| `KB-019` | Outliner `Enter` | 建同層主題 |
| `KB-020` | Outliner `Tab` | indent 成上一個 sibling 的 child，不開 Map subtopic 流程 |
| `KB-021` | Outliner `Shift+Tab` | outdent 一層；root boundary no-op |
| `KB-022` | input focus 時按 Enter/Tab/Ctrl+Enter/Delete/Ctrl+S | 只作用於欄位／dialog，不觸發 canvas mutation |
| `KB-023` | picker focus 時按 mutation shortcuts | picker 按鍵語意優先，graph 不被背景 shortcut 改動 |
| `KB-024` | context menu／delete dialog focus 時按 mutation shortcuts | overlay 不被背景 mutation 影響 |
| `KB-025` | readonly Draft 按所有 mutation shortcuts | 全部零 mutation；navigation/view shortcut仍可用 |
| `KB-026` | `Ctrl+R` | 瀏覽器 hard reload；app 不攔截；已儲存資料回來 |
| `KB-027` | browser `Ctrl++`／`Ctrl+-` | page zoom 由瀏覽器處理；React Flow zoom 不變 |

## 9. Gate D－右鍵選單、階層與真實拖放

### 9.1 右鍵選單每一項

以同一層中間節點與 root 各開一次右鍵選單；確認順序、disabled state、viewport containment、outside click 與 Escape。

| ID | 真實 menu click | 預期 |
|---|---|---|
| `CM-001` | 編輯 | 與 Space 相同 |
| `CM-002` | 主題 | 與 Enter 相同 |
| `CM-003` | 子主題 | 與 Map Tab 相同 |
| `CM-004` | 父主題 | 與 Ctrl+Enter 相同 |
| `CM-005` | 向上移動 | 上移一格；第一筆 disabled |
| `CM-006` | 向下移動 | 下移一格；最後一筆 disabled |
| `CM-007` | 僅刪除主題 | children 提升且可 Undo |
| `CM-008` | 刪除分支 | confirmation／branch count／Undo 正確 |
| `CM-009` | root menu | mutation delete/edit 項 disabled；不得改 root authority |
| `CM-010` | viewport 右下節點開 menu，再 outside click／Escape | menu 不出界，兩種關閉方式都可用 |

### 9.2 拖放矩陣

每一案例必須以真實 pointer drag 執行，放開前截取 preview。preview 必須用線／框／短標籤或 aria-live 表達，不得只靠顏色。

| ID | 真實拖放 | 預期 |
|---|---|---|
| `DG-001` | formal → formal 上 25% | `before`；同父層／新父層順序正確 |
| `DG-002` | formal → formal 中 50% | `child`；成為 target child |
| `DG-003` | formal → formal 下 25% | `after`；順序正確 |
| `DG-004` | formal branch → blank canvas | 整棵轉 Floating；ids、後代、順序保留 |
| `DG-005` | Floating → formal before | 整棵歸位成正式 lines；root coordinate 不進 canonical data |
| `DG-006` | Floating → formal child | 整棵歸位為 target child |
| `DG-007` | Floating → formal after | 整棵歸位並正規化 siblings |
| `DG-008` | Floating → Floating before/child/after | 三種排序／階層結果各自正確 |
| `DG-009` | formal → Floating child | 整棵轉 Floating 並接到 target subtree |
| `DG-010` | formal／Floating → root | 正式 root child 語意正確；root 本身不可拖 |
| `DG-011` | pointer 在 zone 邊界慢速抖動 | hysteresis 穩定，不在放開前跳錯 target |
| `DG-012` | 拖 parent 到自己的 descendant／self | forbidden cursor＋原因；放開後 graph/history/hash 不變 |
| `DG-013` | depth 10 target 接 child | UI 拒絕；server 亦拒絕；零 partial write |
| `DG-014` | readonly／PendingReview 嘗試拖曳 | node 不可拖；零 mutation |
| `DG-015` | search result 拖到 before/child/after | 使用同一 preview 與 canonical item；結果符合 zone |
| `DG-016` | search result 拖到 blank | 建 Floating，不猜成 root child |

## 10. Gate E－刪除、History、折疊、專注與雙視圖

| ID | AI 真實操作 | 預期結果 |
|---|---|---|
| `DH-001` | Ctrl+Delete formal middle node | 只刪 node，children 提升到原位置，順序不變 |
| `DH-002` | Ctrl+Delete Floating middle node | 只刪 node，Floating children 提升，座標/順序合理 |
| `DH-003` | Ctrl+Delete／Delete root | root 不可刪；零 mutation且有可理解回饋 |
| `DH-004` | Delete branch → Cancel | graph/hash/history 不變；focus 回原節點 |
| `DH-005` | Delete branch → confirm | 影響數正確；整枝消失；一次 Undo 全復原 |
| `DH-006` | 點 backdrop／Escape 關 delete dialog | 零 mutation；dialog focus trap 不洩漏 shortcut |
| `DH-007` | 新增後 Undo/Redo | entity id、父層、順序一致 |
| `DH-008` | inline typing 10 字後 Undo | 整段 typing 只回退一次 |
| `DH-009` | drag 後 Undo/Redo | 整次 drag 一個 atom |
| `DH-010` | formal↔Floating 後 Undo/Redo | subtree、id、後代、順序與 graph type 完整恢復 |
| `DH-011` | delete-single／delete-branch 後 Undo/Redo | 各自一個 atom，無多刪／漏復原 |
| `DH-012` | Undo 後做新 mutation | redo tail 被截斷，Redo disabled |
| `DH-013` | 以 AI 連續做 105 個可辨識 mutation | history 最多 100；最近 100 可依序回退，app 不崩潰 |
| `DH-014` | save 後立刻 Undo，再 Redo，再 save | save 不清空 history；dirty baseline 正確；無 prop rehydrate 丟失 |
| `FD-001` | 節點 fold icon | children 隱藏／恢復，顯示 hidden count，不改 formal data |
| `FD-002` | toolbar Fold | 與 icon 結果相同 |
| `FD-003` | 全部折疊／展開 | 正式與 Floating parent 均覆蓋；selection 可恢復 |
| `FC-001` | toolbar Focus branch | 只顯示 branch；root/recovery context 足夠 |
| `FC-002` | 點 `顯示完整內容` | 回完整樹、原 selection/collapse 保留 |
| `VW-001` | 點 Map／Outliner tabs 往返 | 同一 selected entity、collapse、focus、dirty 與 graph state |
| `VW-002` | More menu 切 Map／Outliner | 與 tabs 相同；menu 自動關閉、focus 合理 |
| `VW-003` | Outliner pointer select／double-click／fold | selection、edit、collapse 與 Map 同步 |
| `VW-004` | desktop 切換 view 後 reload | view preference 依 SPEC 記憶 |
| `VW-005` | 390px 首次進入，再切回 Map | 預設 Outliner；使用者仍可使用 Map |

## 11. Gate F－Canvas controls、More menu 與資訊層級

| ID | AI 真實操作 | 預期結果 |
|---|---|---|
| `CV-001` | pointer drag blank canvas | pan 生效，不建立／移動節點 |
| `CV-002` | wheel／trackpad zoom | React Flow zoom 平滑且 ratio 同步 |
| `CV-003` | 點「縮小」 | ratio 下降，min 25% |
| `CV-004` | 點「放大」 | ratio 上升，max 200% |
| `CV-005` | 點「符合畫面」 | 正式樹與 Floating 可見，無節點被 inspector/toolbar 遮蔽 |
| `CV-006` | double-click blank | 只建立 Floating，不觸發 React Flow zoom |
| `MR-001` | More → 心智圖 | 切 Map，pressed state 正確 |
| `MR-002` | More → 大綱 | 切 Outliner，pressed state 正確 |
| `MR-003` | 閱讀 shortcut help | 文案與實際 shortcut 完全一致，不含錯誤 alias |
| `MR-004` | More → 導覽圖 | 可開關，不能常駐搶占畫布；若缺入口則 Fail |
| `MR-005` | More → 設為目前 | 保留既有 BOM lifecycle safety；若規格要求但缺入口則 Fail |
| `MR-006` | More → 複製草稿 | 建立新 Draft，不改原 Draft；若缺入口則 Fail |
| `MR-007` | More → 刪除草稿 | 顯示既有高風險確認與影響；若缺入口則 Fail |
| `UX-001` | 初始、hover、selected、dirty、blocked 狀態做 5 秒理解測試 | 可從結構判斷主物件、可操作物件、目前狀態與風險 |
| `UX-002` | 掃描 header/toolbar/stage/node/inspector | 無重複共用資訊、逐節點教學句、非必要 DEV/API/raw status |
| `UX-003` | 檢查 Floating/drop/selected/disabled | 顏色不是唯一訊號；有位置、形狀、icon、短標籤或 ARIA |

## 12. Gate G－儲存、並行、導航與恢復

| ID | AI 真實操作 | 預期結果 | 必留證據 |
|---|---|---|---|
| `SV-001` | clean 狀態點 Save／Ctrl+S | button disabled 或零 PATCH；不產生空 audit | network + DB count |
| `SV-002` | 修改 group/qty/order 後 Save | formal＋Floating 同一 PATCH；version +1；success count 正確 | UI/PATCH/readback |
| `SV-003` | Save 後 hard reload、back/forward | graph、selection（存在時）、collapse/focus contract與 version 一致 | 3 screenshots |
| `SV-004` | dirty 時點 `BOM 工作台` | 阻擋離開並提供保存／復原方向；不得靜默丟資料 | visible recovery |
| `SV-005` | dirty 後 browser reload | browser 原生 reload 可用；依產品 contract 提示或只回已保存 baseline，不可假裝已保存 | reload trace |
| `SV-006` | PATCH network offline／500 | dirty/history 保留；人類訊息可理解；恢復網路後可重試 | error/retry/hash |
| `SV-007` | Save 中快速再按 Save／Ctrl+S | 只有一個 PATCH，不 double save／double audit | network timeline |
| `SV-008` | Save 完成瞬間立即再編輯 | 新 edit 不被 parent rehydrate 覆蓋 | frame/action/reload |
| `SV-009` | 兩個真實 tab 同 version，各做不同變更 | tab A save 成 winner；tab B 保留本地狀態待處理 |
| `SV-010` | tab B Save | 409 persistent recovery；winner DB 不被覆蓋 |
| `SV-011` | tab B 點「重新載入伺服器版本」 | 載入 winner、清除 conflict、無盲目覆蓋 CTA |
| `SV-012` | 409 後 back/forward/hard reload | recovery 一致，不進入無法理解的半狀態 |

## 13. Gate H－Floating、審核、Release、權限與 Feature Flag

### 13.1 Floating 與 lifecycle

| ID | AI 真實操作 | 預期結果 |
|---|---|---|
| `FL-001` | 建 2 棵 Floating subtree | stage 顯示虛線／短標籤/count；Outliner `未納入 BOM (n)` 永遠可見 |
| `FL-002` | Save → hard reload | 所有 Floating node、parent、順序、root coordinate 一致 |
| `FL-003` | 定位／選取第一個 Floating | Map/Outliner/Inspector 同步，可直接處理 |
| `FL-004` | 將整棵 Floating 拖回正式樹 | 後代完整歸位；count 降低；Undo 可逆 |
| `FL-005` | 將正式 branch 拖到空白 | 整棵移入 Floating；正式 count／stage count 正確 |
| `LC-001` | 有 Floating，More 輸入 review reason | `送出審核` disabled，顯示 count、影響與可定位恢復 |
| `LC-002` | 直接 submit HTTP（supporting negative） | 409 `BOM_FLOATING_TOPICS_UNRESOLVED`；UI/DB/review 零 effect |
| `LC-003` | 有 Floating 的 PendingReview 走 reviewer approve | server 再檢查並拒絕；無 snapshot／status partial mutation |
| `LC-004` | 全部歸位但 dirty，輸入 reason | 仍 disabled並提示先保存 |
| `LC-005` | clean、無 Floating、reason 空白 | disabled；輸入有效 reason 後 enabled |
| `LC-006` | 真實點擊送出審核 | 成為 PendingReview；editor mutation controls readonly |
| `LC-007` | reviewer 真實開啟、核准 | 產生 Released snapshot；formal hierarchy、qty、revision一致 |
| `LC-008` | 真實下載／開啟 release export | 無 floating 欄位、topic、座標或 draft-only metadata |

### 13.2 權限與狀態

| ID | 角色／狀態實操 | 預期結果 |
|---|---|---|
| `PR-001` | owner Engineer 開啟並保存自己的 Draft | 可讀／可寫 |
| `PR-002` | other Engineer 開啟／嘗試 PATCH | 依 company/owner contract fail closed；零 mutation |
| `PR-003` | R&D Manager 開啟並保存 company Draft | 可依 scope 編輯 |
| `PR-004` | Admin 開啟並保存 company Draft | 可依 scope 編輯 |
| `PR-005` | Manufacturing 真實登入並直達 route | 不可讀 Draft editor或唯讀依 authority；PATCH 403、零 mutation |
| `PR-006` | Procurement 真實登入並直達 route | 同上 |
| `PR-007` | PendingReview／Released／Archived 打開 editor | mutation button/shortcut/drag/field均不可用；view/navigation仍可用 |
| `PR-008` | Rejected 打開 editor | 依契約可修正再送審，保留 reject context |

### 13.3 Feature flag

| ID | AI 真實操作 | 預期結果 |
|---|---|---|
| `FF-001` | flag=true hard reload | v2 editor 與 additive API 啟用 |
| `FF-002` | flag=false、floating=0 hard reload | legacy editor 可正常讀寫，無 v2 control leakage |
| `FF-003` | flag=false、已有 Floating hard reload | 顯示 blocked handoff，不得讓 legacy save 靜默刪除 Floating |
| `FF-004` | flag=false 對已有 Floating 嘗試 legacy PATCH | 409 `BOM_EDITOR_V2_REQUIRED` 或等價 fail-closed；兩 graph hash 不變 |

## 14. Gate I－Viewport、Accessibility、Visible Error 與資料合理性

### 14.1 Viewport matrix

| ID | Viewport 與真實操作 | 通過標準 |
|---|---|---|
| `VP-001` | `1440×900` 跑 Gate A～G 全部 UI 案例 | 所有功能可達；無重疊、裁切、水平 overflow |
| `VP-002` | `1024×768` 建立、picker、drag三區、Inspector、More、save | toolbar slot 順序不變；主內容與控制完整在 viewport |
| `VP-003` | `768×1024` Map/Outliner、Floating、delete dialog、conflict | 無浮層出界、雙 scroll owner 混淆或不可達 CTA |
| `VP-004` | `390×844` Outliner 建立／編輯／fold／save／review blocker | 預設 Outliner；toolbar可水平操作；editor bottom ≤ viewport |
| `VP-005` | `390×844` 切 Map、開 picker/menu/dialog/Inspector | mobile overlay完整、鍵盤出現後仍能取消／提交 |
| `VP-006` | `F08-long-content` 於四 viewport | 長字串、quantity、40+ nodes 不破版；scroll owner 清楚 |

### 14.2 Accessibility 與 runtime hard gate

| ID | AI 真實操作／檢查 | 通過標準 |
|---|---|---|
| `AX-001` | 只用 Tab/Shift+Tab/Enter/Space/Escape 跑 toolbar→tabs→canvas controls→Inspector→More | 可達、順序合理、focus ring 可見、無 keyboard trap |
| `AX-002` | 檢查 toolbar/menu/tree/dialog/tab/alert roles與 accessible names | icon button、pressed/selected/disabled、dialog label正確 |
| `AX-003` | zoom 200%、browser text scale／高對比檢視 | 核心功能不裁切；狀態不只靠顏色 |
| `ER-001` | 每個 critical state 掃 `.inline-error`、`[role=alert]`、HTTP、Not Found、Internal Server Error、`/api/` raw text | 非預期可見錯誤為 0；任何一筆立即 Fail |
| `ER-002` | 全程收集 console/pageerror/network | console error=0；非預期 4xx/5xx=0；預期錯誤有 case mapping |
| `ER-003` | 初始與每次 mutation 記錄 formal/floating/count/version/selected state | 不可出現預期有資料卻全 0、重複 id、負 quantity或失蹤 branch |
| `ER-004` | 錯誤 recovery 後在同一 tab hard reload | 原可見錯誤消失且資料正確；fresh tab 不可代替 |
| `UX-004` | 紅筆刪除與 information-noise sweep | 無非必要 DEV ID、fixture、API route、raw status、逐項 CTA或重複說明 |

## 15. Server supporting evidence（不能代替 UI）

AI 完成真實 UI 操作後才執行：

```text
npm run typecheck:app
npm run qc:dev-071-contract
npm run qc:dev-071-api
npm run qc:bom-workbench-migration-path
npm run qc:postgres-shadow
npm run qc:doc-paths
```

直接 API 負向案例必須包含 stale 409、unresolved 409、403、cycle、orphan、depth>10、cross-draft parent、non-finite position、immutable status、transaction rollback與 Released export readback。

## 16. 執行順序與 QC 指令

1. 複製 DB、建立 fixtures、確認 `productionConnected=false`／`productionWrites=false`，開啟 v2 flag。
2. 以 `F01` 在 1440×900 逐案執行 `UI/TB/CR/ED/IN/KB/CM/DG/DH/FD/FC/VW/CV/MR/UX`；每個 control 與 shortcut 都要有獨立 action record。
3. 以 `F02/F03` 執行 Floating、轉換、invalid drop 與 depth boundary。
4. 以兩個真實 browser context 執行 `SV-009..012`；不得以兩個 HTTP client 代替 UI conflict。
5. 以 `F04/F06/F07/F09` 真實登入逐角色／狀態執行 lifecycle、permission、flag cases。
6. 在 1024×768、768×1024、390×844 執行 viewport matrix，不得只 resize 後截初始畫面。
7. 執行 supporting commands、整理 manifest、逐項填 `Pass/Fail/Blocked`；任何 Pending/Not Run 都阻止整體 PASS。
8. QC 只回報事實；發現 defect 立即保留同一 tab、trace、fixture與 DB，不修改產品，交回 RD。

## 17. Evidence manifest

Evidence root：`output/qa/dev-071-ai-full-operation/<runId>/`。

必須包含：

- `run-manifest.json`：commit/branch、dirty boundary、runtime、DB、flag、actors、fixtures、production boundary、cleanup。
- `case-results.json`：本文件每個 ID 都有唯一紀錄，不得只寫群組 PASS。
- `actions.jsonl`：timestamp、caseId、browserContext/page、pointer/keyboard action、target accessible name、before/after state digest。
- `network.jsonl`、`console.jsonl`、`page-errors.jsonl`。
- Playwright trace 或等價逐步操作記錄；拖放必須能看到 pointer 放開前 preview。
- screenshots 按 `<caseId>-<before|during|after>-<viewport>.png` 命名。
- `server-readback.json`：draft version、formal/floating hierarchy、review/release/export摘要與 mutation hash。
- `open-defects.md`：priority、重現步驟、actual/expected、fixture、evidence path、是否阻斷。

單一案例紀錄至少為：

```json
{
  "caseId": "KB-007",
  "operator": "AI",
  "operation": "keyboard",
  "input": "Control+Delete",
  "route": "/bom/workbench/<draftId>",
  "viewport": "1440x900",
  "actor": "owner-engineer",
  "fixture": "F01-editable-tree",
  "beforeEvidence": "...",
  "duringEvidence": "...",
  "afterEvidence": "...",
  "serverReadback": "...",
  "result": "Pass|Fail|Blocked",
  "actual": "..."
}
```

## 18. PASS、Fail 與停止條件

整體 `PASS` 必須同時滿足：

- 本文件所有 case ID 都由 AI 真實操作，`Pass=100%`、`Fail=0`、`Blocked=0`、`Pending/Not Run=0`。
- 工具列按鈕、快捷鍵、menu item與觸控／pointer入口分別驗證；不能互相代替。
- 所有 mutation 的 UI 結果、reload/server readback一致；semantic history、雙 graph與 editor version無資料遺失。
- P0/P1/P2 open defect 均為 0；P3 也必須記錄並經使用者明確接受，QA/QC 不可自行豁免。
- 四 viewport、keyboard-only、visible error、console/network、data sanity與information-noise gate全部通過。
- `productionConnected=false`、`productionWrites=false`、cleanup只移除本 run資產且結果為 removed。

以下任一狀況立即停止並判 `Fail` 或 `Blocked`：Floating 進 Released、stale 覆寫 winner、權限越權、刪除不可復原、cycle/orphan/depth invalid 被接受、UI 需要 JS 注入才能操作、目前可見 surface 有非預期 error、fixture 資料失蹤、或需要 production mutation 才能繼續。

使用思考習慣：#可驗證性、#設計思考

## 19. 本輪 QA/QC 結論

本輪以 AI 真實 pointer／keyboard 操作完成實作範圍的回歸：`npm run qc:dev-071-browser` 最新 run `output/qa/dev-071-xmind-bom-editor/20260813131302/run-manifest.json` 為 56/56、17 screenshots、console error 0、unexpected HTTP 0；`npm run qc:dev-071-flag-off-browser` 最新 run `output/qa/dev-071-flag-off-browser/20260813131601/run-manifest.json` 為 10/10，含 flag=false hard reload、blocked handoff、legacy save、409 fail-closed 與 graph unchanged。Supporting contract/API/typecheck 亦通過。實作 scope QC gate 為 `PASS`；production flag activation、live migration、正式資料 mutation、deploy/release 仍為 `Gated`，不在本輪授權內。
