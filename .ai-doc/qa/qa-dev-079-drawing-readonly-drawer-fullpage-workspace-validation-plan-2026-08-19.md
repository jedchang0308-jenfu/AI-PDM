# QA-DEV-079：圖號唯讀抽屜與全頁編輯工作區驗證計畫

狀態：`RD Implemented Locally / Focused Evidence Available / Independent QC Pending / Production Release Gated`

日期：2026-08-19  
對應：`DEV-079`、`SPEC-PDM-ENTITY-DETAIL-DRAWER-001` 的 DEV-079 RD Implementation Package、`SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001` 的 DEV-079 amendment  
Human decisions：`HD-079-01 / 1B`、`HD-079-02 / 2A`、`HD-079-03 / 3A`、`HD-079-04 / Visual-first amendment`  
風險：Medium / P1  
證據根目錄：`output/qa/dev-079-drawing-fullpage-workspace/<run-id>/`

## 1. 驗證目標

證明 Drawing 的「快速查閱」與「長時間 mutation」已形成唯一且可理解的分流：

```text
圖號清單 -> 唯讀右側抽屜 -> 同分頁 canonical full-page workspace
                              -> 完成／取消 -> 原清單與原列
```

驗證重點不是 route 存在或按鈕可見，而是：

1. 所有 Drawing drawer 分支都不會產生 mutation；
2. candidate、formal revision、owner review 與 Drawing reviewer 各自只有一個合法 full-page owner；
3. 左側圖面主視覺、右側版次／OCR任務、readiness 與送審的分層、權限、錯誤恢復及返回上下文一致；
4. 本 DEV 不改變既有 Drawing／Revision／File、approval、permission、lifecycle、idempotency、concurrency 與 audit authority。

本文件保留驗證計畫，並同步記錄本輪已取得的 focused evidence。`qc:dev-079:contract`、typecheck、focused regressions、isolated build與瀏覽器證據不等同 QA-079-01～28 全部PASS；不得以 DEV-053／067／070／072 的歷史綠燈替代 DEV-079 證據。

## 2. Scope、out of scope 與執行邊界

範圍內：

- `/numbering/drawings` 清單、legacy／unified Drawing drawer、canonical owner workspace 與 Drawing review workspace。
- `/numbering/drawings/[drawingId]/workspace` 的 `edit_revision`、`submit_review`、`create_revision`、`manage_files`、`withdraw_review`、`recovery`、`view` intent。
- `/approvals/[requestId]` 的 Drawing-surface exact reviewer 決策。
- `/numbering/revisions?...` 舊 deep link 相容與 canonicalization。
- owner workspace 的 visual-first 2D／3D 主視覺、右側`版次與檔案／智慧辨識`task tabs、candidate-revision OCR source、quick review與2D evidence overlay。
- safe `returnTo`、URL list state、browser history、reload、direct URL、selected-row restoration 與 unsaved guard。
- required／recommended file rules、partial upload、readiness、submission、409/idempotency 與 visible-error recovery。
- 1440×900、1024×768、390×844 rendered browser、keyboard、focus、touch、sticky、overflow 與 safe area。

範圍外：

- Part／Relation drawer 全面唯讀化及其既有 approval actions。
- 新 schema、migration、permission、lifecycle state、domain command、approval assignment 或 persistent editor store。
- production／staging data、migration、deployment、release、traffic cutover 或受保護 runtime 操作。
- 像素級 scroll 位置還原；驗收是原列可見、選取與合理 focus 恢復。

QA 執行只能使用本機隔離資料副本與 task-owned free port。若啟動 temporary runtime，必須記錄 project、purpose、port、process tree 與 cleanup condition；完成後只停止該 task-owned process tree並確認port釋放。

### 2.1 RD slice admission與QA ownership

本輪實作以DEV-079 amendment的責任檔案為邊界；因實際共用既有workbench與controller，原先預估的檔案數與檔名已由實際diff校正，不能再引用未建立的`drawing-full-page-workspace.tsx`或兩個不存在的079 runner。現行新增驗證入口為`scripts/qc-dev-079-contract.mjs`與`npm run qc:dev-079:contract`；瀏覽器證據由 Playwright CLI 以本機既有runtime取得。QA不得替RD修改產品、替換expected、放寬permission或補資料取得PASS；QA只驗證實作事實、輸出finding與evidence。

