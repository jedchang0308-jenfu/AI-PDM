# SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001：單一圖號工作台與生命週期導向操作

Status: `Phase 1H Local RD Implemented / AI QA + Independent QC Passed / Production Release Gated`
Date: 2026-08-05; amended 2026-08-06
Owner: Dev PM
Related DEV: `DEV-053` / `DEV-PDM-UNIFIED-DRAWING-WORKBENCH-001`
Parent DEV: `DEV-052`、`DEV-050`、`DEV-051`
Related QA: `.ai-doc/qa/qa-pdm-unified-drawing-workbench-validation-plan-2026-08-04.md`
Related authority: `.ai-doc/specs/SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-efficiency-first-bundle-flow.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`; `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-003-drawing-revision-lifecycle-only-retention.md`

> **2026-08-11 Part-cost retirement amendment**
>
> The product part-cost capability is retired by `ADR-PDM-PART-COST-RETIREMENT-001`. Any historical standard-cost optionality, cost chip, cost maintenance entry or cost acceptance case in this document is superseded and must not be restored.

> **2026-08-14 DEV-072 detail-action amendment**
>
> 本文中「顯示／啟用送交審核」改讀為：在 `UnifiedPdmEntityDetailDrawer` 的 applicable action catalog 中，`送交審核`於準備階段已固定顯示但 locked，完成必要條件後在同一位置解鎖並成為唯一 primary。暫時無權限、送審鎖定或 prerequisite 未完成的 applicable action 亦採低色階 locked control，原因只在可存取的 hover／focus／touch tooltip 顯示；不適用、跨 domain、terminal 且無恢復路徑的 action 仍完全省略。這有意取代本文「無權限不顯示 disabled 假入口」在共用 drawer action bar 的舊規則，但不改 list row 的 current-primary-only 行為，也不改 server permission、狀態機、送審／發布 authority。完整契約與 AI 真實操作 QC 見 `SPEC-PDM-ENTITY-DETAIL-DRAWER-001` 的 DEV-072 amendment。

> **2026-08-10 DEV-061 Amendment**
>
> 圖號工作台的新檔案 UX 與 write authority 改由 `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md` 管理。圖號只顯示受控 2D／3D 與版次檔案，不再提供參考附件、附件管理、已刪除資料或一般附件上傳；每次首版／進版 hard-require 本次上傳 `.SLDDRW` + `.SLDPRT/.SLDASM`，相同 3D 由系統共用 canonical asset。預覽圖本身即為開啟預覽入口，不另設重複按鈕。本文的 controlled/reference 雙區、warning-only required files 與一般附件管理段落保留為 DEV-053 歷史證據，衝突處由 DEV-061 取代。

Current execution boundary: DEV-053 Phase 1A～1G的本機實作與QC證據保留為歷史成果；Phase 1H已依`HD-053-1H-01..10`完成本機產品、schema/migration artifact、authority、projection/UI、cleanup、AI QA與獨立QC。未對固定3000、staging或production套migration／adoption／flag，未修改既有正式資料或DEV-054；commit、production activation、deploy與release仍是獨立邊界。

2026-08-05 3000 runtime correction：使用者實際使用的固定本機入口曾同時載入`.env.local`的`PDM_PRODUCTION_SLICE_MODE=official-numbering-draft`，造成3000雖是完整測試環境，候選首版、正式進版、上傳送審與影響分析仍被production slice鎖住；原隔離QC以空白slice執行，未覆蓋這個設定差異。現行契約新增明確邊界：`npm run dev:local`／`dev:local:restart`只在`NODE_ENV=development`設定`PDM_LOCAL_FULL_FUNCTION_VALIDATION=true`，使3000提供完整本機驗證；`NODE_ENV=production`即使誤設同名flag也不得繞過production slice。production runtime、migration、資料與部署均未修改。

---

## 0. 2026-08-05 Phase 1F PM Reopen and RD Contract

### 0.1 真正問題與使用者價值

真正問題不是「按鈕是否存在」，而是單一圖號工作台是否能讓使用者從任一既有或新建圖號工作，辨識目前狀態、完成下一步，並在同一入口找回正式圖面全部管理能力。固定3000目前雖可上傳檔案，仍可能停在`等待 finalized 證據`而無法送審；正式圖面能力另因預設範圍、分散authority與恢復連結而難以發現或無法完成。

使用者價值：保留單一工作台與效率優先方向，同時確保候選首版可一路推進到審核／正式化，正式圖面可完成圖、料、版次、附件、送審、關係、影響與治理工作，不再以「route存在」或「隔離測試通過」冒充真實任務完成。

### 0.2 已確認決策

- Human Confirmed：維持單一`圖號工作台`，不恢復`圖號總表／保留號`雙分頁；`保留號`是生命週期狀態。
- Human Confirmed：既有保留號直接進入新流程往前推進；不得回填、改號、重播審核或破壞既有資料。
- Human Confirmed：單頁化不得刪除、遮蔽或弱化原有圖、料、版次、附件與治理能力。
- Human Confirmed：`DEV-054`為另一AI的必要並行任務；本任務不得修改、還原、stage或commit其程式、migration、刪檔或文件。
- Human Confirmed（2026-08-05 guided `1A`）：候選首版受控檔上傳後由系統自動驗證並推進為`可送審`；不得再要求使用者按一次「完成首版準備」，也不得自動送審。驗證失敗時保留草稿並提供重試／處理檔案入口。
- Human Confirmed（2026-08-05 guided `2A`）：同一drawer明確分為`受控版次檔案`與`參考附件`；只有受控版次檔案可計入送審資格與publication evidence，參考附件沿用原權限與管理能力但永遠不成為受控證據。
- Human Confirmed（2026-08-05 guided `3A`）：正式圖面採混合式操作。高頻的`圖面進版`與`上傳送審`留在drawer；完整圖料關係、製造影響、主資料與歷史使用既有專用工作面，必須保留圖號與返回工作台上下文。
- Human Confirmed（2026-08-05 guided `4A`）：每張候選圖面只以「至少一個仍有效、已完成證據的主要受控檔」作為送審必要條件；缺PDF、DWG/DXF或3D原檔只顯示警告，不阻擋送審，由reviewer在審核時決定是否退回。
- Human Confirmed（2026-08-05 guided `5B`）：第一次進入顯示進行中、正式受控與已發布資料；歷史資料預設隱藏，使用者以清楚的`包含歷史`切換顯示。`我的待處理`與`工作中`保留為效率篩選，不記憶上次範圍以免再次讓正式圖面不可發現。
- Human Confirmed（2026-08-05 guided `6A`）：權限不足時顯示確切缺少的權限與應聯絡角色；具`settings.admin_matrix`的Admin另顯示前往既有`/settings/workflow`入口，一般使用者不得看到不可使用的管理連結。

### 0.3 Phase 1F 缺口清冊

| ID | Priority | 缺口與預期修正方向 |
|---|---|---|
| GAP-01 | P0 | 固定3000上傳後缺少可完成的publication evidence與送審下一步；正常本機入口必須形成`上傳 → 證據完成／可恢復 → 送審`閉環。 |
| GAP-02 | P1 | 恢復多檔加入、附件說明、可辨識分類與中繼模型等既有上傳能力；不得只保留單檔自動分類。 |
| GAP-03 | P1 | 明確區分candidate/formal revision受控檔與master參考附件；所有入口文字、權限、寫入route與送審資格一致。 |
| GAP-04 | P1 | 恢復參考附件的預覽重建、Drive重試、刪除／還原、補件申請與決策能力，或提供可完成相同任務的唯一正確authority入口。 |
| GAP-05 | P1 | 送審blocker的`處理附件／補主資料／修正關係`必須直達可執行動作，不可迴圈回唯讀摘要。 |
| GAP-06 | P2 | 清單保留發布狀態不一致的直接修正／送審明細入口，不增加無必要drawer摩擦。 |
| GAP-07 | P2 | 恢復清單方向鍵、Home/End、PageUp/Down、Enter、Esc與複製圖號快捷鍵及focus行為。 |
| GAP-08 | P2 | 403顯示缺少的權限與可採取的管理員處理方式；不得與一般讀取錯誤混在一起。 |
| GAP-09 | P2 | empty state提供建立圖號、切換範圍與前往圖料工作台等可執行CTA。 |
| GAP-10 | P2 | terminal/history列顯示終止原因與正確下一步；Obsolete、Merged與取消不得只靠共同`歷史紀錄`文案辨識，Rejected須回可修正流程。 |
| GAP-11 | P1 | 預設`我的待處理`排除大多數正式圖面；第一次進入必須可發現候選、正式受控與已發布，歷史另以清楚toggle可發現。 |
| GAP-12 | P1 | 搜尋與篩選request需debounce或取消／request sequence保護，舊回應不得覆蓋較新的使用者條件。 |
| GAP-13 | P1 | 篩選、換頁或重新載入後，選取列若不在結果內必須關閉或重新對齊drawer；舊next cursor亦不得殘留。 |
| GAP-14 | P2 | 主畫面移除`cad_3d`、`drawing_2d`、`finalized`等非必要工程詞；狀態文案改為使用者可執行的結論。 |
| GAP-15 | P2 | `首版0/1`、`候選首版1/1`、重複`研發受控`等計數／狀態必須有單一口徑，不得互相矛盾。 |
| GAP-16 | P0 | 目前上傳修正與3000 runtime修正仍位於混合未提交工作區；必須以DEV-053範圍化SHA凍結，禁止整批納入DEV-054。 |

### 0.4 UX Intent

- 使用者：研發owner、研發主管／reviewer、PDM Admin與唯讀使用者。
- 主要任務：找出一筆圖號工作，判斷使用效力，完成該狀態唯一主要下一步；正式圖面另可發現全部secondary管理能力。
- 成功狀態：5秒內知道`我在哪裡／現在狀態／下一步／風險`；blocked狀態有可執行恢復路徑，terminal狀態明確說明免處理或替代動作。
- 安全預設：第一次進入顯示`全部`；既有正式／保留資料只讀載入零寫入；高風險送審、撤回、核准、刪除與還原沿用權限及確認gate。
- 可見文字預算：頁首一個短用途句；表格第二行只保留會改變該列判斷的關聯料號／警示；工程詞與raw status降層到audit。
- 不可發生：上傳成功但無下一步、恢復CTA回到唯讀頁、篩選後drawer顯示不在清單的舊資料、可見按鈕名稱與accessible name不一致。

### 0.5 Scope、Out of Scope 與驗收方向

Scope：固定3000生命週期閉環、單頁預設可發現性、既有附件能力與authority、recovery routing、清單非同步一致性、keyboard／403／empty／terminal狀態、可見文字與accessibility，以及對應AI真實操作驗證。

Out of Scope：恢復雙分頁、恢復`development_phase`／DVT、修改DEV-054、正式環境migration／資料修復／部署／release、改號、回填、審核重播、放寬權限或建立第二套受控檔案authority。

驗收方向：

1. 正常固定3000啟動契約下，使用新建可清理fixture完成建立、候選首版、多檔加入、證據完成、送審、撤回／再送審、核准與原子正式化；不得只靠測試腳本硬注入`local_fake`證明。
2. 既有正式與保留資料只做read-only compatibility與business hash比對，不作清理、回填或重建。
3. 首次進入工作台即可搜尋正式圖面；`我的待處理／工作中／全部`切換結果與URL/deep link一致。
4. 正式圖面所有secondary入口必須實際點入並完成代表性任務；link count不算通過。
5. controlled file與reference attachment的可見名稱、可寫位置、送審資格與recovery destination一致，無雙authority。
6. 快速輸入、切換filter、換頁與關閉／重開drawer後，畫面只顯示最後一次條件的資料。
7. 401／403／empty／error／blocked／terminal各自通過Now What Test；主畫面無raw technical terms與矛盾計數。
8. 1440×900、1024×768、390×844完成搜尋、篩選、drawer、上傳與下一步，無visible error、裁切或非預期overflow。
9. 範圍化clean SHA重跑後才能交獨立QC；DEV-054 protected diff前後保持不變。

### 0.6 根因與 CA/PA 追溯

| 根因 | 立即矯正 CA | 預防措施 PA | 效用判斷 | 驗證證據 | 流向 |
|---|---|---|---|---|---|
| 隔離runner以空白production slice與`local_fake`證據模式執行，未代表固定3000啟動契約 | 重開DEV-053並把固定3000閉環列為P0 | QA/QC必須同時跑正常固定入口與隔離fixture；test-only override不得作唯一PASS證據 | 高風險降低、可自動重跑 | startup env manifest、UI lifecycle evidence、production=false proof | QA plan／QC report |
| QC把link存在、component fragment與唯讀摘要當成能力已恢復 | 將16組缺口改為逐項任務驗收 | secondary入口必須實際導覽並完成代表性操作；recovery CTA需驗證目的地可執行 | 增加少量測試成本，顯著降低漏檢 | Playwright操作log、route/network、before/after facts、截圖 | QA plan／checklist |
| 單一workbench切換替代舊頁，但未建立完整能力與state parity gate | 以Phase 1F補齊能力、狀態、非同步與authority | 每次主要UI替換前後建立capability inventory與negative-regression gate | 中等實作成本，避免再次整批退化 | pre/post capability matrix、focused contracts、manual UX review | dev_task／SPEC |
| 完成狀態綁定舊frozen SHA，後續未提交delta與使用者實際失敗未同步回總索引 | DEV-053由完成重開為Brief Ready | 完成宣告必須綁定current scoped SHA、normal runtime與dirty-boundary；使用者截圖衝突即自動reopen | 低成本、高治理效益 | dev_task/QC一致、scoped SHA、git boundary report | dev_task／QC report |

