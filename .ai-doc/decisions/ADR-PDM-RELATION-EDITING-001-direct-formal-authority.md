# ADR-PDM-RELATION-EDITING-001：以抽屜矩陣直接更新正式關聯

Status: `Accepted / Human Confirmed / RD Implemented / Local QA-QC Complete / Production Release Gated`
Date: 2026-08-23
DEV: `DEV-090`
SPEC: `.ai-doc/specs/SPEC-PDM-INLINE-RELATION-MATRIX-001-direct-formal-edit.md`

## Context

DEV-087將Drawing、Part與Relation都建成formal/work/review模型；DEV-089再把Relation矩陣放入圖料工作台的drawer。當同一完整矩陣也放進Drawing與Part drawer後，圖料工作台成為第三個重複瀏覽表面，而Relation work、editor、review與formalization仍為一項結構簡單的root-level link變更維持完整狀態機。

使用者最新決策是：關聯矩陣應可直接編輯且不需審核。目標是縮短操作路徑、降低人類語意與程式碼複雜度，同時維持正式關聯資料完整性、並行安全及Drawing／Part既有生命週期。

## Options

### A. 保留圖料工作台與Relation work/review

拒絕。資料控制最嚴謹，但同一矩陣需要第三個瀏覽入口、調整中資料、任務、審核與正式化，效用低於維護成本。

### B. 移除圖料工作台，但drawer唯讀並導向專用Relation editor/reviewer

拒絕。能減少一個清單，仍保留第二工作區與全部Relation狀態機，沒有實現使用者要求的直接編輯。

### C. Drawing／Part drawer內編輯，一次儲存直接更新正式Relation authority

採用。檢視與編輯發生在使用者已查看的root context，Relation domain只保留正式資料權威與一個direct mutation contract。

### D. 把關聯欄位複製到Drawing與Part資料並刪除Relation domain

拒絕。會形成雙寫、衝突與無法定義的owner，並破壞完整root矩陣與跨物件一致性。

## Decision

- `drawing_part_links`維持唯一正式Relation storage，`RelationFormalAuthorityRepository`維持唯一正式write authority；Drawing與Part只是同一矩陣projection的情境讀寫入口。所有編號建立／正式化、替代料號、主圖恢復、Relation direct edit與root delete flow都必須共用root-first lock與in-transaction typed primitives，禁止其他runtime raw SQL寫link。
- Drawing與Part drawer預設view mode；使用者明確進入edit mode，修改三態cell後以一個`儲存`原子提交。
- `直接編輯`不採逐格autosave。browser draft在save前不持久化；`取消`可完整丟棄，save是唯一commit boundary。
- save成功立即成為正式關聯；不建立Relation work、review request、approval task、approved snapshot或async formalization。
- 使用由root、兩軸identity／狀態及links內容產生的strong `matrixEtag`、`If-Match`、idempotency與DB transaction防止lost update、double effect與partial matrix；不新增需要所有writer手動維護的row counter。
- API／UI固定使用`manufacturing_basis|reference`，DB固定使用`primary_manufacturing|reference`；兩者mapping只存在formal authority，禁止storage enum洩漏或各module自行轉換。
- 不新增細分角色或反作弊機制；matrix actor resolution為頁面中立，read接受`numbering.drawings.view`或`numbering.search`任一來源權限並做exact entity/company檢查，edit另要求`numbering.workspace.update`與domain invariant，不額外要求Drawing draft permission。
- `/numbering/search`保留為最小`編號搜尋`，只負責root／Drawing／Part identity discoverability；root-only結果不擁有矩陣或edit，矩陣唯一read/edit surface仍是Drawing／Part drawer。
- 一次直接儲存可涵蓋目前矩陣全部cell，最高50×50＝2,500 changed pairs；server一次原子處理，client不得拆批。
- 圖料工作台、Relation workspace與Relation current work/review runtime在替代入口及資料gate通過後退役。
- activation前既有active Relation work/review必須透過當時合法流程歸零；禁止自動核准、套用未核准內容或捨棄正式資料。
- 既有completed Relation review trace／approved snapshot保持唯讀歷史證據；新流程不再產生。

## Consequences

### Positive

- 使用者從圖號或料號明細即可完成關聯修正，不需切換第三個工作台、建立調整案或等待審核。
- current Relation狀態從formal/work/review/system縮成一份正式矩陣；concurrency token由目前內容推導，不是第二份current state。
- 移除Relation list、filter、workspace、task、review、formalization與多組導航caller；所有正式link writer收斂為一個authority，前後端責任才真正單一。
- Drawing／Part drawer看到相同root／ETag時必須產生相同matrix，資料一致性更易驗證。

### Trade-offs

- 變更沒有第二人審核，使用者儲存錯誤會立即影響正式關聯。
- 以明確edit mode、單一save、取消、server invariant、stale rejection與原子transaction降低誤操作及系統性風險，但不提供完整undo／restore產品。
- existing active Relation work必須在cutover前歸零，否則會形成產品切換阻塞。
- 現有raw formal writer必須逐一遷移或證明runtime caller=0後刪除；sync legacy writer不可為了相容而永久保留第二套SQL authority。
- `/numbering/search`仍有合法搜尋caller，因此retirement不能只做字串歸零；必須把每個caller分類為search、canonical owner return或number-create intent，並對舊Relation intent fail closed。
- provider-aware migration已在本機補齊pair唯一約束、fail-closed preflight與Relation current work/review schema retirement；正式Cloud SQL仍須完成零遺失reconciliation與release gate。

## Superseded / Amended Documents

- DEV-090早期Brief中的「矩陣唯讀、導向專用Relation工作／審核頁」被本ADR取代。
- DEV-087 Relation-specific formal/work/review/command clauses在DEV-090 activation後由本ADR與配對SPEC取代；Drawing／Part clauses不變。
- DEV-089的matrix語意與reference validation保留；DEV-090已將Relation list/drawer owner surface標為歷史基線，current owner只剩Drawing／Part drawer。