| Slice gate | QA admission check | Exit evidence |
|---|---|---|
| `079-A Route/action foundation` | Drawing/Approval safe return、stable ID route、surface-specific resolver可獨立測試 | route/action/security matrix；Drawing為navigate／locked／omitted，Part／Relation snapshot不變 |
| `079-B Canonical full-page owners` | owner與reviewer direct URL已可載入，write仍走既有authority | state×actor、required/recommended、dirty、401／403／404／409／5xx focused evidence |
| `079-C List-state recovery` | API response具有雙向cursor且location codec可round trip | next／previous、back／forward、reload、expired cursor／missing row evidence |
| `079-D Atomic drawer cutover` | 079-B／C皆通過，legacy與unified不得分批宣稱完成 | 兩flag branch、所有Drawing state×actor DOM/network zero mutation；Part／Relation回歸 |
| `079-E QA freeze` | 實際diff inventory與deviation review完成 | QA-079-01～28、browser、typecheck、isolated build、aggregate與cleanup evidence；目前仍待獨立QC收斂fixture blockers |

不得用中間slice作staging／production release candidate。若D只完成一個drawer branch、B存在平行command logic、C只能單向返回，或inventory外變更未經PM amendment，QA拒絕admission並退回RD。

## 3. Test oracle 與架構不變量

1. canonical Drawing identity 是 `drawing:<id>`；owner route path 使用穩定 `drawingId`，不使用可變圖號或 candidate workspace ID。
2. Drawing drawer 的 network oracle 是 zero mutation：互動期間不得送出 POST／PUT／PATCH／DELETE，允許 GET／HEAD 與 preview/download navigation。
3. `surface=drawing` 的 mutation action descriptor 只能是 `navigate`、locked 或 omitted；drawer 收到 `command`／`local` 亦不得執行。
4. full-page write 仍由既有 API 與 server permission 決定；client query／disabled state 不能解鎖。
5. owner full page 與 reviewer full page 不得同時掛載同一 request 的 decision control；exact reviewer 由 server request authority 重驗。
6. legacy 與 unified Drawing drawer 必須同時唯讀；`PDM_UNIFIED_ENTITY_DETAIL_V1` 不得成為寫入旁路。
7. Part／Relation 的既有 resolver 與 drawer action 是負向回歸，不因 Drawing 收斂被移除。
8. full-page DOM order必須是左側`圖面主視覺`先於右側`版次與辨識操作`；右欄是唯一task content scroll owner，footer不覆蓋左右欄。
9. OCR create使用`candidate_revision`與目前未移除的`sourceFileAssetId`；OCR status／pending count／feature flag不得出現在`canSubmitCandidate`或任何submit blocker。
10. inline OCR只重用既有session與decision API；進階歸類、排除、impact與formalize導向canonical完整核對頁，不得複製正式寫入command。

## 4. Required actor、state 與 fixture matrix

每個 fixture 記錄 canonical Drawing ID、顯示圖號、revision、workspace／request ID、lifecycle、rowVersion、required／recommended files、owner、reviewer、permissions、expected CTA、destination 與資料 cleanup 策略。

| ID | Fixture／state | Owner expectation | Reviewer expectation | Readonly／admin expectation |
|---|---|---|---|---|
| FX-079-01 | candidate `building`，無檔案 | `edit_revision`；送審 blocked | 無 decision | 唯讀；admin 不因角色名稱自動可寫 |
| FX-079-02 | `drawing_preparation`，只有 3D | 工作區指出缺主要 2D | 無 decision | 唯讀 |
| FX-079-03 | `drawing_preparation`，主要 2D＋3D，缺 PDF／DWG | 可進 `submit_review`；只有建議警告 | 無 decision | 唯讀 |
| FX-079-04 | `bundle_ready` | `檢查並送審`導覽至 full page | 無 decision | locked／view |
| FX-079-05 | `in_review` | view；有既有撤回能力才可在 full page 撤回 | exact reviewer 到 `/approvals/[requestId]` | 非 exact reviewer zero decision |
| FX-079-06 | `correction` | 繼續編輯、保留退回理由 | 已完成 request唯讀 | 唯讀 |
| FX-079-07 | `auto_finalizing` | view／refresh，無人工送審 | 唯讀進度 | system-admin無證據時不得出現 recovery |
| FX-079-08 | verified `recovery` | 依既有 capability進 recovery | request authority允許時處理 | 只有既有 recovery actor可執行 |
| FX-079-09 | `rd_controlled`可進版 | `create_revision` | 無 decision | view |
| FX-079-10 | `released`可進版 | `create_revision` | 無 decision | view |
| FX-079-11 | cancelled／obsolete／merged／history | history唯讀 | history唯讀 | history唯讀 |
| FX-079-12 | stale rowVersion／兩個 actor並行 | 第二次 write 得 409 並 refresh | 同 request重複決策受 idempotency／state gate | 無旁路 |
| FX-079-13 | legacy `/numbering/revisions` deep link | resolve後進 canonical workspace且內容一致 | 不適用 | 無雙寫頁 |
| FX-079-14 | Part／Relation approval | 不適用 | 維持原契約 | 證明未被 DEV-079 誤傷 |
| FX-079-15 | candidate有2D＋3D、尚無OCR session | 上傳成功或進頁即以candidate revision自動ensure；相同來源集合不得重複建立 | 無 decision | readonly顯示既有權限，不產生假可寫控制 |
| FX-079-16 | OCR `review_ready`含proposed／conflict與geometry | 可接受／修正；證據切至左側2D並定位 | 依既有recognition permission | 無權者只顯示資訊狀態 |
| FX-079-17 | OCR feature off／403／無geometry | 版次與送審流程不受阻；證據至少顯示文字來源 | 不適用 | 無raw error／raw geometry／失敗型假警報 |