成熟度判定：上述行為、API、authority、正常3000 evidence adapter、affected-file boundary、failure recovery與QA delta已於0.7完成；Phase 1F為`RD Implementation Ready`。本輪未修改產品，production release仍未授權。

### 0.7 Phase 1F RD Implementation Contract

#### 0.7.1 正常3000、受控檔案與送審資格

1. 固定本機入口仍是`npm run dev:local`／`npm run dev:local:restart`；只在`NODE_ENV !== "production"`且`PDM_LOCAL_FULL_FUNCTION_VALIDATION=true`時啟用本機證據完成器。production必須忽略此flag並維持真實GCS fail-closed。
2. 候選檔案先由既有storage service寫入並計算SHA-256，再對儲存物件執行`verifyObjectHash`。只有read-back hash一致才可沿用現有non-production evidence row形狀建立本機finalization receipt；run manifest必須標示`localDevelopmentEvidence=true`，不可把它當成production publication evidence。
3. hash驗證或evidence寫入失敗時，不得把該檔案標為已完成證據；保留revision draft與其他成功檔案，顯示失敗檔名、可理解原因及`重試驗證／移除檔案`。若新物件尚未建立有效file link，應清理該新物件；清理失敗寫audit/log但不得宣稱成功。
4. `numbering-candidate-revision-editor`支援一次選取多檔；每檔可編輯顯示名稱、說明、檔案類別及主要檔標記。前端可逐檔呼叫既有files route並顯示逐檔進度，不因其中一檔失敗回滾已成功檔案；重送同一使用者動作不得重複建立相同active link。
5. 每張候選圖面送審blocker只有：沒有至少一個active、primary且finalized的受控檔。PDF、DWG/DXF或3D檔缺漏顯示warning清單但不阻擋；送審confirmation與review snapshot均帶入warning，reviewer可退回但系統不得替reviewer拒絕。
6. 上傳並驗證最後一個必要主要檔後，server response重新計算readiness，UI自動顯示`送交審核`；不得另增`完成準備`按鈕，也不得自動送審。

資料契約沿用`numbering_candidate_revision_drafts`、`numbering_candidate_revision_files`與`numbering_publication_evidence`；不新增欄位、table或migration。files route仍為單檔mutation authority；多選是UI orchestration，不新增第二套上傳API。normal-local path不得只靠測試runner設定`PDM_PUBLICATION_EVIDENCE_MODE=local_fake`。

#### 0.7.2 單一工作台清單、歷史與狀態

- `/numbering/drawings`無明確`view`時固定使用`view=all`且`history=exclude`；不從localStorage恢復上次範圍。舊`?tab=reserved`相容為`view=work`，不得寫資料。
- list API新增／正規化`history=exclude|include`；在套用view與filter前排除`history_only`列。直接開啟terminal detail時，client canonicalize為`history=include&detail=...`，讓選取列仍在同一結果集合。
- `Obsolete`與`Merged`維持terminal，但各自顯示原因與不同下一步；candidate取消顯示`已取消`。`Rejected`不是terminal，投影為`correction_required`，primary action為`建立修正版`並走既有revision authority。
- 任何keyword、view、stage、series、purpose、status或history變更，先清空cursor history並回第一頁；list request使用`AbortController`及遞增sequence，只允許最後一次request寫入畫面。stale cursor回應時自動回第一頁並顯示一次性說明。
- 新結果不含已選row時關閉drawer並清除`detail`，只有正在解析的direct deep link可例外。drawer關閉後焦點回原列；列支援ArrowUp/Down、Home/End、PageUp/Down、Enter、Esc及Ctrl/Cmd+C複製display code，且不得攔截input/select/textarea。

#### 0.7.3 正式圖面、附件authority與共用操作面

1. `MasterAttachmentPanel`增加顯式`authorityMode`：`combined_legacy | controlled_summary | reference_manager`；既有其他頁預設`combined_legacy`，避免無關頁面退化。
2. controlled判斷只採既有provenance欄位（revision package、source submission或supplement來源）；formal drawer的`受控版次檔案`永遠唯讀，顯示來源版次／submission並導向權威工作面。
3. 無controlled provenance者顯示於`參考附件`；有`numbering.attachments.manage`者保留既有多檔上傳、說明、預覽重建、Drive重試、刪除／還原、補件申請與決策能力，無權者唯讀並依0.7.4顯示處理方式。參考附件永遠不計入候選／正式版次送審或Released evidence。
4. 補件是參考附件轉入受控流程的唯一顯式動作；申請／核准後依既有provenance進入受控或待處理區，不複製成第二筆可編輯authority。
5. 將現有`DrawingRevisionWorkbench`抽為`src/components/drawing-revision-workbench.tsx`共享元件，props至少包含`initialDrawingNumber`、`mode: "page" | "drawer"`、`initialFocus: "revision" | "files"`、`onSubmitted?`與`onClose?`。`/numbering/revisions`保留為wrapper；formal drawer內`圖面進版`與`上傳與送審`只改initialFocus，共用既有resolve、upload與submission APIs，不建立平行mutation route。
6. 完整圖料關係、製造影響、主資料與歷史保留既有專用頁；所有連結帶drawing number及`returnTo`（包含當前view/filter/history/detail），完成或取消後可回同一列。既有submission workbench route保留相容，不因本切片刪除。

#### 0.7.4 權限與失敗恢復

- list/detail BFF回傳server-derived capability，不由client以角色名稱推定。至少包含`canUpdateDraft`、`canCreateRevision`、`canManageReferenceAttachments`、補件申請／決策能力與`canManagePermissions`；`canManagePermissions`只由`settings.admin_matrix`推導。
- 每個disabled／403 action同時回傳或映射`permissionCode`、中文能力名稱、`contactRole`及可選`adminHref`。一般使用者顯示「缺少：{中文能力}（{permissionCode}），請聯絡PDM Admin／研發主管」；只有`canManagePermissions=true`才顯示`前往權限管理`並導向`/settings/workflow`。
- 401只導登入；403不得混成讀取失敗；404顯示資料不存在或已離開目前範圍；409/stale顯示重新整理並保留安全草稿；5xx保留使用者輸入／已成功檔案並提供重試。raw stack、SQL、storage path與credential不可見。
- 送審blocker的`處理受控檔案／補主資料／修正關係`必須直達可寫authority並帶return context；完成後回到原drawer重新向server取得readiness，不用client自行解除blocker。

#### 0.7.5 Exact affected-file boundary

| 類型 | 檔案／範圍 | 契約 |
|---|---|---|
| 正常3000與evidence | `scripts/start-localhost-3000.ps1`、`src/lib/number-lifecycle-simplification.ts`、`src/lib/publication-evidence.ts` | 只新增development verified-evidence path與production negative guard；不得改production provider authority |
| Candidate files | `src/components/numbering-candidate-revision-editor.tsx`、`src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/route.ts` | 多選編排、role／說明／primary、逐檔錯誤；route仍單檔authority |
| Unified projection/BFF | `src/lib/drawing-workbench.ts`、`src/lib/repositories/drawing-workbench-async-repository.ts`、`src/app/api/numbering/drawings/workbench/route.ts`、`src/app/api/numbering/drawings/workbench/[rowKey]/route.ts` | default all、history query、Rejected correction、terminal reason、capabilities與cursor契約 |
| Unified UI | `src/components/drawing-workbench.tsx`、必要的`src/app/globals.css` | request sequencing、drawer/list一致性、keyboard、Now What、權限與RWD |
| Attachment authority | `src/components/master-attachment-panel.tsx`及既有attachments API（只有契約測試證明需要時才最小修改） | controlled summary與reference manager分層；其他consumer維持legacy default |
| Revision reuse | `src/app/numbering/revisions/page.tsx`、新增`src/components/drawing-revision-workbench.tsx` | 抽共用元件；頁面與drawer共用同一mutation authority |
| Regression | `scripts/qc-dev-053-drawing-workbench-*.mjs`、`package.json` | 更新F1契約與aggregate，不以static fragment或link count取代操作 |

禁止範圍：任何schema/migration、既有正式／保留資料修復、DEV-054的023/024 migration、DVT／`development_phase`刪除成果、DEV-054 SPEC/ADR/QA/QC與其他AI的hunk。共用檔只允許DEV-053逐hunk變更；無法分離即停止。

#### 0.7.6 執行切片、進出條件與失敗停止

| Slice | Priority | 內容 | Exit gate |
|---|---|---|---|
| `1F-1 Normal-3000 candidate closure` | P0 | development verified evidence、多檔候選UI、4A blocker/warning、auto-ready與恢復 | 正常`dev:local`完成upload→ready；production negative、hash-failure、partial-file retry與DEV-052 regression通過 |
| `1F-2 Workbench state integrity` | P0/P1 | default all/history toggle、Rejected correction、terminal reason、request/cursor/selection、keyboard與empty | read-model/HTTP/UI focused tests通過，existing data zero-write hash不變 |
| `1F-3 Formal capability restoration` | P1 | controlled/reference分層、共享revision drawer、secondary return context、403管理導流 | 每項代表性操作由真實UI完成；無雙authority、無permission widening |
| `1F-4 Freeze and AI QA handoff` | P0 | 全回歸、正常3000真實操作、RWD/accessibility、scoped SHA與DEV-054 unchanged manifest | F1-QA-01～11全通過後形成clean scoped SHA，再交獨立QC |

實作依序`1F-1 → 1F-2 → 1F-3 → 1F-4`；每個slice失敗先留在該slice，不得以後段UI掩蓋前段資料／authority問題。需要schema、新business table、production credential／target、既有資料寫入、權限放寬、第二套受控檔authority或觸及DEV-054時立即停止回PM。

#### 0.7.7 Spec/ADR與readiness判定

- Spec impact：`Compatible correction + intentional Phase 1F refinement`。單頁、server projection、DEV-052自動正式化與DEV-050/051 revision authority不變；本節取代Phase 1E「master唯讀即可完成」及Phase 1F Brief assumption。
- ADR：不新增。正常3000 adapter只存在development runtime且不改production provider；controlled/reference分層沿用既有authority；read projection與source context仍由既有ADR覆蓋。若RD發現必須新增provider enum、持久化authority、migration或新mutation route，停止並另開ADR。
- Readiness：需求可觀察、資料與API邊界明確、失敗行為與停止條件明確、檔案級變更可切片、QA可自動重現，故判定`RD Implementation Ready`。風險仍為High，必須逐slice凍結，不允許一次性大改。

## 0.8 Historical 2026-08-05 Capability-preservation Amendment

本段是DEV-053現行權威修正；若後文的「四欄簡版」、「最小drawer」或「master唯讀」被解讀為可移除既有工作能力，以本段為準。

1. 使用者已確認維持單一`圖號工作台`，不恢復`圖號總表／保留號`雙分頁；但單頁化只消除導覽分流，不消除正式圖面管理能力。
2. 候選row保留生命週期唯一primary CTA；正式drawing row除唯一primary CTA外，必須保留可發現的secondary operations與治理資訊。`只有一個primary`不等於`只能有一個動作`。
3. 正式drawing drawer必須整合：圖面進版、上傳與送審、完整圖料關係、適用時的影響分析、申請作廢、發布不一致、Title block風險、送審檢查、同根料號、主資料編輯、標準成本、主要製造圖與附件authority導流。
4. 清單核心仍可維持`圖號／品名／工作狀態／下一步`，但關聯料號、資料狀態、待審、發布不一致與警告不可被藏到無法發現；用途、資料狀態與系列篩選必須保留。
5. candidate first revision與formal revision package仍是受控檔案唯一寫入authority。正式master可管理明確標示的`參考附件`，但參考附件不得成為送審、publication或Released下載證據。
6. `DEV-054`是受保護的必要並行任務。DEV-053不得恢復`development_phase`/DVT、修改023 migration或DEV-054 SPEC/ADR/QA/QC、還原其刪檔，或把其hunk混入DEV-053 commit。
7. Phase 1E不新增schema/migration；優先擴充既有workbench detail BFF與UI composition。需要新資料authority或無法與DEV-054安全分離時立即停止。

Phase 1E能力清冊是逐項驗收契約，不得以「route仍存在」代替UI可達：

| ID | 必須恢復/保留的使用者能力 |
|---|---|
| CAP-01 | 用途、資料狀態、系列與關鍵字查詢 |
| CAP-02 | 清單可見關聯料號 |
| CAP-03 | 清單可見待審、發布不一致與警告摘要 |
| CAP-04 | 圖面進版固定secondary入口 |
| CAP-05 | 上傳與送審固定secondary入口 |
| CAP-06 | 完整圖料關係固定secondary入口 |
| CAP-07 | 製造圖影響分析固定secondary入口 |
| CAP-08 | 受控檔案authority導流與參考附件管理邊界 |
| CAP-09 | 發布狀態不一致說明與修正入口 |
| CAP-10 | Title block變體風險 |
| CAP-11 | 送審完整性、標準成本與待審檢查 |
| CAP-12 | 同根料號清單 |
| CAP-13 | 材質、顏色、表面處理與變體備註主資料編輯 |
| CAP-14 | 標準成本維護入口與主要製造圖資訊 |