必要 actors：Drawing owner RD、exact RD reviewer／RD主管、非 owner readonly、具既有 recovery/admin capability者。測試不得假設「Admin」必然具所有 domain write；以實際 permission payload 為準。

## 5. Acceptance traceability

| ID | Acceptance criterion | Automated evidence | Rendered／interaction evidence |
|---|---|---|---|
| QA-079-01 | legacy 與 unified Drawing drawer DOM 均無 form、file input、dropzone、save、submit、withdraw、approve、return、reject、obsolete mutation control | source／DOM inventory | 兩 flag branch截圖與 keyboard sweep |
| QA-079-02 | Drawer 互動 network 為 zero mutation | request method log＋allowlist | preview、download、copy、CTA逐項操作 |
| QA-079-03 | Drawing mutation descriptor 全為 navigate／locked／omitted，Part／Relation unchanged | resolver matrix | owner／reviewer drawer CTA對照 |
| QA-079-04 | owner canonical route使用 stable Drawing ID與 allowlisted intent | route contract＋direct URL | URL、完整圖號、狀態一致 |
| QA-079-05 | exact reviewer canonical route使用 request ID並由 server重驗 | actor／403 matrix | exact／non-exact reviewer成對走查 |
| QA-079-06 | 舊 revisions deep link可 canonicalize 且無第二套 command logic | compatibility contract | deep link、reload、back證據 |
| QA-079-07 | 全頁順序為頂部→左側圖面主視覺→右側任務分頁→底部 actions；左側先於右側DOM | DOM order assertion | 三 viewport截圖 |
| QA-079-08 | `儲存版次`只儲存草稿，不等於檔案完成或送審 | API/action assertion | success feedback後狀態仍正確 |
| QA-079-09 | required為主要 3D＋主要 2D；PDF、DWG／DXF只建議 | readiness matrix | hover/focus/touch說明與 blocker文案 |
| QA-079-10 | 主畫面無常駐「必要檔案齊全後即可送審」；缺檔時仍有精確短 blocker | visible text scan | 缺2D／缺3D／只缺建議檔畫面 |
| QA-079-11 | 多檔部分成功可逐檔重試，不重傳成功檔 | upload request/result log | mixed-result畫面 |
| QA-079-12 | safe return保存完整 list state與 selected row | URL round-trip matrix | 完成／取消／back／forward／reload |
| QA-079-13 | external、protocol-relative、control-char、錯 surface `returnTo`被拒絕 | security negative matrix | fallback短說明 |
| QA-079-14 | cursor過期、page失效、row消失皆有可解釋 fallback | stale location tests | 第一安全頁／保留filters／notice |
| QA-079-15 | dirty input離開有 discard guard；成功上傳不被誤判dirty | navigation state tests | 返回、切圖號、browser back |
| QA-079-16 | 401／403／404／409／5xx與未知 submit 結果遵循 recovery contract | fault injection／idempotency log | 人類可理解錯誤、無 raw payload |
| QA-079-17 | active-review lock、separation of duties、company scope與permissions無退化；唯讀時在版次／上傳區就地顯示原因，且有權owner仍可選檔 | API negative matrix | owner/reviewer/readonly/admin成對畫面；disabled reason與file picker走查 |
| QA-079-18 | 1440×900與1024×768為visual-first雙欄、右欄自行捲動，390×844依主視覺→任務分頁單欄；footer不遮內容且無水平 overflow | geometry metrics | full-page screenshots＋scroll video/sequence |
| QA-079-19 | tooltip可 hover／focus／touch，Escape關閉，focus順序與名稱正確 | accessibility assertions | keyboard-only與touch走查 |
| QA-079-20 | visible、console、network unexpected error為0 | error sweep | 每個主要 state／viewport檢查 |
| QA-079-21 | full-page與drawer不並存兩套 mutation component | source mount inventory＋network log | 由所有入口各走一次 |
| QA-079-22 | full-page只有一個 canonical status badge與恰一個 primary action | DOM count | 各state視覺檢查 |
| QA-079-23 | 2D／3D一次只顯示一個大型tabpanel，預設2D且可鍵盤切換 | component／ARIA contract | ready／pending／missing各狀態截圖 |
| QA-079-24 | 右欄`版次與檔案／智慧辨識`切換不丟未儲存資料；正常流程無`開始辨識`、待核對badge或常駐待核對文案，且OCR不改submit gate | source／state contract | 切tab、dirty guard、submit disabled reason |
| QA-079-25 | OCR create使用candidate revision＋目前受控file assets；每次成功上傳與進頁backfill均ensure且相同來源集合去重；批次接受／修正沿用decision API且rowVersion／idempotency仍生效 | request body＋API matrix | owner正向、重複ensure、409、readonly／403成對走查 |
| QA-079-26 | OCR證據可切回2D且依來源真實呈現：只重用既有單一preview surface，不新增PDF tab、第二viewer、route、附件或版次。同source/page只加框；跨file/page在原viewer暫時切換並顯示檔名／頁碼，多頁PDF導向精確頁，返回／清除焦點恢復原preview kind/source/page。有合法 PDF normalized geometry 必須顯示對應定位框；CAD property 才可顯示檔案屬性無座標且不可把畫面冒充CAD定位；legacy/unlocatable PDF 必須明示 PDF/page 與無可用座標。不得以「property flash 或 box 任一」作通用 PASS；advanced入口到canonical完整核對頁，embedded頁無formalize command | DOM／source inventory＋route/network/data-write allowlist＋exact source/location/restore assertions | same-page／cross-file／multi-page PDF geometry、CAD no-geometry／legacy PDF、返回原圖面、feature-off與permission-empty截圖 |
| QA-079-27 | 候選圖號唯讀抽屜的「圖面預覽」固定同排呈現3D與2D兩張卡；檔案缺少或預覽處理中仍保留可理解狀態 | `qc:dev-079:contract`＋DOM inventory | 1440／1024／390 viewport截圖與預覽狀態走查 |
| QA-079-28 | 「歷史版次」預設收合；每一版次可獨立展開查看版次狀態、檔案與唯讀查看入口，且不產生 mutation | `qc:dev-079:contract`＋DOM／network allowlist | 有歷史資料 fixture的展開／收合、檔案查看與zero-write走查 |

## 6. Contract、API 與 security cases

### 6.1 Route／action contract

- 接受：`/numbering/drawings/<stable-id>/workspace?intent=edit_revision&returnTo=<encoded-/numbering/drawings...>`。
- 拒絕／正規化：unknown intent、drawing ID與resolved entity不符、已進 review卻要求 edit、terminal卻要求 submit。
- reviewer route的 request不存在、已完成、非 Drawing surface、非 exact reviewer分別驗證404／readonly／out-of-scope／403，不以隱藏按鈕冒充安全。
- Drawer CTA點擊只能發生 same-tab navigation；不得 `window.open`，不得先送 mutation再跳頁。

### 6.2 Return and list-state contract

Drawing return payload至少覆蓋 keyword、view、stage、series、purpose、record／human status、includeHistory、sort、layout、detail、opaque cursor、bounded page／pageIndex與 selected row。驗證：

1. encode→decode round trip；
2. browser back／forward與hard reload；
3. invalid／expired cursor；
4. selected row離開filter或已刪除；
5. external URL、`//evil`、encoded control chars、`/approvals`誤傳到Drawing；
6. Drawing route不經 approval-only normalizer回退成`/approvals`。

### 6.3 Write authority and data sanity

- 每次 write記錄 actor、permission、drawing/revision/request、rowVersion、idempotency key、pre/post lifecycle與HTTP結果。
- save draft不得建立 approval request；upload不得自動 submit；recommended檔缺少不得阻擋；required檔缺少必須阻擋。
- 送審恰建立／重用一個 request；未知結果refresh後不得重複建立。
- 409、403、5xx與partial upload後，比對 Drawing、Revision、File、request count、active revision及audit；不得有 orphan revision/file/request。
- Drawer zero-write案例前後做 business hash／row count比對；任何非預期差異直接 P0。

## 7. Rendered UX、responsive 與 accessibility plan

每個 viewport 至少覆蓋 FX-079-01、03、05、08、09、11，以及 upload error／409／403：

- `1440×900`：左側大型2D／3D主視覺、右側至少360px task panel與獨立捲動、底部 action bar。
- `1024×768`：visual-first雙欄仍可操作；圖面不被表單推離、右欄文字不逐字斷行、無水平overflow。
- `390×844`：頂部→圖面主視覺→版次／OCR task panel→底部 actions單欄；safe area與最後一項可見。