本機驗收補充：固定3000環境不得只證明功能在隔離runner存在。候選列的唯一下一步必須可開啟首版準備，建立candidate revision後顯示真實file input與`上傳主要檔案`；正式drawing drawer的CAP-04～07連結必須為可導覽link，CAP-08、CAP-11、CAP-12內容必須可見。這項本機完整驗證例外只影響development runtime，不得擴大production open-page或mutation allowlist。

## 0.9 2026-08-06 Phase 1H Single Lifecycle and Approval Authority RD Contract

Document maturity: `RD Contract Base / Human Confirmed`; exact implementation is superseded by section 0.10.
Execution boundary: implementation, migration and release are not started.

Human decisions recorded on 2026-08-06:

- `HD-053-1H-01 / 1A`：送審後只顯示一個動態primary CTA；使用者對exact approval request具可執行審核責任與權限時顯示`前往審核`，否則顯示`查看進度`。
- `HD-053-1H-02 / 2A`：申請人可在第一個review decision前撤回；任何核准／退回決策發生後即不可撤回，後續改走修正或新進版。
- `HD-053-1H-03 / 3A`：移除獨立legacy送審明細操作面與使用者可見的稽核drawer／頁面；舊deep link依角色／狀態導向canonical圖號或審核工作台。
- `HD-053-1H-04 / 4C`：DEV-053圖面進版流程完成後，前後端都不保留審核歷程，只留下版次生命週期狀態；不永久保留申請人、審核人、決策、時間或理由。此為domain-scoped data-policy exception，只約束新Phase 1H流程，不追溯刪除既有資料，也不擴大至其他審核領域。
- `HD-053-1H-05 / 5A`：退回理由選填；若有填寫，只是目前correction state的操作指示，重新送審成功即刪除。理由空白不阻擋退回，UI顯示中性通用下一步。
- `HD-053-1H-06 / 6A`：先固化版次生命週期結果並送達必要通知，再將workflow視為完成並清除submission、approval、decision與outbox business data；失敗時不得提前清除。
- `HD-053-1H-07 / 7A`：允許最長7天、無業務內容的technical idempotency/recovery token；只含防重雜湊、command scope、結果指紋與expiry，不含人員、理由、檔案或snapshot，到期自動刪除。
- `HD-053-1H-08 / 8B`：啟用時將安全且仍進行中的圖面進版workflow全批次轉接新authority；先dry-run，任何blocker即不允許部分啟用。既有completed/unknown資料不轉接。
- `HD-053-1H-09 / 9B`：必要通知以圖面目前狀態／我的待辦投影同交易更新為送達；不建立永久審核notification或影子audit。
- `HD-053-1H-10 / 10B`：完成／cleanup後的舊連結導向該圖號最新版；不保留原request到歷史版次的tombstone mapping。

### 0.9.1 Problem and outcome

DEV-053已將圖號導覽合併成單一工作台，但送審後的使用者旅程仍可進入舊`submission`決策頁，且圖號、附件、dashboard、通知與審核工作台可分別依raw submission、effective review或publication口徑顯示不同狀態。這不是單純文案問題，而是使用者可見的審核權威與生命週期真相未收斂。

Phase 1H的產品結果固定為`2-1-1-0`：

- `2`個操作介面：`圖號工作台`處理準備／送審／進度／歷史；`審核工作台`處理全部reviewer決策。
- `1`個使用者狀態：同一圖號版次在圖號、附件、通知、KPI與審核佇列口徑一致。
- `1`個primary CTA：依當下角色與狀態計算，submitter看進度，reviewer進審核，不同時出現競爭動作。
- `0`個可見legacy送審明細／稽核操作面：舊deep link只依角色／狀態redirect，不再顯示平行明細、核准、駁回、取消或raw status。

### 0.9.2 Target user flow and visible states

1. 使用者在`圖號工作台`以正常進版或`補歷史版`模式準備附件，共用同一送審動作。
2. 建立送審後維持圖號上下文並顯示`送審中`。系統只給一個primary CTA：目前使用者對exact approval request具可執行審核責任與權限時為`前往審核`，否則為`查看進度`。
3. reviewer只在`審核工作台`做核准或退回。
4. 申請人可在第一個review decision前撤回；第一個核准／退回決策發生後即關閉撤回，後續必須走修正或新進版。撤回必須經canonical approval command原子同步審核與生命週期投影。
5. 小數版核准後顯示`研發受控`；整數版符合發布政策才顯示`正式發布`。低於最新版只會自動分類至歷史，不取代最新版。
6. 可見生命週期詞彙只有`準備中`、`送審中`、`退回修改`、`研發受控`與`正式發布`；歷史是view classification，不是平行生命週期。

### 0.9.3 Scope and architecture memory capsule

Current scope includes the post-submit success state, canonical approval deep link, drawing/attachment/submission projections, dashboard/KPI, notifications, legacy decision pages and legacy approve/reject/cancel commands.

The architecture direction that constrains later RD contracts is:

- `ApprovalRequest` remains the only review-decision authority and aligns with `SPEC-PDM-APPROVAL-PLATFORM-001`.
- `RevisionPackage` server-side lifecycle projection is the user-facing lifecycle truth.
- While a Phase 1H workflow is active, `ApprovalRequest` remains the decision authority and `Submission` may exist only as an active command/compatibility record. After terminal completion and cleanup, only the `RevisionPackage` lifecycle projection remains as the business result; no durable submission, approval decision or audit history is retained for this domain flow.
- The core returns semantic allowed actions. The BFF/presenter derives `displayStatus`, `primaryAction`, secondary actions, reason and route from current state, role and policy. Navigation URLs or "next action" are not persisted.
- Compatibility is adapter-only: old URLs redirect to the canonical drawing or approval workbench according to actor and state; there is no standalone user-facing legacy detail/audit surface. Old commands delegate to the same authority or fail closed with zero writes.

### 0.9.4 Scope boundaries

In scope:

- normal revision and historical backfill use the same revision/submission/review flow;
- all affected read surfaces consume one lifecycle projection;
- one role-appropriate primary CTA per state;
- withdrawal is available only to the submitter before the first review decision and uses the same canonical command/transaction boundary;
- stale raw `Pending` cannot produce pending badges, notifications or actionable legacy buttons after effective review completion;
- legacy decision APIs cannot create contradictory `Rejected`/`Cancelled` versus effective approved states.

Out of scope:

- production data repair, live migration, deploy or release;
- retroactively deleting or rewriting completed production submission, approval or audit history; `8B` only permits guarded adoption and later terminal cleanup of workflows still active at activation;
- applying the Phase 1H no-history exception to BOM, cost, obsolete, supplement or any other approval domain;
- changing DEV-050 minor `Released` policy;
- Phase 1G confirmed-impact multi-part replacement mapping;
- any DEV-054 code, migration, SPEC, ADR, QA/QC, deletion or shared hunk that cannot be safely separated.

### 0.9.5 Acceptance direction and re-entry

- A disposable equivalent of "latest 0.3 plus historical 0.2" must complete create → system primary CTA → exact canonical review → approve → reload through real signed-in UI. After approval, 0.2 is history, 0.3 remains latest, and no pending notification/KPI/action remains.
- While active, the same version displays the same human status across drawing, attachment, notification, KPI and approval queue; after terminal cleanup, only the durable drawing/revision status remains and no submission trace is shown.
- Old pages and direct legacy approve/reject/cancel calls cannot write or expose competing decision actions.
- Every affected state passes the five-second status/next-step test, Visible Text Noise Gate, visible/console error gate and in-scope viewport checks.
- Existing production/reserved records require no backfill, renumbering or review replay; DEV-054 protected scope remains unchanged.

### 0.9.6 User-facing lifecycle projection and semantic action contract

The server-side precedence is fixed and all list, drawer, attachment, notification, KPI and approval surfaces must consume it:

`正式發布 > 研發受控 > 退回修改 > 送審中 > 準備中`

- `正式發布`：整數版已通過DEV-050 release policy並正式發布。
- `研發受控`：小數版review已核准；不得因physical submission仍是legacy `Pending`而顯示送審中。
- `退回修改`：目前版次需要修正；可附一筆選填active correction reason。
- `送審中`：存在尚未terminal的exact approval request；已完成或cleanup-pending的request不得出現在pending badge／KPI／inbox。
- `準備中`：尚無active approval request，可繼續準備或送審。
- `歷史`只由版次排序與out-of-order規則決定，是view classification，不參與上述優先序。

The core returns semantic actions rather than URLs:

| Visible state / condition | Primary action | Allowed secondary action | Contract |
|---|---|---|---|
| 準備中、尚未ready | `continue_preparation` | `none` | 回到同一圖號工作上下文補必要資料 |
| 準備中、ready | `submit_for_review` | `none` | 正常進版與補歷史版共用command |
| 送審中、actor是assigned eligible reviewer | `open_exact_review` | submitter且decision count = 0時可`withdraw_before_decision` | primary顯示`前往審核` |
| 送審中、其他可查看者 | `view_progress` | submitter且decision count = 0時可`withdraw_before_decision` | primary顯示`查看進度` |
| 退回修改 | `correct_and_resubmit` | `none` | 選填理由靠近狀態；空白時顯示`請修正後重新送審` |
| 研發受控／正式發布且可進版 | `create_revision` | `none` | 顯示`圖面進版`；history item只提供查看，不產生第二個primary |
| 無權限或terminal免處理 | `none` | `none` | 顯示人類可理解的判定與聯絡角色，不顯示disabled假入口 |

DEV-053 reviewer UI only exposes `核准` and `退回修改`. Generic platform `needs_info` and `rejected` inputs are normalized to the single `returned_for_correction` domain outcome; other approval domains remain unchanged.

### 0.9.7 Withdrawal, correction and multi-review behavior

- Only the original submitter in the same company can withdraw, and only while the exact request has zero decisions. Admin does not receive a bypass.
- The first approval or return decision permanently closes withdrawal for that workflow. If more reviewers are required after a first approval, the workflow remains active but non-withdrawable.
- Withdrawal returns the revision package to editable preparation, preserves prepared controlled files and selected part scope, removes the active review graph after required withdrawal notifications, and does not leave a withdrawal history.
- Return-for-correction is terminal for the current review graph. The optional reason is copied to a current correction field on the revision package, then the review graph is cleaned. A successful resubmission clears that field in the same transaction that creates the new active workflow.
- Resubmission reuses the same drawing/revision package and controlled file assets. It must not duplicate a formal revision merely because the previous review graph no longer exists.

### 0.9.8 Data-retention and cleanup contract

Persistent PDM business data is not approval history and must remain:

- drawing revision package identity, revision and lifecycle state;
- controlled file assets/package roles and their usable download/preview links;
- the selected multi-part scope and required drawing-part relationships;
- latest/history classification and DEV-050 release outcome;
- optional current correction reason only while the package is in `退回修改`.

Transient workflow business data may exist only while active or cleanup-pending:

- submission command record, snapshot and submission file/scope compatibility rows;
- approval request/package/targets/assignments and quorum decisions needed to reach a current outcome;
- notification outbox payloads required by the current workflow.

Terminal cleanup is domain-scoped:

1. Validate company, drawing, revision, selected parts, controlled files and current request freshness.
2. In one transaction, apply the terminal result to the revision package, preserve files/part scope in durable PDM-owned rows, detach durable rows from transient submission/file/request foreign keys, and update the current drawing/task projection.
3. Under `9B`, successful commit of that non-historical current-state projection is mandatory delivery. Phase 1H does not wait for or retain an external/permanent review notification.
4. In a separate idempotent transaction, delete the Phase 1H transient workflow graph and delivered outbox payloads.
5. Verify no business workflow row remains for the fresh or 8B adopted-active Phase 1H operation while the durable revision package remains complete and readable.

Existing completed/unknown production rows are grandfathered permanent data. Under `HD-053-1H-08 / 8B`, only an explicitly eligible workflow that is still active at activation may be adopted into `lifecycle_only`; adoption must be dry-run first, atomic, decision-replay-free and all-or-nothing. No completed history is adopted or deleted. Current append-only/no-delete protections remain fail closed for every non-Phase-1H domain.

Infrastructure security/availability metrics may retain aggregate success/failure counts, but must not contain actor, reviewer, reason, filename, attachment content, snapshot or enough identifiers to reconstruct a review history.

### 0.9.9 Technical idempotency and recovery token

- Maximum lifetime is seven days from creation; expiry must be enforced and expired rows physically removed.
- Stored data is limited to a one-way key hash, non-personal command scope, non-business result fingerprint, status and expiry. Raw keys, actor identifiers, reason, file metadata/content, snapshot and response payload are forbidden.
- Replay always re-checks authenticated company, current permission, reviewer assignment and lifecycle state; a matching token never grants authority.
- A token may suppress duplicate submit, decision, apply, notification-enqueue or cleanup commands, but cannot be queried as product history and cannot keep a deleted request alive.

### 0.9.10 Command, API and deep-link contract

- `POST /api/numbering/drawing-revisions/submissions` remains the canonical create entry and must delegate to the single Phase 1H workflow authority.
- `POST /api/approvals/requests/{requestId}/decisions` remains the reviewer decision entry, with only domain decisions `approved` or `returned_for_correction`; reason/comment is optional for return.
- A canonical withdraw command is required under the same approval authority. Its public semantic is `withdraw_before_decision`, regardless of the final route name selected at implementation readiness.
- Read models return `drawingNumber`, `revision`, `displayStatus`, `primaryAction`, `allowedSecondaryActions`, active correction reason when present, and safe canonical navigation. They do not expose raw/effective status axes or legacy decision URLs.
- Terminal command responses return the durable drawing/revision result and canonical drawing redirect. Clients must not depend on re-reading a request that will be cleaned.
- New exact-review URLs include a server-validated drawing-number fallback. Under `HD-053-1H-10 / 10B`, if the request has completed/cleaned, the workbench redirects to that drawing's latest revision, not the reviewed historical revision. A pre-Phase-1H bookmark with no resolvable drawing fallback safely returns to the drawing workbench list and exposes no decision action.
- Legacy approve/reject/cancel routes either delegate to the same command authority with identical permission/state/idempotency checks or return a fail-closed 404/409/410 with zero writes.