互動檢查：Tab／Shift+Tab、Enter、Space、Escape、瀏覽器上一頁、touch tooltip、dropzone keyboard替代、error focus、modal focus trap（只適用送審 confirmation）、返回後原列 focus。顏色不能是唯一狀態線索；圖示有 accessible name，完整圖號不可被「M 圖面」取代。

Visible-error hard gate：畫面不得出現 raw JSON、`PREVIEW_NOT_READY`等 machine code、stack、SQL、`/api/`字串、`Internal Server Error`、失敗但未處理的 `[role=alert]`、上一筆資料殘影、空白 preview error panel、文字重疊、水平 overflow或 sticky遮擋。

## 8. FMEA 與預防／偵測控制

評分：Severity／Likelihood／Detection 各 1～5，RPN=`S×L×D`；RPN≥30或任何 P0 必須在 QA 前關閉。

| Failure mode | Cause | User／data impact | P | S/L/D | RPN | Prevention control | Detection／evidence | Owner | Disposition |
|---|---|---|---|---|---:|---|---|---|---|
| legacy drawer仍可寫 | 只改 unified branch | 雙路徑、規則不一致 | P0 | 5/3/3 | 45 | atomic zero-write＋client assertion | 兩flag DOM/network/business hash | RD→QA | Block |
| drawer descriptor仍執行command | resolver遺漏state | 未經完整頁確認即送審／決策 | P0 | 5/3/2 | 30 | Drawing mutation只允許navigate | full state×actor resolver matrix | RD→QA | Block |
| full page複製command logic | 快速重寫既有流程 | audit/idempotency分裂 | P0 | 5/2/4 | 40 | 既有API authority＋mount inventory | source/API trace＋duplicate request test | RD→QA | Block |
| route用drawingNumber/workspaceId | identity可變或alias | deep link錯圖、歷史失效 | P1 | 4/3/3 | 36 | stable canonical Drawing ID | resolve／rename／legacy deep-link test | RD→QA | Block |
| Drawing return被approval normalizer吞掉 | helper綁死surface | 返回錯頁、條件遺失 | P1 | 4/4/2 | 32 | surface-aware allowlist helper | return round-trip／negative URL matrix | RD→QA | Block |
| cursor/page未進URL | adapter漏欄位 | 回到錯結果、找不到原圖 | P1 | 3/4/2 | 24 | read/write location contract | multi-page/back/reload case | QA | Fix before pass |
| non-exact reviewer可決策 | client信任action payload | 未授權審核 | P0 | 5/2/2 | 20 | request authority重驗 | exact/non-exact direct API＋UI | QA/QC | Block |
| required/recommended顛倒 | UI copy或gate分叉 | 不該擋被擋／缺主檔送審 | P0 | 5/3/2 | 30 | DEV-061 single authority | complete file combination matrix | QA | Block |
| partial upload整批重試 | 缺逐檔結果 | 重複檔、使用者不確定 | P1 | 4/3/3 | 36 | per-file result/idempotency | request log＋file count/hash | QA | Block |
| sticky bar遮擋最後欄位 | 多scroll owner／safe area遺漏 | 無法完成手機任務 | P1 | 3/4/2 | 24 | one scroll owner＋bottom padding | geometry＋full-scroll screenshots | QA | Fix before pass |
| dirty guard誤含成功上傳 | state邊界混合 | 無謂警告或誤丟輸入 | P1 | 3/3/3 | 27 | persisted upload與local input分離 | navigate cases＋server refresh | QA | Fix before pass |
| 409後盲目重送 | 不查server truth | 重複request或覆蓋他人 | P0 | 5/2/3 | 30 | refresh＋idempotency | concurrent actor test＋audit | QA/QC | Block |
| Part／Relation action被一併移除 | resolver過度全域化 | 其他domain功能退化 | P1 | 4/2/3 | 24 | surface-specific branch | DEV-067/070/072 regression | QA | Block |
| raw preview/API錯誤外露 | error boundary不足 | 無法理解且暴露內部資訊 | P1 | 3/4/2 | 24 | human error mapper | visible/console/network sweep | QA | Block |
| OCR誤成送審gate | client把pending／feature狀態併入readiness | 無OCR權限或功能關閉者無法送審 | P0 | 5/3/2 | 30 | submit gate只讀既有bundle readiness | source contract＋feature-off／403 submit case | QA | Block |
| OCR使用錯版來源 | drawing-number latest與candidate files不一致 | 核對到舊圖或錯版 | P0 | 5/2/3 | candidate_revision＋source asset set | request body／source-set mismatch case | QA | Block |

## 9. Failure、recovery 與 negative gate

| Failure | Expected result | Data assertion |
|---|---|---|
| 401/session expiry | 既有登入／session recovery，安全保留return | zero write |
| 403 permission | 顯示缺少能力與應聯絡角色，無假可寫control | zero write |
| 404 Drawing/request | 回安全清單並說明，不留上一筆內容 | zero write |
| 409 stale rowVersion | refresh server truth、保留可安全重填資料、要求再確認 | 不覆蓋他人版本 |
| upload單檔失敗 | 成功檔保留，失敗檔可單獨retry | file count/hash正確 |
| submit response中斷 | 先依idempotency／request truth refresh | request恰一筆 |
| 5xx/read failure | 保留未送出輸入、提供retry、人類文案 | 無partial domain commit |
| stale cursor／missing row | 保留有效filters，回安全頁並說明 | 不開錯row |

任何測試不得用放寬 expected、關閉 permission、直接改 DB state或略過錯誤畫面取得 PASS。

## 10. Planned automation、regression 與 evidence

本輪已交付／執行：

- `scripts/qc-dev-079-contract.mjs`：route、stable identity、drawer zero-write、visual-first DOM order、2D／3D tabs、right task scroll、candidate OCR source、inline decision delegation、OCR非submit gate、cursor/page、required/recommended help與唯讀上傳原因；`npm run qc:dev-079:contract` 22/22 PASS。
- 目前瀏覽器focused evidence：list→Drawing readonly drawer→owner workspace，確認1280×720下左圖右task、右欄獨立scroll、2D／3D與版次／OCR tabs、readonly OCR permission state；完整三viewport／owner OCR mutation仍待獨立QC。
- `package.json` command：`qc:dev-079:contract`。本輪沒有新增不可重現的fixture browser runner或aggregate command。

既有 expected 必須有意更新並保留非 DEV-079 回歸：

- `scripts/qc-dev-053-drawing-workbench-http.mjs`
- `scripts/qc-dev-067-unified-entity-contract.mjs`
- `scripts/qc-dev-072-action-api.mjs`
- `scripts/qc-pdm-numbering-approval-review-ui.mjs`

最小執行順序（其中瀏覽器步驟本輪以 Playwright CLI 人工執行，未宣稱 runner PASS）：

1. `npm run qc:dev-079:contract`
2. `npm run typecheck:app`
3. DEV-053／067／070／072 focused contract／UI regressions
4. Playwright CLI：list → Drawing readonly drawer → owner workspace → reviewer direct URL
5. 既有 DEV-053／067／070／072 browser regressions
6. `npm run build:isolated`
7. `npm run qc:dev-079` 作最終聚合（尚未建立此 aggregate command；不得誤報為已通過）

每個 run 必須輸出 manifest、source SHA／scoped hash、fixture/actor/state matrix、route/action assertions、DOM inventory、request method log、API result摘要、pre/post data sanity、screenshots、console/network/visible-error報告、overflow/accessibility metrics、runtime process/port與cleanup證明。不得收集 production secrets或輸出完整敏感 payload。

### 10.1 Pre-implementation dirty baseline（2026-08-19）

此基線在DEV-079產品／測試實作前取得，且worktree已有使用者變更；只用於差異歸因，不是DEV-079 PASS evidence。

| Command | Baseline |
|---|---|
| `npm run qc:dev-053:ui` | FAIL 23/24：formal filters／linked-part identity |
| `npm run qc:pdm-entity-detail-drawer` | FAIL：candidate identity assertion |
| `npm run qc:dev-067:ui` | PASS：舊editable candidate drawer expected |
| `npm run qc:dev-067:navigation` | PASS：舊approval-only return expected |
| `npm run qc:dev-072:contract` | PASS |
| `npm run qc:dev-072:api` | PASS |
| `npm run typecheck:app` | PASS |

兩個baseline FAIL必須保留原始輸出、重現與歸因；可由DEV-079正確實作一併關閉，也可交給明確獨立owner，但在最終079-E前不得維持未處置狀態。禁止刪除case或改成只檢查字串存在。

### 10.2 本輪 RD focused evidence（2026-08-19）