### 0.9.11 Permission and information-boundary contract

- Create/submit retains current `numbering.draft.update`, Engineer/Admin role and company-scope checks; this phase grants no new create access.
- Review requires R&D Manager/Admin capability plus current assignment/eligibility on the exact request and matching company. Role alone is insufficient.
- Withdrawal requires original submitter identity, matching company and zero decisions; Admin cannot override.
- Progress view follows existing drawing/read access. Technical token and cleanup state are never exposed through user-facing list/detail APIs.
- Cleanup is system-service only. Any Postgres/Supabase implementation must keep new support tables inaccessible to `PUBLIC`, `anon` and direct `authenticated` access, with provider-appropriate row protection as defense in depth.
- 403 surfaces show the missing capability and contact role. They never show audit/history links that do not exist under `4C`.

### 0.9.12 Transaction, failure recovery and UI contract

- Final decision, durable revision materialization and current drawing/task projection form one atomic command boundary. If validation/apply/projection fails, the request stays active or `apply_failed`; no terminal projection or cleanup is allowed.
- External delivery is optional and cannot retain Phase 1H review history. Once the atomic current-state projection commits, review actions and pending KPI are removed while technical cleanup may retry.
- Cleanup is a separate idempotent transaction. Failure retries cleanup only; it must never recreate or reapply the decision. Partial graph deletion is forbidden.
- UI shows only the user decision: current lifecycle state, optional current correction instruction, and one primary CTA. Request IDs, cleanup state, token expiry, raw statuses and delivery internals are not visible.
- Reviewer return reason is visibly marked `選填`. Empty submit is valid; the resulting drawing state says `請修正後重新送審` without fabricating a reason.
- Post-submit success stays in drawing context. Reviewer primary navigation opens the exact work item; all other actors remain on `查看進度`.

### 0.9.13 RD acceptance, evidence and stop conditions

Required acceptance/evidence at implementation handoff:

- focused contract tests for lifecycle precedence, one-primary-action, current assignment, company isolation, optional return reason, first-decision withdrawal cutoff and legacy fail-closed behavior;
- disposable-database flows for submit → withdraw, submit → return with/without reason → resubmit, multi-review first decision, approve minor, approve historical lower revision, notification failure/retry and cleanup failure/retry;
- after successful cleanup, zero Phase 1H submission/approval/decision/outbox business rows for the fixture, while formal revision package, controlled files, selected P01/P02/P03 scope and latest/history classification remain correct;
- seven-day token expiry, forbidden-payload inspection, duplicate-command suppression and authorization re-check evidence;
- before/after hashes proving existing completed/reserved/permanent fixtures unchanged and a DEV-054 protected-file manifest unchanged; only explicit 8B active-adoption fixtures may change;
- signed-in fixed-3000 real UI flow with separate submitter/reviewer actors, exact CTA routing, optional reason label, post-cleanup redirect, visible/console errors 0 and no unexpected overflow at in-scope viewports.

Stop and return to PM if implementation requires any of the following:

- a second persistent lifecycle authority or durable review tombstone/history;
- weakening append-only/no-delete/RLS protection for other approval domains;
- deleting or rewriting completed/unknown production/legacy records or replaying reviews; explicit 8B active adoption follows section 0.10 only;
- deleting transient rows before durable revision/files/part scope and the 9B current-state projection are proven;
- changing DEV-050 minor release policy, implementing Phase 1G confirmed-impact replacement mapping, or touching DEV-054 protected scope;
- production migration, deploy or release without the independent release gate.

The exact implementation contract is closed by section 0.10. No P0/P1 human product decision remains.

## 0.10 2026-08-06 Phase 1H RD Implementation Contract

Document maturity: `Local RD Implemented / AI QA + Independent QC Passed / Production Release Gated`
Risk: `High` because the local implementation introduces an intentional, domain-scoped deletion path. Production migration, active-workflow adoption, deployment and release remain separately gated.

### 0.10.1 Final human decisions and first-principles boundary

- `HD-053-1H-08 / 8B`：Phase 1H activation includes all safely eligible drawing-revision workflows that are still in progress. Adoption is all-or-nothing: dry-run first, `blocked=0` before apply, no decision replay and no partial feature activation. Completed/unknown records are permanent and untouched.
- `HD-053-1H-09 / 9B`：mandatory delivery means the durable drawing lifecycle state and the current `我的待辦` read projection are atomically current. Phase 1H does not create a permanent review notification. The projection contains no submitter/reviewer/reason/request history.
- `HD-053-1H-10 / 10B`：a completed or cleaned review link redirects to the drawing's latest revision. It does not preserve the reviewed historical version as a review destination.

The irreducible business objects are the drawing, revision package, controlled files and selected part scope. Approval rows are temporary control machinery. Fresh Phase 1H therefore uses one native approval request while active and does not create a legacy `submissions` record merely to preserve the old page model.

### 0.10.2 Canonical authority and lifecycle algorithm

Register native action `numbering.drawing_revision_lifecycle_review` with handler key `drawing-revision.lifecycle`. For this action only:

1. `POST /api/numbering/drawing-revisions/submissions` validates company, `numbering.draft.update`, Engineer/Admin, revision policy, controlled-file evidence and non-empty selected part scope.
2. One transaction creates/updates the durable revision package, durable controlled-file links and durable part scopes, then creates one transient lifecycle workflow, one native approval request, immutable target/snapshot rows and the active reviewer set. No legacy `submissions`, FFF inbox adapter item, permanent task or permanent notification is created for a fresh Phase 1H command.
3. The active request is the only decision authority. Reviewer eligibility requires both R&D Manager/Admin capability and membership in the current workflow reviewer set; role alone is insufficient.
4. A decision command locks workflow, request and revision package. `approved` applies DEV-050 policy; `returned_for_correction` writes only the current optional correction reason. The same transaction updates `drawing_revision_packages.lifecycle_state`, which is the 9B durable current-state notification/projection.
5. After commit, cleanup removes the transient graph. A cleanup failure leaves the durable result visible and schedules cleanup-only retry; it never replays a decision or apply.
6. `withdraw_before_decision` locks the same rows, verifies original active submitter and decision count `0`, returns the package to `preparing`, updates the current projection and cleans the graph. After any decision it fails closed.
7. Successful resubmit clears `active_correction_reason` in the same transaction that creates the next request. It reuses the package/assets/scope and does not create a duplicate revision.

Projection precedence remains:

`released > rd_controlled > correction_required > in_review > preparing`

| Canonical state | Visible label | Primary action | Allowed secondary action |
|---|---|---|---|
| `preparing` and not ready | 準備中 | `continue_preparation` | none |
| `preparing` and ready | 準備中 | `submit_for_review` | none |
| `in_review`, actor is assigned eligible reviewer | 送審中 | `open_exact_review` | none |
| `in_review`, other actor | 送審中 | `view_progress` | original submitter may additionally use non-primary `withdraw_before_decision` only at decision count 0 |
| `correction_required` | 退回修改 | `correct_and_resubmit` | none |
| `rd_controlled` | 研發受控 | `create_revision` | history/attachments remain secondary navigation |
| `released` | 正式發布 | `create_revision` | history/attachments remain secondary navigation |

`latest/history` is a display classification after the lifecycle state is derived. It never changes the state or creates another action authority.

### 0.10.3 Additive schema and migration contract

Exact migration artifacts:

- `db/schema.sql` for a clean SQLite bootstrap;
- `src/lib/db.ts` only for the existing local additive bootstrap parity block;
- new `db/postgres/026_drawing_revision_lifecycle_authority.sql`;
- new mirror `supabase/migrations/20260806020000_drawing_revision_lifecycle_authority.sql`;
- `supabase/migrations/manifest.json` and migration mirror QC;
- `.env.example` and `src/lib/number-state-flow-feature.ts` for `PDM_DRAWING_REVISION_LIFECYCLE_MODE=off|shadow|enforced`, default `off`.

Schema shape:

- Add nullable `lifecycle_state` to `drawing_revision_packages`, constrained to `preparing|in_review|correction_required|rd_controlled|released`. `NULL` means grandfathered legacy projection. Add nullable `active_correction_reason`; it must be `NULL` unless `lifecycle_state='correction_required'`. Existing `status` remains compatibility storage but may not override a non-null Phase 1H lifecycle state.
- Add durable `drawing_revision_package_part_scopes` with `package_id`, company/item/part identities, part number/name, link type and FFF states/outcome. Unique `(package_id, part_number_id)`; package deletion cascades, referenced masters restrict. This table replaces `submission_part_scopes` as the post-cleanup PDM authority.
- Add transient `drawing_revision_lifecycle_workflows` with workflow/package/company identity, native approval package/request pointers, optional adopted legacy submission/FFF pointers, `origin=new|adopted_active`, `state=active|finalizing|cleanup_pending`, active `submitted_by`, snapshot hash, and nullable `cleanup_authorized_at`. It contains no terminal business history and is deleted last.
- Add transient `drawing_revision_lifecycle_reviewers` keyed by workflow/reviewer/role with required order/quorum metadata. It is the exact assignment authority and cascades with workflow.
- Add `drawing_revision_lifecycle_command_tokens` containing only `key_hash`, `scope_hash`, `result_fingerprint`, `status`, `expires_at` and technical timestamps. It has no actor, company ID, drawing/revision, request ID, reason, file or payload. Scope is recomputed with a server secret and authorization is rechecked on every replay. Rows expire and are physically deleted within seven days.
- Seed `numbering.drawing_revision_lifecycle_review`. No new user-facing audit, notification or history table is allowed.

Postgres/Supabase security:

- Enable and force RLS on all new tables; revoke `PUBLIC`, `anon` and direct `authenticated` access. Only the server repository role may mutate them.
- Replace the existing target/snapshot/decision/event delete guards with a narrow predicate: deletion remains denied unless the exact request/package belongs to a Phase 1H workflow with `cleanup_authorized_at IS NOT NULL`. A global trigger drop, session-wide replication bypass or broad delete grant is prohibited.
- The `audit_logs` no-delete guard receives the same narrow exception only for the exact `legacy_submission_id` of an adopted workflow after cleanup authorization. All other audit rows remain immutable.
- `drawing_revision_package_review_approvals` is not written by Phase 1H. An active legacy candidate that already has such a companion is considered terminal/ambiguous and blocks adoption; its immutable trigger is unchanged.

Migration SQL is schema-only. It must not adopt, rewrite or delete runtime rows. SQLite, PostgreSQL and Supabase mirror definitions must be semantically equivalent.

### 0.10.4 8B active-workflow adoption algorithm

Exact artifacts:

- new `src/lib/drawing-revision-lifecycle-adoption.ts`;
- new `scripts/migrate-dev-053-phase1h-active-workflows.mjs`, dry-run by default; local apply requires both `--apply` and `--confirm-local-phase1h-adoption`;
- new `scripts/qc-dev-053-phase1h-adoption.mjs`.

Dry-run selects only drawing-revision FFF/submission workflows that are not completed, obsolete or cancelled. Each candidate must satisfy all of the following:

1. package, submission, drawing, revision and company identities agree;
2. exactly one package and one active legacy review exist for the drawing/revision;
3. no immutable approval companion or contradictory terminal review event exists;
4. every selected controlled file already has a durable package-file/asset link;
5. every selected part scope resolves to a same-company durable part and can be copied without collision;
6. no discussion, markup, sandbox, BOM, change request, issue, supplement or other non-Phase-1H child depends on the legacy submission;
7. no native Phase 1H workflow/request already exists, except an exact idempotent prior adoption;
8. legacy status maps deterministically to `in_review` or `correction_required`.

Dry-run emits candidate count, adoptable count, blocked count and reason codes, but reports use non-production fixture IDs only; production artifacts must redact personal and business payload. Apply is prohibited unless `blocked=0` for the complete activation set.

Apply locks each candidate and re-runs all guards. It copies part scopes into the durable package table, writes the package lifecycle state, creates the native request/reviewer/workflow rows, and creates a transient `approval_platform_legacy_links` mapping so an active old link can redirect to the exact native request. The legacy adapter excludes adopted assessments from its inbox/read counts immediately. No decision is copied or replayed. The original legacy graph remains read-only until withdraw, return or approval finishes, then enters the same cleanup graph.

Activation sequence is fixed: schema migration → `shadow` dry-run/parity → adoption dry-run `blocked=0` → adoption apply/parity → `enforced`. Partial company/request activation is not allowed in this DEV. Completed and unknown records never enter the adoption set.

Rollback boundary: before any native decision, an adopted bridge may be removed only by a guarded rollback that proves decision count 0 and no cleanup. After the first Phase 1H decision or cleanup, history deletion is intentionally irreversible; rollback is forward-fix only and production release must record that point of no return.

### 0.10.5 Exact API, response and deep-link contract