| Evidence | Result | Boundary |
|---|---|---|
| `npm run qc:dev-079:contract` | PASS 22/22 | route、owner／reviewer authority、drawer zero-write、visual-first／OCR、cursor/page、required／recommended help、唯讀上傳原因 |
| `npm run typecheck:app` | PASS | 本輪產品型別與既有型別邊界 |
| focused regression | PASS | DEV-053 UI 24/24、DEV-053 HTTP 14/14、DEV-067 contract/navigation、DEV-072 contract/API、entity-detail drawer 42/42 + search target、approval review UI 18/18 |
| affected-file ESLint | PASS 0 errors | 本輪產品／contract script；globals.css僅有既有ignore warning |
| `npm run build:isolated` | PASS | Next compile、TypeScript、124/124 static pages、canonical owner／reviewer routes |
| Browser focused | PASS focused | list→Drawing readonly drawer→owner workspace；1280×720量測左574px／右360px，task body `overflow-y:auto`，2D／3D與版次／OCR tabs可切換，readonly OCR 403轉為資訊狀態；尚非三viewport／owner mutation完整PASS |
| `npm.cmd run qc:dev-079:layout-browser` | PASS 3/3 | 2026-08-20 density/layout、preview filename 與 file metadata cleanup amendment；1440×900／1024×768／390×844 均確認預覽計數、重複圖號、預覽 footer 檔名與右側受控檔案 `numbering-submission-result-file-meta` 移除、2D／3D tab 檔名同列、tab／editor 間距為0、PNG置中填滿、horizontal overflow=0、console／request failure／visible alert=0；不取代 QA-079-01～28 完整矩陣。Evidence：`output/qa/dev-079-layout/20260820020110-browser/` |
| `npm.cmd run qc:dev-079:recognition-layout-browser` | PASS 3/3 | 2026-08-20 silent auto-recognition 與 batch-review amendment；正常流程`開始辨識`不存在，13個可核對候選保留13個輸入、每列操作按鈕為0、全頁只有1個`完成核對並儲存`。欄位修改訊號、focus定位、無座標來源提示、未儲存離頁guard均通過；desktop／tablet／phone均horizontal overflow=0，console／request failure／visible alert=0。Evidence：`output/qa/dev-079-recognition-layout/20260820023754-browser/` |

### 10.2.1 2026-08-20 density/layout amendment evidence

本輪依使用者紅線標記只調整 owner workspace presentation：預覽 `N 類` 計數與預覽標題列移除，候選版次右欄的重複圖號、受控檔案列輔助 metadata 與左側大型預覽下方重複檔名 footer 移除，2D／3D tab 顯示檔名並取消 tab／編輯器的多餘留白；右側編輯器以內容高度排列，仍保留版次儲存、檔案標題、上傳、智慧辨識與底部生命週期操作。未改 domain data、API、permission、recognition authority 或送審 gate。

2026-08-21 版面補充：底部生命週期操作列須成為右側 task column 的子節點，左側不得存在空白 preview placeholder；桌面左側預覽延伸至工作區底部，窄 viewport 維持主視覺→task panel→sticky 操作列，且最後一個欄位與按鈕均不得被遮擋。

2026-08-21 PDF 預覽補充：內嵌 PDF viewer 隱藏上方 toolbar 與左側 thumbnail navigation；另開原始 PDF 連結仍保留 viewer 操作列與精確頁碼定位。

2026-08-21 人工核對密度補充：辨識欄位標題採 13px、一般字重，並收斂標題／輸入／來源的 Y 軸間距；mobile 例外標籤優先同列排列；候選列採透明背景與無框線，避免卡片式色塊干擾掃描；批次儲存按鈕在 sticky 操作列上方保留 8px 安全間距。

2026-08-21 例外提示補充：`與系統正式值不同` 保留為短標籤，滑鼠 hover、鍵盤 focus 與觸控點擊均可取得包含「系統正式值：實際值／尚無」的說明；候選欄位不再常駐顯示系統值，提示以 portal 浮層呈現。

2026-08-21 正式值判定補充：系統正式值為 `null`、空字串或 `無` 均視為未設定，不建立或保留「與系統正式值不同」衝突，辨識結果直接以待核對值為主；不同來源／適用範圍辨識出不同值的衝突仍須人工核對。

2026-08-21 空白 observation 合併補充：同一 canonical field 已有唯一非空辨識值時，其他來源的空白／blocked observation 不得覆蓋該值或製造衝突；只有全部 observation 都無值時才維持 blocked，不同非空值並存時才標示 conflict。

可重現命令：`npm.cmd run qc:dev-079:layout-browser`。Evidence root：`output/qa/dev-079-layout/20260820020110-browser/`，含 `desktop.png`、`tablet.png`、`phone.png` 與 `browser-verification.json`；另驗證左側大型預覽不再渲染 `drawing-preview-footer` 檔名，右側受控檔案不再渲染 `numbering-submission-result-file-meta`。此 focused evidence 只證明本次密度／版面切片，不宣告 QA-079-01～28 或 production/release 完成。

### 10.2.2 2026-08-20 recognition density amendment evidence（歷史切片）