| Route | Contract |
|---|---|
| `POST /api/numbering/drawing-revisions/submissions` | canonical create/resubmit; delegates to `drawingRevisionLifecycle.submit`; returns durable drawing/revision projection and canonical href, never a legacy submission page |
| `POST /api/approvals/requests/{requestId}/decisions` | for the new action accepts `approved` or UI `returned_for_correction` normalized to platform `rejected`; returns a pre-cleanup response snapshot with canonical latest-drawing href |
| `POST /api/approvals/requests/{requestId}/withdraw` | new canonical withdraw command; original submitter, same company, zero decisions, mandatory idempotency key |
| `GET /api/approvals/requests/{requestId}` | active exact request only; a cleaned request returns `410 APPROVAL_REQUEST_GONE` and a validated latest-drawing href when fallback is available |
| drawing workbench/detail BFFs | return only `displayStatus`, one `primaryAction`, allowed secondary actions, active correction reason and canonical href; no raw/effective axes or cleanup/token fields |
| approval inbox/count | excludes adopted legacy rows, cleanup-pending rows and terminal projections; includes each native active request exactly once |
| numbering tasks/notifications | derives current Phase 1H work from package/request state; does not insert permanent Phase 1H notification/task rows |

New exact-review URLs use `/approvals?requestId={id}&drawing={serverEncodedDrawing}`. The server resolves request first and validates drawing visibility. After cleanup, it ignores historical revision context and redirects to the latest row for that drawing (`10B`). If a pre-Phase-1H bookmark contains only a deleted opaque ID and no resolvable drawing, it redirects to `/numbering/drawings` rather than retaining a tombstone mapping.

For a Phase 1H/adopted workflow, legacy `/submissions/{id}` UI redirects to the canonical active request or latest drawing. Legacy `/api/submissions/{id}/approve|reject|cancel|return-for-correction` routes return `410 DRAWING_LIFECYCLE_LEGACY_MUTATION_DISABLED` plus canonical navigation and perform zero writes. Non-Phase-1H submission domains retain existing behavior.

Error contract:

| HTTP | Code | Meaning / recovery |
|---|---|---|
| 400 | `DRAWING_LIFECYCLE_INVALID_COMMAND` | invalid decision/body; keep current UI state |
| 403 | `DRAWING_LIFECYCLE_REVIEWER_NOT_ASSIGNED` | role exists but actor is not the exact reviewer; show contact role |
| 403 | `DRAWING_LIFECYCLE_WITHDRAW_FORBIDDEN` | actor is not original active submitter |
| 404 | `DRAWING_LIFECYCLE_WORKFLOW_NOT_FOUND` | no active or visible workflow; return to drawing workbench |
| 409 | `DRAWING_LIFECYCLE_STATE_CONFLICT` | stale request/package state; reload canonical projection |
| 409 | `DRAWING_LIFECYCLE_DECISION_ALREADY_STARTED` | withdrawal attempted after first decision; view progress/correction |
| 409 | `DRAWING_LIFECYCLE_ADOPTION_BLOCKED` | migration/adoption ambiguity; feature must remain non-enforced |
| 410 | `APPROVAL_REQUEST_GONE` | cleaned request; redirect to latest drawing when validated fallback exists |
| 410 | `DRAWING_LIFECYCLE_LEGACY_MUTATION_DISABLED` | old write route blocked; use canonical href |
| 500/503 | `DRAWING_LIFECYCLE_APPLY_FAILED` | request remains active/apply-failed; no cleanup |
| 202 | `DRAWING_LIFECYCLE_CLEANUP_PENDING` | durable result is complete; UI shows that result while system retries cleanup only |

### 0.10.6 Ordered terminal cleanup and retry worker

New `src/lib/drawing-revision-lifecycle-cleanup.ts` and repository method `cleanupTerminalWorkflow` own the only cleanup path. The transaction order is fixed:

1. Lock workflow, package and request; confirm `lifecycle_state` is `preparing`, `correction_required`, `rd_controlled` or `released`, the current-state projection is readable, durable file/part-scope counts match the frozen snapshot and no active reviewer action remains.
2. Set `cleanup_authorized_at` and keep the lock. This is not a user-visible terminal record; the workflow row is deleted in the same successful transaction.
3. For an adopted workflow, null `drawing_revision_packages.source_submission_id` and `drawing_revision_package_files.source_submission_file_id` only after durable equivalents are proven. Delete exact legacy notification/task rows, `submission_attempts`, approval steps/matrix, snapshots/scopes/files, exact authorized audit rows, review-confirmation events and FFF assessment; then delete the legacy submission. Adoption blockers guarantee no out-of-scope child is cascaded.
4. Delete native decisions/events, impact snapshots, targets, transient legacy link and package items; delete native request, then approval package if it has no other request.
5. Delete workflow reviewers, any payload-bearing outbox event tagged to the workflow, and the workflow row last. Do not delete the technical token until TTL expiry; it contains no business identifiers.
6. In the same transaction run zero-row assertions for workflow, request, decision/event/target/snapshot/outbox and adopted legacy IDs. Any failure rolls back the entire cleanup transaction.

Cleanup retry is an application worker invoked after terminal commands and by a bounded scheduled/local maintenance command. It selects only `cleanup_pending` Phase 1H rows, uses `FOR UPDATE SKIP LOCKED` on PostgreSQL (serialized transaction on SQLite), exponential backoff with capped jitter, and never calls decide/apply. Metrics are aggregate counts only. No error log may include actor, reviewer, reason, filename, snapshot or request payload.

### 0.10.7 Exact affected-file boundary

Primary domain/data files:

- new `src/lib/drawing-revision-lifecycle.ts`;
- new `src/lib/drawing-revision-lifecycle-cleanup.ts`;
- new `src/lib/drawing-revision-lifecycle-adoption.ts`;
- new `src/lib/repositories/drawing-revision-lifecycle-async-repository.ts`;
- `src/lib/approval-platform.ts` and `src/lib/repositories/approval-platform-async-repository.ts` for native action dispatch, assignment and adopted-legacy suppression;
- `src/lib/drawing-submission-workbench.ts`, `src/lib/drawing-revision-workbench.ts`, `src/lib/drawing-workbench.ts`, `src/lib/drawing-workbench-status.ts` and `src/lib/repositories/drawing-workbench-async-repository.ts` for the single projection;
- `src/lib/repositories/drawing-revision-package-async-repository.ts` for durable lifecycle/part scope and no Phase 1H approval companion;
- `src/lib/repositories/platform-outbox-async-repository.ts` only if required to tag/delete existing payload rows; 9B must not introduce external delivery dependency.

API/UI files:

- `src/app/api/numbering/drawing-revisions/submissions/route.ts`;
- `src/app/api/approvals/requests/[requestId]/decisions/route.ts` and new `withdraw/route.ts`;
- `src/app/api/approvals/requests/[requestId]/route.ts`, `src/app/api/approvals/inbox/route.ts`;
- `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts` and workbench detail routes;
- `src/app/api/numbering/notifications/route.ts` only for stale Phase 1H suppression/current projection composition;
- `src/app/approvals/page.tsx`, `src/app/numbering/revisions/page.tsx`, `src/components/drawing-workbench.tsx`, `src/app/numbering/tasks/page.tsx`;
- `src/app/submissions/[id]/page.tsx`, `src/lib/approval-workbench-legacy-redirect.ts` and the legacy submission mutation routes for redirect/fail-closed guards;
- `src/components/sidebar-nav.tsx` only for canonical actionable pending count.

Verification/config files:

- `package.json`;
- existing `scripts/qc-dev-053-drawing-workbench-*.mjs` where the existing contract changes;
- new `scripts/qc-dev-053-phase1h-schema.mjs`, `qc-dev-053-phase1h-adoption.mjs`, `qc-dev-053-phase1h-authority.mjs`, `qc-dev-053-phase1h-http.mjs`, `qc-dev-053-phase1h-ui.mjs`, `qc-dev-053-phase1h-real-operation.mjs`; `qc:dev-053:phase1h:cleanup` deliberately reuses the transactional authority suite because cleanup and terminal apply are verified in the same disposable-database cases rather than duplicated in a second script;
- this SPEC, DEV task, QA plan and future QC evidence.

Protected/non-scope files include all DEV-054 SPEC/ADR/QA/QC, `db/postgres/023_remove_project_status_authority.sql`, its Supabase mirror, `024_remove_submission_phase_gate.sql`, removed DVT pages/APIs/tests and any unrelated shared hunk. RD must save a protected-path hash manifest before editing and compare it after every slice.

### 0.10.8 RD slices, QA/QC commands and exit gates

| Slice | Scope | Exit gate |
|---|---|---|
| `1H-1 Schema and adoption` | migration/mirror, durable scope, transient workflow/reviewer/token, narrow trigger guards, flag, dry-run/adopter | SQLite/Postgres/Supabase parity; completed hashes unchanged; adoption dry-run/apply/idempotency/blocker tests; other-domain delete remains denied |
| `1H-2 Authority and commands` | native action/handler, submit/resubmit, decision, withdraw, atomic current-state projection, cleanup service | create/return/approve/withdraw concurrency and permission contracts; no legacy submission for fresh flow; no permanent notification/audit |
| `1H-3 Projection, UI and compatibility` | workbench/inbox/task projection, one CTA, latest redirect, legacy UI/API closure | same visible status/count across surfaces; old writes zero; desktop/mobile five-second and noise gates |
| `1H-4 Cleanup and AI QA` | retry/TTL, adopted cleanup, full regression, real UI and evidence freeze | zero transient business rows, durable package/files/P01-P03 intact, existing/DEV-054 hashes unchanged, type/lint/build and AI real operation pass |

Required package commands after RD adds them:

- `npm run qc:dev-053:phase1h:schema`
- `npm run qc:dev-053:phase1h:adoption`
- `npm run qc:dev-053:phase1h:authority`
- `npm run qc:dev-053:phase1h:cleanup`
- `npm run qc:dev-053:phase1h:http`
- `npm run qc:dev-053:phase1h:ui`
- `npm run qc:dev-053:phase1h:real-operation`
- aggregate `npm run qc:dev-053:phase1h`
- existing `npm run qc:dev-053`, `npm run qc:pdm-approval-platform`, Supabase migration mirror/live-smoke in an isolated target, `npm run typecheck`, scoped lint and isolated production build.

AI real operation must use two real signed-in actors and a disposable database. It must execute fresh submit → exact reviewer → approve, pre-decision withdraw, post-decision withdraw rejection, return with/without reason → resubmit, historical 0.2 while 0.3 remains latest, active legacy adoption, terminal cleanup retry and old-link redirect to latest. API/DB may create fixtures, inject faults and read evidence but may not replace UI submission/decision actions.

Implementation conclusion: the user behavior, data ownership, adoption algorithm, schema, routes, cleanup order, permission/error behavior, exact files and slices are implemented locally. AI QA and independent QC passed; this does not authorize commit, live migration, adoption apply, flag activation, deploy or release.

### 0.10.9 2026-08-06 Local implementation and verification freeze

- Implemented the native `numbering.drawing_revision_lifecycle_review` authority, durable package/file/three-part scope, transient workflow/reviewer graph, seven-day payload-free command tokens, pre-decision withdrawal, optional active-only correction reason, minor `rd_controlled` and integer `released` terminal projection, ordered cleanup and legacy mutation closure.
- Implemented 8B all-or-nothing active adoption dry-run/apply guard, 9B atomic package/current-task projection without permanent notification/task row, and 10B cleaned-link redirect to the drawing latest state.
- UI remains two surfaces: the drawing workbench owns preparation/upload/history-backfill/submit/progress; the approval workbench owns the exact reviewer decision. Fresh submit stays on the shared revision page with one primary next step and no legacy submission-detail link.
- AI QA: schema 15/15、adoption 9/9、authority 9/9、HTTP 9/9、UI 9/9、real Chromium 8/8，共59/59；Supabase migration mirror 76/76、approval-platform regression 126/126、TypeScript、scoped ESLint與isolated optimized build全部通過。
- Independent QC from a separate physical workspace copy: 59/59, `P0=0 / P1=0 / P2=0`; run `DEV053-PHASE1H-20260806-134417`, `productionConnected=false`, `productionWrites=false`, cleanup `removed`, browser/5xx error 0 and four screenshots. The expected post-cleanup request probe returns one controlled HTTP 410 before canonical redirect.
- Safety: 27 frozen product-scope files were byte-identical before/after independent QC; DEV-054 protected 023/024 source and mirror hashes remained exact. No production connection/write, 3000 mutation, live adoption, commit, stage, deploy or release occurred.

## 1. Outcome

`/numbering/drawings` 改為單一「圖號工作台」，取消使用者可見的「圖號總表／保留號」雙分頁。使用者只需搜尋一筆圖號工作，判斷目前階段、使用效力與唯一下一步；正式圖號仍須在同一頁完成既有圖、料、版次、附件、送審、關係、影響與治理工作。

單頁化只合併資訊架構與唯讀投影，不合併底層 authority：

- 候選建立、保留、首版與整包審核仍由 DEV-052 workspace aggregate 負責；
- 正式圖號仍由 drawing master 負責；
- 正式版次、受控檔案、送審與發行仍由 revision/submission authority 負責；
- approval、audit、receipt、outbox、permission與idempotency原則維持；唯一例外是本文件0.9產品契約與0.10實作契約共同限定的DEV-053 Phase 1H lifecycle-only retention，其他領域不可放寬；
- production 既有保留號與正式圖號不搬移、不回填、不改號、不重播審核。

## 2. Problem and UX Intent

現行雙分頁把資料儲存型態暴露成導覽決策。同一位研發人員必須先猜「這筆資料現在算保留號還是正式圖號」，再到不同頁面找附件、送審、進版或追溯入口；主資料 drawer 又存在可與候選／版次附件混淆的寫入入口。

UX Intent：

- 使用者：研發工程師、研發主管、PDM Admin及有權查閱圖號的人員；
- 主要任務：建立或找到圖號工作，理解目前在哪一步、能否正式使用、下一步按哪裡；
- 5 秒成功標準：單列可回答「這是什麼、目前階段、使用效力、唯一下一步」；
- H1：`圖號工作台`；首屏只保留一句用途說明；
- 主畫面：搜尋、範圍、生命週期、用途、資料狀態與系列篩選、`建立圖號`及單一清單；
- 主清單核心欄位為`圖號`、`品名`、`工作狀態`、`下一步`；關聯料號與治理警示以欄位或列內次資訊呈現，不得消失；工作狀態只描述圖號工作生命週期，不代表專案階段；
- 關係、版次、檔案、審核、發行、影響、來源申請與 audit 降層至統一 drawer；
- 每個正常狀態最多一個 primary CTA。禁止同時顯示 `進版`、`送審`、`查看審核` 或人工 `正式發布` 等競爭入口。

## 3. Current and Target UI Comparison

| 項目 | 現行／DEV-052 本機 UI | DEV-053 目標 UI |
|---|---|---|
| 頁面結構 | `圖號總表`、`保留號`兩個頁籤 | 單一`圖號工作台`，無頁籤 |
| 保留號定位 | 獨立頁面與工作區名稱 | 一個生命週期狀態，不是頁面 |
| 清單來源 | 正式圖號與 workspace 各自載入 | server-side 統一唯讀投影 |
| 預設範圍 | 正式總表或我的保留號 | `我的待處理` |
| 建立入口 | `建立保留號`與主資料追加入口並存 | `建立圖號`，一律先建立候選 workspace |
| 下一步 | 分散於清單、drawer、Now What、進版與審核區 | 每列與drawer共用一個server-derived primary action；正式drawing另保留固定secondary operations |
| 正式化後 | 從保留號頁切到正式圖號頁 | 同一搜尋入口中由整包列切換為正式圖號列 |
| 正式圖面管理 | 正式drawer具版次、送審、關係、影響、治理、料號與成本能力 | 同一工作台完整保留，改為生命週期摘要＋分區secondary operations，不得以最小drawer取代 |
| 檔案 | 候選、版次與 master attachment 容易形成平行寫入 | 候選首版或正式版次是唯一受控檔案寫入 authority；master顯示受控摘要並可管理明確標示的參考附件 |
| 舊網址 | `/numbering/drawings?tab=reserved` 開保留號頁 | 零寫入相容到單一工作台的`工作中`範圍 |
| 系統說明 | 依頁籤分別說明，仍含舊 number-only／人工發布語言 | 一份生命週期與下一步說明 |

新版不再有使用者可見的「保留號」頁面或頁籤；`保留號`仍可作為資料狀態、搜尋字詞與歷史事實。

## 4. Canonical Row Identity and De-duplication

候選 workspace 可以同時包含多張圖，因此 canonical row unit 不能定義成「一個 workspace 永遠等於一張圖」。本契約採下列可驗收規則：

| 時點 | Top-level row unit | Row key | 顯示規則 |
|---|---|---|---|
| 建立中、已保留、首版準備、整包審核、正式化、recovery | 一個 workspace／bundle 一列 | `candidate:{workspaceId}` | `圖號`顯示主要候選圖號；多圖時顯示`主要號碼 + N`，drawer列出完整集合 |
| 正式化成功後 | 每個正式 drawing master 一列 | `drawing:{drawingNumberId}` | 每張正式圖號獨立可搜尋、進版與追溯 |
| 已取消／回收且未正式化 | 一個 workspace 一列，只在歷史範圍 | `candidate:{workspaceId}` | 顯示終結原因，不提供復活或發布捷徑 |
| 已完成且已正式化的 workspace | 不再是 top-level row | 沿用來源 workspace ID 作 audit 關聯 | 只由正式圖號 drawer 的`來源申請／追溯`查閱 |

因此「不重複」的精確定義是：

1. 同一進行中 workspace 只顯示一列，不因其中有多個 drawing drafts 而重複；
2. 正式化成功後，已完成 workspace 不與其正式 drawing masters 同時出現在 top-level 清單；
3. 每個正式 drawing master 只顯示一列；
4. 搜尋候選號、正式號或來源 workspace ID 都應定位 canonical top-level row，來源歷史由 drawer 查閱；
5. `rowKey`使用 namespaced stable ID，不得以可變 display code、陣列索引或 client-side 猜測當 identity。

若正式圖號無法可靠追溯其來源 workspace/candidate revision，RD 必須停止；不得以名稱或號碼模糊比對來消除重複。

## 5. Unified Read Model Contract

### 5.1 Endpoint

新增唯讀 BFF：

```http
GET /api/numbering/drawings/workbench
```

Query contract：

| Parameter | Values / default | Contract |
|---|---|---|
| `query` | string / empty | 比對候選圖號、正式圖號、品名、關聯料號、workspace ID；server normalization |
| `view` | `mine`、`work`、`all` / `mine` | `mine`為目前 actor 待處理；`work`為可見非終結工作；`all`含正式與歷史 |
| `stage` | visible stage / empty | 以本規格 stage vocabulary 篩選，不接受 raw repository status |
| `seriesCode` | string / empty | company-scoped 系列篩選 |
| `cursor` | opaque / empty | server opaque cursor，client 不解碼 |
| `limit` | 1..100 / 50 | 超界值拒絕或正規化，不得無上限載入 |

Response contract：

```ts
type DrawingWorkbenchRow = {
  rowKey: string;
  rowKind: "candidate_bundle" | "drawing_master"; // internal discriminator, not visible text
  workspaceId: string | null;
  drawingNumberId: string | null;
  displayCode: string;
  additionalDrawingCount: number;
  displayName: string;
  relatedPartSummary: string | null;
  stage: DrawingWorkbenchStage;
  stageLabel: string;
  usage: "not_for_formal_use" | "rd_controlled" | "released" | "historical_only";
  primaryAction: DrawingWorkbenchPrimaryAction | null;
  warning: { code: string; message: string } | null;
  updatedAt: string;
};

type DrawingWorkbenchPrimaryAction = {
  kind:
    | "continue_building"
    | "complete_first_drawing"
    | "submit_bundle_review"
    | "view_review"
    | "view_processing"
    | "retry_formalization"
    | "view_drawing"
    | "create_revision"
    | "view_history";
  label: string;
  enabled: boolean;
  disabledReason: string | null;
  href: string | null;
};

type DrawingWorkbenchListResponse = {
  rows: DrawingWorkbenchRow[];
  nextCursor: string | null;
  generatedAt: string;
  filters: { seriesCodeOptions: string[] };
};
```

`DrawingWorkbenchStage`固定支援：`building`、`drawing_preparation`、`bundle_ready`、`in_review`、`auto_finalizing`、`recovery_required`、`official_controlled`、`revision_in_review`、`released`、`history_only`。正式版次編輯器目前沒有 server-persisted draft identity，因此 `revision_drafting`、`revision_ready` 不得由統一清單虛構；使用者進入既有版次工作台後，才由該工作台的 local state 顯示 `繼續編輯`或`送交審核`。

### 5.2 Server-side composition

- 瀏覽器不得分別呼叫 `/api/numbering/draft-workspaces` 與 `/api/numbering/drawings` 後自行 concatenation、去重或決定 CTA；
- BFF 在 server 內讀取現有 workspace、candidate lifecycle、drawing master、revision/submission與approval projection；
- 同一次 response 必須在同一 company、permission context與唯讀一致性邊界完成；Postgres 使用單一 `REPEATABLE READ READ ONLY` transaction，SQLite 使用現有單連線 transaction且只呼叫read repository；任何來源失敗則整個 request fail，不回傳誤導性的 partial list；
- list/open/filter/search/deep-link normalization 全部 zero-write；不得 lazy create projection rows、candidate revisions、audit、receipt或 outbox；
- 預設排序：需人工處理者優先，其次 `updatedAt DESC`、`rowKey ASC`；opaque keyset cursor固定包含 `version`、`filterHash`、`updatedAt`、`rowKey`，signature／filter不符、tampered或版本不支援一律拒絕；
- 相同未變資料翻頁不得漏列或重列。資料在翻頁中途變動時，client 顯示可重新整理狀態，不得靜默提交舊 CTA；
- `primaryAction`、`usage`、`warning`由 server authoritative facts與 capabilities產生，client只渲染，不自行推導權限或生命週期。

### 5.3 Detail contract

新增唯讀 detail surface：

```http
GET /api/numbering/drawings/workbench/{rowKey}
```

- `candidate:*`回傳完整 workspace bundle摘要、候選圖料號、缺項、candidate revision files、approval與來源事實；
- `drawing:*`回傳 drawing master、現行／進行中版次、受控檔案摘要、release狀態、關聯料號、來源 workspace與audit連結；
- detail與list使用相同 action resolver。drawer不得出現與該列不同的第二個 primary CTA；
- `rowKey`不是授權憑證。不存在、跨公司或不可見的 row一律 404/403 且不洩漏另一公司事實；
- detail read同樣 zero-write。

## 6. State-to-Primary-Action Contract

| Visible stage | Usage conclusion | 唯一 primary CTA | Secondary / forbidden |
|---|---|---|---|
| `building` | 尚未產生／尚不可正式使用 | `繼續建立` | 可取消；不可送審、發布、進版 |
| `drawing_preparation` | 已保留、尚不可正式使用 | `完成首版` | 可編輯／取消；不可走正式版次 workbench |
| `bundle_ready` | 候選內容齊全、尚不可正式使用 | `送交審核` | 可編輯；不得另送 number-only review |
| `in_review` | 內容鎖定、尚不可正式使用 | `查看審核` | owner符合規則可撤回；不得人工發布 |
| `auto_finalizing` | 核准完成、系統處理中 | 無 primary CTA | `查看處理狀態`為secondary；禁止重複送審／發布 |
| `recovery_required` | 不可正式使用或狀態未確認 | 有retry permission者`重試正式化`，其他人`查看處理狀態` | 只重試原 approved snapshot；不得重建或改號 |
| `official_controlled` | 圖號正式、研發版受控但未Released | `查看圖面` | 不顯示候選首版／人工正式發布；建立新版入口由既有版次工作台決定 |
| `revision_in_review` | 審核中的版次不取代現行Released | `查看審核` | 依既有規則撤回；不得建立競爭進版 |
| `released` | 可依DEV-050規則正式使用 | `建立新版` | `追溯`、`影響`、`申請作廢`為secondary |
| `history_only` | 僅供歷史查閱 | `查看紀錄` | 不提供復活、占號、送審或發布捷徑 |

補充規則：

- `primaryAction=null`只允許自動正式化等明確不需人工操作的狀態；UI仍須說明「系統處理中，不需再操作」；
- 能看見資料不等於能執行動作。動作無權限時可顯示 disabled primary與具體原因，但不得以 Admin 名稱或 client state推測放行；
- stale action command沿用原 authority 的 optimistic concurrency/idempotency；409後重新讀取 row並要求使用者確認，不做 optimistic stage promotion；
- DEV-052 核准後 atomic auto-finalization 保留，統一工作台不得重新引入人工 `正式發布`。

## 7. Mutation Routing and Parallel-path Closure

統一 API 是 read-only；所有 mutation仍呼叫原 authoritative command handler：

| User intent | Command authority |
|---|---|
| `建立圖號` | DEV-052 workspace create + explicit candidate acquisition |
| `新增同根圖號／新增同圖料號` | 帶入 source root/drawing context建立 append-mode candidate workspace |
| 候選首版內容／受控檔案 | candidate revision commands |
| 整包送審／撤回 | candidate bundle review commands |
| 核准／正式化／recovery | approval apply + DEV-052 atomic/idempotent formalization |
| 正式圖面進版、送審、發行 | drawing revision/submission commands + DEV-050 release gate |
| 作廢 | 既有 change-control request，不由 list直接改 master status |

必須移除或改道目前 drawer 中直接 POST `/api/numbering/roots/{root}/drawings`、`/parts` 建立正式 master 的使用者入口。DEV-053 開啟時，所有新增或追加圖料號都先進 candidate workspace；舊 direct-master endpoints若仍供其他受控 internal flow使用，必須在 DEV-053 UI不可達，且不得藉 unified BFF proxy繞過審核。

追加情境的 authoritative context 固定如下：

- `新增同根圖號`：workspace `mode=append_drawing`，保存 `sourceRootId`；若由既有料號發起，同時保存 `sourcePartNumberId`及`sourceLinkType`。製造圖 `M` 必須有來源料號或workspace內候選關係；參考圖 `R`可明確不關聯。
- `新增同圖料號`：workspace `mode=append_part`，保存 `sourceRootId`、`sourceDrawingNumberId`與`sourceLinkType`。該整包可只含候選料號與「將連到既有圖號」的關係事實，不得為此複製或重新審核既有drawing revision。
- 三個source欄位由server依同company、同root、允許狀態、互斥規則驗證；client不得指定company或把不存在的source當有效關聯。
- source context納入candidate facts hash與approved snapshot；atomic formalization必須在原transaction中建立新正式物件及跨邊界關係，失敗時不得留下半套master或關係。

## 8. Controlled File Authority