本輪依第二張紅線標記收斂智慧辨識 task panel：移除 tab badge、`輔助工具`標籤、compact 送審前說明與狀態 chip、重複統計摘要及分類標題；來源檔案角色屬內部 metadata，從候選清單與待處理計數排除。另依候選卡紅線移除`辨識／修正值`、`目前值`與`可信度`的可見輔助文字。此輪保留逐欄接受／修正操作的 evidence 只作歷史切片，已由 10.2.3 的單一批次儲存契約取代。

歷史 evidence root：`output/qa/dev-079-recognition-layout/20260820013849-browser/`。現行驗收與可重現命令以 10.2.3 為準；此切片不取代 QA-079-01～28 完整矩陣。

### 10.2.3 2026-08-20 silent auto-recognition evidence

正常流程的`開始辨識`已移除。candidate revision 上傳成功後由 server 呼叫 deduplicated ensure；owner workspace 進頁時若已有來源、但沒有相同來源集合的最新 session，會自動建立並輪詢 queued／extracting。處理中只顯示安靜狀態，完成直接顯示結果；feature-off／403／自動建立或載入錯誤保留明確例外與重試，且不阻擋版次或送審。

人工核對同步收斂為欄位 focus／click定位、無座標來源提示、已修改文字訊號與單一`完成核對並儲存`；逐欄`套用修正／接受`和常駐`待核對`文案均移除。可重現命令：`npm.cmd run qc:dev-079:contract`、`npm.cmd run typecheck:app`、affected ESLint、`npm.cmd run qc:dev-068:contract`、`npm.cmd run qc:dev-079:recognition-layout-browser`。Browser evidence：`output/qa/dev-079-recognition-layout/20260820023754-browser/`。

### 10.2.4 2026-08-22 adjustable detail-panel evidence

桌面版 owner workspace 在主預覽與「版次與辨識操作」之間提供低干擾分隔線，可用滑鼠拖曳或鍵盤左右方向鍵調整右欄寬度；`Home`／`End` 可移至允許範圍兩端。使用者選定的像素寬度保存在瀏覽器偏好，重新整理後沿用；版面限制右欄至少 360px、最多 720px，並為左側預覽保留至少 420px。`<=900px` 改回單欄，分隔線不顯示且不造成水平溢位，但回到桌面寬度時仍恢復已保存偏好。

Focused evidence：`npm.cmd run qc:dev-079:contract`、`npm.cmd run typecheck:app`、affected ESLint。實頁 1440×900 以方向鍵將右欄由 360px 調為 384px，reload 後仍為 384px；534×698 為單欄、分隔線 `display:none`、horizontal overflow=false；回到 1440×900 恢復 384px。驗證後已將測試偏好還原為 360px，並解除暫時 viewport override。本切片不宣告 QA-079-01～28 全矩陣完成。

### 10.3 未關閉的獨立 runner／fixture findings

- `npm run qc:dev-067:browser`：fixture缺少一筆`pending native candidate review`，不是DEV-079 drawer zero-write或canonical route assertion失敗。
- `npm run qc:dev-072:browser`：既有fixture cleanup發生SQLite foreign-key failure，並留下本次精確temp目錄；已確認該目錄已移除，未停止共用local runtime。
- `qc:pdm-system-detail-drawer-ui`：既有 runner引用工作樹不存在的`scripts/qc-pdm-numbering-import-center-ui.mjs`，屬既有文件／fixture邊界，不由DEV-079補造。

上述 findings 阻擋 QA-079-01～28 的獨立QC freeze，不阻擋本輪 RD product implementation；不得在沒有補證據前把DEV-079標成完整QA/QC PASS。

## 11. Pass、fail、未充分驗證與 stop conditions

PASS：QA-079-01～28全部有可追溯證據；P0/P1 open finding=0；Drawing drawer unexpected mutation=0；duplicate mutation path=0；visible／console／network unexpected error=0；權限、idempotency、data sanity、return security與三viewport全部通過；task-owned runtime清理完成。

FAIL：任一 Drawing drawer可寫、owner/reviewer authority錯置、required gate錯誤、open redirect、non-exact reviewer可決策、重複request、資料不一致、Part／Relation退化、sticky遮擋或 raw error外露。

未充分驗證：只做source scan、只看單一帳號、只測單一viewport、沒有network method audit、沒有pre/post data sanity、沒有back/reload/direct URL、沒有兩drawer branch或沒有錯誤注入。

停止並回 Dev PM：實作需要新 schema／permission／lifecycle／command owner；stable Drawing ID無法成為route identity；review request無唯一full-page authority；surface-aware safe return無法完成；或無法同次移除所有 Drawing drawer write path。QA只制定與執行驗證、回報事實，不修改產品來讓案例通過；QC須由獨立角色依本計畫驗證。