- 候選首版受控檔案只寫入 candidate revision authority；
- 正式進版受控檔案只寫入 drawing revision package authority；
- drawing master drawer只顯示目前受控檔案摘要與來源，不得上傳／替換 CAD、2D、PDF、DWG/DXF等受控角色；
- 受控摘要旁必須提供前往candidate first-revision或formal revision工作台的可見入口；不得只顯示無法處理的唯讀結果；
- 若保留一般附件功能，UI與API必須明確命名為`參考附件`，沿用既有權限與production-slice guard，且不得成為 publication evidence、送審 completeness或 released download來源；
- 同一檔案不得同時由 master attachment與candidate/revision package宣稱為 primary controlled file；
- production GCS authority、signed URL與檔案搬移不在 DEV-053 範圍，沿用 DEV-052 release gate。

## 9. Permission and Scope Contract

- list/detail先通過 `numbering.drawings.view`，候選資料再與 `numbering.workspace.view` 可見範圍取交集；不得因統一清單擴張既有 visibility；
- 每列 capabilities從原 command permission、company scope、workspace owner、approval responsibility與record state計算；
- `view=mine`只包含 server能證明目前 actor負責的工作：workspace owner待辦、目前審核責任、或有指定 recovery responsibility的案件；無法證明歸屬時不猜測，改由`work`查閱；
- `view=work`包含同公司且有權看見的非終結工作；`view=all`仍受相同公司與角色權限限制；
- Admin角色名稱本身不隱含建立、送審、核准、重試、進版或發行權限；
- actor/company/state/rowKind/action由server決定。client傳入的對應欄位一律忽略或拒絕；
- cross-company twin codes、opaque rowKey探測與舊deep link皆不得洩漏存在性或資料。

## 10. Route, Bookmark and Backward Compatibility

Canonical route為 `/numbering/drawings`。

- `/numbering/drawings?tab=reserved`、hard reload與舊書籤以 zero-write方式對應 `view=work`；載入成功後可用 history replacement移除 obsolete `tab`，不得產生 navigation loop；
- 保留 `query`、`detail`與可安全映射的filter參數。候選 detail ID映射 `candidate:*`，正式 drawing detail映射 `drawing:*`；
- 找不到或無權看舊 detail時，顯示安全返回與保留的搜尋／篩選，不自動建立缺少資料；
- `tab=official`或無tab都進 canonical workbench；其他未知tab忽略並保持 zero-write；
- feature flag未開啟時，現行雙分頁行為保持；DEV-053 flag只可在 DEV-052 lifecycle V2相依能力可用時開啟。錯誤組態必須 fail closed或回退完整舊UI，不得顯示半套單頁加舊mutation入口。

## 11. Failure and Recovery Contract

| Failure | Required behavior |
|---|---|
| workspace/master/revision其中一個 read source失敗 | 整體 list/detail error + retry；不顯示 partial truth |
| projection identity conflict | row標記 `recovery_required`或 request fail；記診斷，不靜默選一筆或顯示兩個可操作列 |
| action state stale | command 409；重新整理該列，保留使用者上下文，不自動重送 |
| approval apply failed | 顯示沒有部分正式資料；只有具權限者可重試原 approved snapshot |
| old deep link target missing | safe empty state/return；零寫入、零補 row |
| permission changed while page open | command fail closed並刷新 capabilities；不保留過期 enabled CTA |
| cursor dataset changed | 提示重新整理；不以client merge消除或創造列 |

錯誤訊息首句需說明使用者下一步；raw status、stack、SQL、credential、signed URL、snapshot hash與storage path不得出現在可見UI。

## 12. Implementation Architecture Contract

### 12.1 Server read model

RD 必須建立單一 application service，不得在 route 或 browser 內拼資料：

| Exact file | Responsibility |
|---|---|
| `src/lib/drawing-workbench.ts` | public types、query normalization、stage/usage/primary-action resolver、list/detail service |
| `src/lib/repositories/drawing-workbench-async-repository.ts` | candidate/master identity union、stable keyset、batch hydration、來源追溯 |
| `src/lib/repositories/numbering-async-repository.ts` | 僅補必要的batch read，不改既有write authority |
| `src/lib/repositories/numbering-repository.ts` | 對齊同步型別／fixture contract；不得另建平行business rule |
| `src/app/api/numbering/drawings/workbench/route.ts` | GET list；company、permission、validation、error mapping |
| `src/app/api/numbering/drawings/workbench/[rowKey]/route.ts` | GET detail；namespaced row identity與scope防護 |

Service 順序固定為：取得actor/company → 檢查page與candidate visibility permissions → normalize query/filter/cursor → 開啟單一唯讀一致性transaction → identity list → batch hydrate → authoritative resolver → response。任何source error rollback並回整體錯誤。

### 12.2 Candidate source context and lifecycle

| Exact file | Allowed change |
|---|---|
| `src/lib/number-state-flow.ts` | create input normalization、source validation、facts hash欄位 |
| `src/lib/repositories/number-state-flow-async-repository.ts` | 三個nullable source欄位讀寫、approved snapshot、atomic cross-boundary relation |
| `src/lib/number-lifecycle-simplification.ts` | relationship-only append readiness／stage projection |
| `src/lib/repositories/number-lifecycle-simplification-async-repository.ts` | 保留DEV-052 transaction/idempotency；允許合法append-part無candidate drawing |
| `src/app/api/numbering/draft-workspaces/route.ts` | create payload接受source IDs/link type；server驗證且沿用Idempotency-Key |

不得改 approval action 語意、candidate/master ID 生成規則、released pointer、DEV-050 minor release gate或既有正式號碼。

### 12.3 UI composition

| Exact file | Responsibility |
|---|---|
| `src/app/numbering/drawings/page.tsx` | flag-on單頁shell；flag-off完整保留現行雙頁；舊URL zero-write normalization |
| `src/components/drawing-workbench.tsx` | 單一清單、filter、pagination、candidate drawer與完整formal drawer、server action rendering、治理與secondary operations |
| `src/components/number-state-workspace.tsx` | 抽出／重用candidate detail；不保留第二個top-level頁籤 |
| `src/components/master-attachment-panel.tsx` | 受控摘要/read-only mode與明確authority導流；參考附件模式須清楚命名並沿用既有權限/production-slice guard |
| `src/components/numbering-contextual-entrypoints.tsx` | direct-master create改送candidate workspace + Idempotency-Key |
| `src/lib/status-scope-display.ts`、`src/components/status-help-popover.tsx` | 統一可見狀態與說明，不暴露raw repository status |
| `src/app/globals.css` | 1440/1280/1024/390 viewport與drawer安全樣式 |

`src/components/master-attachment-panel.tsx`在既有正式版次工作台的寫入用途不得被全域關閉。每列及drawer只渲染server給定的一個primary action，但正式drawing drawer必須另外呈現不競爭primary的版次、送審、關係、影響、作廢與治理secondary operations。

### 12.4 Feature flag

- flag：`PDM_UNIFIED_DRAWING_WORKBENCH_V1`；default `false`；
- `src/lib/number-state-flow-feature.ts`增加解析，`src/app/api/numbering/state-flow/status/route.ts`以`drawingWorkbench`回傳；
- 只有 `PDM_NUMBER_LIFECYCLE_V2=true` 且新flag=true時可啟用；相依能力缺少時fail closed到完整舊UI；
- 關閉flag即為本機UI rollback；additive nullable columns可留存，不需刪欄位或資料回復。

## 13. Schema and Migration Contract

Implementation Readiness Review確認既有workspace只有`source_root_id`，無法無損表達「把新料號連到指定既有圖號」或「把新圖號連到指定既有料號」。依ADR允許以下最小additive變更：

```sql
source_drawing_number_id TEXT NULL
source_part_number_id TEXT NULL
source_link_type TEXT NULL
```

- canonical schema：`db/schema.sql`；
- PostgreSQL migration：`db/postgres/022_unified_drawing_workbench.sql`；
- Supabase mirror：`supabase/migrations/20260804020000_unified_drawing_workbench.sql`；
- migration manifest：依repo現行manifest格式補登；
- SQLite repair：`src/lib/db.ts`只用既有`ensureColumn`加nullable欄位。SQLite既有表不為FK重建，跨欄位與scope由server驗證；canonical/Postgres可加FK、CHECK與必要index；
- 既有rows三欄保持`NULL`，不backfill、不推測source、不改號；legacy與DEV-052 workspace照常推進；
- production不在本DEV目前授權。不得在本機文件推進時執行production migration。

Rollback：flag off → 停止建立含新source context的workspace → 保留nullable欄位與既有值供追溯。禁止down migration刪欄或清資料；若需production rollback，須另走deployment release gate。

## 14. Delivery Slices and Exact Exit Gates

| Phase | Status | Scope | Exact exit evidence |
|---|---|---|---|
| Prior contract | Historical complete | 舊版SPEC、QA plan、spec impact、DEV索引 | 僅證明先前契約曾完成，不代表Phase 1F可派工 |
| Prior implementation readiness | Historical complete / reopened | 舊版ADR、exact files、schema/API/flag、分期、測試與rollback | 已被本次16項缺口盤點重新開啟 |
| 1A：read foundation | Complete / retained | additive schema、source context、lifecycle snapshot/formalization、read repository/service、list/detail API、flag | 既有schema/read-model/HTTP tests與DEV-052 regression |
| 1B：single-page UI | Rejected / superseded | single list/drawer、old URL與RWD shell保留；最小formal drawer驗收撤銷 | 由1E取代，不得沿用PASS |
| 1C：contextual append | Complete / retained | direct-master UI改道、relationship-only bundle、atomic cross-boundary relation、action routing | 既有flow/idempotency/permission/atomic rollback tests |
| 1D：QA/QC | Reopened | 舊QA未覆蓋既有能力清冊，結果只保留為歷史紀錄 | 不得作為產品完成證據 |
| 1E：capability restoration | Historical frozen snapshot / not current acceptance | 曾恢復正式row parity、formal drawer與14組能力；目前3000操作仍暴露16項交付缺口 | 舊focused/AI QA/QC證據只作追溯，不得沿用為Phase 1F PASS |
| 1F：operability and delivery closure | Local RD / AI QC Passed / Commit Pending | 已修復16項缺口，建立正常固定3000可重現路徑，補足附件authority、完整次要操作、狀態一致性與current source evidence | current aggregate、真實Chromium、固定3000唯讀smoke與optimized build通過；release另行授權 |
| Production release | Explicitly gated | migration/flag rollout/backup/rollback/smoke | deployment-release-gate evidence |

Phase 1F已可派本機RD依0.7逐slice實作；本輪尚未開始產品修改。不得提前打開production flag，也不得把能力未完整驗收的UI設為default-on。每一slice可獨立停在flag-off狀態。

## 15. Test Command Contract

RD 應更新既有focused scripts，使其覆蓋Phase 1F契約：

| Script | Required coverage |
|---|---|
| `scripts/qc-dev-053-drawing-workbench-schema.mjs` | migration parity、nullable default、existing row unchanged、source validation |
| `scripts/qc-dev-053-drawing-workbench-read-model.mjs` | identity、de-dup、多圖transition、resolver、cursor、source failure、consistent snapshot |
| `scripts/qc-dev-053-drawing-workbench-http.mjs` | auth/company/permissions/query/cursor/list/detail/error/zero-write |
| `scripts/qc-dev-053-drawing-workbench-ui.mjs` | one page、one primary CTA、formal secondary operations、舊能力清冊、old URL、附件authority、viewport/accessibility |
| `scripts/qc-dev-053-drawing-workbench-flow.mjs` | contextual append、relationship-only review、snapshot、atomic formalization、idempotency |
| `scripts/qc-dev-053-drawing-workbench-real-operation.mjs` | AI登入後實際點擊／輸入／上傳／送審／核准／reload／cleanup manifest |

`package.json`增加phase scripts及`qc:dev-053`aggregate。最小執行順序：

```powershell
npm run qc:dev-053:schema
npm run qc:dev-053:read-model
npm run qc:dev-053:http
npm run qc:dev-053:ui
npm run qc:dev-053:flow
npm run qc:dev-053:real-operation
npm run qc:local-dev-entrypoint
npm run qc:dev-052
npm run qc:pdm-numbering-contextual-entrypoints
npm run qc:master-attachments
npm run qc:pdm-revision-policy-release-gate
npm run qc:pdm-numbering-core
npm run qc:pdm-production-slice-numbering-draft
npm run typecheck
npm run lint
npm run build:isolated
```

Phase 1F依1F-1～1F-3先跑對應focused tests，1F-4再執行完整矩陣與正常固定3000真實操作。測試不得以API/DB mutation代替標為UI的真實操作，且必須提供DEV-054受保護檔案/語意未被改動的diff證據。

## 16. Acceptance Criteria

1. `/numbering/drawings`只有一個`圖號工作台`，無`圖號總表／保留號`頁籤；新版無獨立保留號頁。
2. 舊 `?tab=reserved` zero-write到達`工作中`等效範圍，保留query/detail，無loop、lazy write、回填或改號。
3. 進行中 workspace一整包一列；正式化後切為每張 drawing master一列，完成workspace只在來源追溯中，無重複top-level row。
4. 多圖bundle正式化前後數量切換正確：1個candidate bundle row轉成N個formal drawing rows；每個正式圖號都能以候選號、正式號或來源ID找到。
5. list/detail由server-side unified read model產生，client不拼接兩支清單；任何來源失敗不回partial list。
6. 每個正常狀態最多一個primary CTA，與第6節矩陣一致；disabled/recovery同時說明原因與可行下一步。
7. `建立圖號`、新增同根圖號與新增同圖料號全走candidate workspace；DEV-053 UI無直接建立master的平行路徑。
8. `append_part`可保存指定既有圖號的relationship-only intent；`append_drawing`可保存指定既有料號，核准正式化時在同transaction建立跨邊界關係。
9. candidate與formal revision受控檔案各有單一權威；master drawer提供受控摘要與權威工作台入口，參考附件可依原權限維護但不成為受控證據。
10. list、search、filter、pagination、drawer、old URL與feature bootstrap在既有workspace/reservation/approval/master/revision/audit/outbox上zero-write。
11. `mine/work/all`、company、role、owner、reviewer與recovery權限均fail closed；跨公司與client spoof無資料洩漏或動作放寬。
12. DEV-052 atomic/idempotent formalization、legacy continuation與DEV-050 minor Released禁令回歸通過；不再出現人工正式發布CTA。
13. 正式版次尚未server提交前，不得在統一列表產生`revision_drafting`／`revision_ready`幽靈狀態；提交後才顯示`revision_in_review`。
14. 1440×900、1280×720、1024×768、390×844可搜尋、篩選、開drawer與執行主要下一步，無非預期水平overflow、CTA裁切、焦點遺失或可見錯誤。
15. AI真實操作必須用實際登入、點擊、輸入、上傳、送審、審核與重新載入完成關鍵流程；不得用API/DB mutation代替UI步驟，API/DB只作前後證據與負向驗證。
16. productionConnected=false、productionWrites=false；任何production啟用仍需獨立release gate。
17. 正式drawing列可依用途、資料狀態、系列與關鍵字查詢，且關聯料號、待審、發布不一致與警告可發現；不得恢復DEV-054移除的開發階段filter/display。
18. 每張正式drawing都能發現圖面進版、上傳與送審、完整圖料關係、適用時的影響分析及作廢入口；權限或production slice封鎖時顯示原因，不可靜默隱藏。
19. 發布狀態不一致、Title block變體風險、送審檢查、同根料號、料號主資料編輯、標準成本與主要製造圖均在formal drawer可達且遵守原權限/lock guard。
20. DEV-053修復前後，DEV-054的刪檔、023 migration、專案狀態移除、規則/權限與文件語意保持不變；DEV-053 commit不得包含其hunk。
21. 首次開啟固定為`view=all&history=exclude`，可見進行中、正式受控與已發布；歷史只有切換`包含歷史`或直接terminal deep link才顯示，且不受localStorage舊值影響。
22. 每張候選圖面只要求至少一個active primary finalized controlled file；缺PDF、DWG/DXF或3D檔只作warning並進入review snapshot，不阻擋owner送審。
23. formal drawer清楚分成唯讀`受控版次檔案`與可依權限管理的`參考附件`；預覽重建、Drive重試、刪除／還原與補件能力可完成，參考附件不會成為送審或Released證據。
24. `圖面進版`與`上傳與送審`在drawer使用同一共享revision workbench與既有API；關係、影響、主資料與歷史使用專用頁並可返回原列。
25. 403顯示中文能力、exact permission code與聯絡角色；只有具`settings.admin_matrix`的Admin可前往`/settings/workflow`，UI與direct API均fail closed。
26. normal fixed-3000 development evidence需經stored-object hash read-back驗證；production即使誤設`PDM_LOCAL_FULL_FUNCTION_VALIDATION`也不得接受本機evidence。
27. 既有candidate檔案已保存但缺publication evidence時，drawer必須提供單一明確的`驗證既有檔案`恢復入口；server逐檔核對tenant、asset identity、storage pointer、size與SHA-256後才建立evidence。不得要求使用者重新選檔、建立第二個file asset、改檔名／編號或用client宣稱驗證完成；部分成功要保留、重試須冪等、hash不符須409且零evidence／零row-version變更。
28. 圖面進版送審的標準成本為選填。未設定標準成本不得計入`待補`、不得使用danger／blocked語意、不得停用送審；UI保留中性`未設定（選填）`提示與成本維護入口。主資料、受控檔案及其他既有必要條件仍照原規則判定。
29. 使用者開始將檔案加入目標版次後，該版次意圖必須鎖定；附件加入後的submission-context refresh不得把目標版次自動推進成下一個server suggestion，也不得把剛加入的檔案降為參考檔。重新解析另一圖號才可重置版次建議。

## 17. Spec Governance

Classification: `Intentional replacement + additive source-context extension + capability-preservation amendment + lifecycle/approval authority convergence`。

- 本規格在 DEV-053產品實作與QA/QC通過後，取代 DEV-052 `HD-052-04`「保留`圖號總表／保留號`雙分頁」的UI、導覽與read projection契約；
- DEV-052候選aggregate、legacy compatibility、single bundle review、atomic auto-finalization、permission、idempotency、audit與release gate維持authoritative；
- DEV-050、DEV-051與正式revision/submission authority不被單頁化取代；
- source-context schema與跨邊界關係採 `.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`；任何超出三個nullable欄位、需要backfill或改authority的方案必須另開ADR。
- 2026-08-05使用者確認DEV-054為另一AI的必要並行任務；DEV-053不得修改、還原或提交其範圍。Phase 1E只修正單頁UI能力退化，既有ADR仍充分，無需新ADR。
- 2026-08-06使用者明確將圖面進版送審的標準成本改為非必要；本次為DEV-053 readiness/UI契約的`Intentional replacement`，不刪除成本主檔、成本審核、權限或維護入口，也不改schema。技轉包獨立submission-gate未納入本次畫面修正。
- 2026-08-06使用者回報加入0.2版次檔案後版次跳到0.3；判定為`Implementation needs correction`：檔案寫入後的server suggestion refresh覆蓋了本次目標版次。修正為加入檔案即鎖定版次意圖，沿用既有server suggestion僅作初始建議。
- 2026-08-06 Phase 1H將使用者可見的審核與生命週期收斂為`2-1-1-0`，並以`4C／5A／6A／7A／8B／9B／10B`建立圖面進版限定的lifecycle-only retention例外。這是對可操作legacy submission頁、分散raw-status投影、平行決策command與永久圖面進版audit history的`Intentional replacement`；已同步修正`SPEC-PDM-APPROVAL-PLATFORM-001`，且不擴及其他approval領域。文件已達`RD Implementation Ready / Human Confirmed`，本機RD實作進行中；不回寫既有production資料也不觸及DEV-054。

## 18. Phase 1A～1G Historical RD Stop Conditions

本節保留既有phase邊界；Phase 1H以0.9.13為current stop conditions。尤其「不得新增business table」只約束舊source-context slice，不得用來否定Phase 1H已確認但尚待Implementation Ready細化的additive lifecycle-only retention schema。

遇到任一情況，RD必須停止並回報Dev PM：

- 無法用既有stable IDs可靠建立candidate到formal drawing的來源關聯；
- 必須client-side concatenation、以名稱／號碼猜測去重，或接受partial list；
- 統一清單會放寬company、owner、reviewer或command permission；
- 無法區分master附件與candidate/revision controlled file authority；
- 需要直接建立master、重播approval、改atomic formalization語意、放寬minor Released gate；
- schema超出本規格三個nullable source欄位，或需要新business table、table rebuild、backfill、搬移、改號或刪除既有資料；
- 需要production target、credential、live data repair、deploy、release、merge或PR；
- feature flag無法完整回退現行雙頁行為，或會形成半套UI／雙mutation path；
- 正式版次草稿仍無server identity但需求要求跨reload出現在統一清單。
- 需要恢復`development_phase`/DVT、修改023 migration、DEV-054文件或其已刪除頁面/API/測試；
- DEV-053與DEV-054位於同一共用hunk且無法安全分離，或必須整檔stage才可提交；
- 14組既有能力中任一項只能靠靜默隱藏、假按鈕或繞過authoritative route完成。

## 19. Phase 1A～1G Historical Evidence Required Before Product Done

Phase 1H current evidence以0.9.13為準；本節證據只可作回歸基線，不得替代Phase 1H terminal-cleanup與no-history驗證。

- focused unified read-model contract tests與source-failure tests；
- row identity、多圖bundle transition、de-dup、keyset pagination與permission API evidence；
- migration parity、既有row三欄NULL、zero-write baseline/diff evidence；
- contextual create、relationship-only append、atomic cross-boundary relation與controlled-file authority negative tests；
- Chromium 1440/1280/1024/390 screenshots、keyboard/focus、visible-error、console與network evidence；
- DEV-052、DEV-050、DEV-051 focused regression；
- AI real-operation manifest與cleanup結果；
- independent QC report；
- 既有功能清冊逐項UI可達證據、production-slice visible-disabled證據與DEV-054 protected-diff證據；
- lint、TypeScript與isolated production build（於實作階段）；
- production release另需target、backup/rollback、migration rehearsal、flag與post-deploy smoke evidence。

## 20. Release Feasibility Note

本設計可release，但目前未獲production授權。production rollout至少需要：

1. 確認DEV-052 V2已完成既有資料相容與獨立QC；
2. 備份並在non-production rehearsal執行PostgreSQL `022` migration，證明既有rows不變且新欄位可NULL；
3. 先部署flag-off版本並跑read-only smoke；
4. 逐步開啟`PDM_UNIFIED_DRAWING_WORKBENCH_V1`，監看list error、cursor conflict、formalization recovery與direct-master endpoint使用；
5. rollback時關flag，不刪欄、不回寫、不改號；若schema rollback不可避免，另開release/CAPA決策。

## 21. Historical Local Implementation Results and Current Phase 1H Reopening

- Phase 1A retained：三個nullable source-context欄位、PostgreSQL/Supabase mirror、SQLite compatibility、default-off flag、server-side unified read model、GET-only list/detail API與zero-write evidence仍有效。
- Phase 1B rejected：單一page shell、舊`?tab=reserved`正規化與responsive基礎可重用，但四欄簡版搭配最小formal drawer造成14組既有能力退化，不得視為完成。
- Phase 1C retained：建立／追加圖料號改走candidate workspace、relationship-only `append_part`、source-context驗證、跨邊界關係與正式化transaction仍有效；統一BFF未新增mutation proxy。
- Phase 1D invalidated for acceptance：歷史run `DEV053-20260804-090838-local-isolated`證明生命週期主線曾完成19/19，但沒有逐項驗證正式圖面能力清冊，因此QA PASS與後續QC入口均重新開啟。
- Phase 1E historical frozen snapshot：曾在不新增schema/migration、不碰DEV-054的前提下恢復正式row parity與完整formal drawer，並完成當時的AI真實操作與獨立QC；本次16項盤點證明該證據不足以代表目前固定3000的完整可操作性，因此不得沿用為現況PASS。
- Phase 1F historical local pass：1F-1～1F-4本機產品修復、aggregate與AI真實操作證據保留，但不可作為Phase 1H驗收。
- Phase 1G historical local pass：多料號批次進版與成本選填修正已通過targeted AI QC；production migration/release仍受阻擋。
- Phase 1H current：單一生命週期與審核權威收斂文件已到`RD Implementation Ready / Human Confirmed`；本機產品程式、additive schema/migration與QA實作進行中，獨立QC待RD freeze後執行。
- Production boundary：`PDM_UNIFIED_DRAWING_WORKBENCH_V1`仍預設off，migration只有artifact、production mutation allowlist未開放；既有reservation rows未backfill，productionConnected=false、productionWrites=false。
- Next maturity gate：完成`1H-1～1H-4`本機實作與AI QA後交獨立QC；exact files、additive retention schema/migration、FK cleanup order、worker/retry、error codes與QA/QC command mapping均以0.10為RD contract。commit與deploy/release仍為獨立邊界。

## 22. 2026-08-05 Existing-file Recovery Closure

- 根因：A0005的兩個受控檔已存在於candidate storage與`file_assets`，但`publication_evidence_id`為NULL；舊UI只允許在新選檔後執行上傳驗證，因此沒有可操作的下一步。
- UI契約：有未驗證既有檔時顯示`驗證既有檔案（n）`及「不用重新上傳／原檔與編號不會改變」；驗證完成後移除恢復CTA、顯示`主要受控檔已完成，可送審。`並啟用既有送審動作。新檔上傳仍是另一個次要操作，未選新檔時維持disabled。
- API契約：沿用`PATCH /api/numbering/draft-workspaces/{workspaceId}/candidate-revisions/{revisionId}/files`，payload為`fileId`與`expectedRowVersion`；不新增深層平行route。command為`pdm.numbering.verify_existing_candidate_revision_file`，具permission、tenant、optimistic concurrency、idempotency、transaction、audit與outbox邊界。
- Provider契約：development-only完整驗證可對本機repository做size/hash read-back並產生local validation evidence；production一律fail closed，不能因本機flag繞過正式storage authority。
- 固定3000事實：A0005兩個原file asset保持不變，candidate row version由4推進至6；建立兩筆evidence、兩筆audit與兩筆completed command receipt。實體`A0005.SLDPRT`與`A0005-M01.SLDDRW`的SHA-256分別與原asset及evidence一致，未建立approval request、未送審。
- 自動驗證：HTTP 14/14、UI 21/21；包含target-only成功、冪等重播、權限、production fail-closed與hash mismatch 409零寫入。隔離真實操作另先跑legacy existing-file recovery，再完成新檔上傳→送審→撤回→再送審→核准→正式化，cleanup=`removed`、productionConnected/productionWrites均false。
