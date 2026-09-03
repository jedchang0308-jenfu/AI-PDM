# QA-DEV-080：全系統第一層狀態可見性驗證計畫

狀態：`Historical Focused Gates Passed / DEV-115 Successor Disposition Ready / Current Residual QC Pending / Production Release Gated`
日期：2026-08-19；amended 2026-09-03
關聯：`DEV-080`、`SPEC-PDM-STATUS-UX-005`
風險：Medium

> **DEV-087 boundary**：三工作臺舊六狀態與第一層exception case只作activation前歷史回歸；新target依QA-087驗收。其他系統surface仍依本QA。不得以舊case要求DEV-087保留status projector、popover或filter compatibility。

## 1. 驗證目標

確認系統把「主要工作狀態、會改變判斷的例外、一般細節、重複資訊」穩定分層，同時不隱藏阻擋、資安、權限、資料衝突、錯誤與法規告知。

QA不以「badge變少」作PASS；只有使用者仍能在第一層判斷是否可用、是否有問題與下一步，且細節可由鍵盤與觸控取得，才可通過。

## 2. 風險假設

| ID | 風險 | 等級 | 必要證據 |
|---|---|---:|---|
| R-080-01 | 阻擋被誤歸為detail/hidden | P0 | 缺製造圖、發布失敗、安全／隱私待確認固定可見 |
| R-080-02 | 正常狀態仍形成badge wall | P1 | primary + exception容量與DOM計數 |
| R-080-03 | 只靠hover，鍵盤／手機不可達 | P1 | focus、Enter/Space、touch、Escape、focus return |
| R-080-04 | page-local map或raw status外洩 | P1 | source scan + unknown fixture |
| R-080-05 | 六狀態／mine／history/filter退化 | P1 | DEV-078／055／073 regression |
| R-080-06 | scope help缺頁、wrapper未繼承或語意錯軸 | P1 | 25 contexts、22 scopes與42-route disposition矩陣 |
| R-080-07 | public/audit/error state被錯誤降層 | P0 | public-readonly、audit、401/403/404/5xx rendered cases |
| R-080-08 | 多例外排序不穩或漏項 | P1 | severity matrix與聚合popover全量比對 |

## 3. Static inventory gate

QA run開始時重新產生inventory，不接受只引用2026-08-19文件數字：

- 42 page routes逐條對上SPEC §9.1 disposition；`19 status-bearing pages`只作census，不作coverage gate。
- current/target delta可追溯：23→25 display contexts、13 axes不變、20→22 scope definitions。
- 58 direct files存在性：30 source、27 test/QC scripts、`package.json`。
- 43 validation-only source全部有分類結果；若發現drift轉為direct-edit，inventory與原因必須同步更新。
- active scope必須包含`approvalInbox/accountList/invitationList/bomCreate/drawingRecognition`；wrapper依SPEC §5.1繼承；`numberingRequest/numberingDraftList`只能標記alias/retired。
- 掃描 page-local `statusText/statusLabel/labels[status]/raw status`與自訂`status-chip/status-pill`；每個命中須為shared policy consumer或有明確exception rationale。
- 掃描`title=`承載critical/blocking/actionable狀態；結果必須為0。

## 4. Projection matrix

至少覆蓋：

1. primary only：編輯中、審核中、待確認、研發版可使用、量產版可使用、terminal result。
2. normal duplicate：關聯完整、同步成功、preview ready、adapter complete → detail/hidden。
3. action exception：缺製造圖、缺料號、待補件、需重新確認 → exception。
4. blocking/error：資料衝突、主圖失效、發布失敗、同步失敗、recognition failed → exception。
5. security/legal：帳號停用、邀請到期、告知待確認、session/security action required → exception或該surface primary。
6. unknown/raw：未註冊值、null、互斥evidence → 待確認，不顯示raw。
7. duplicate exception：同一事實由primary與secondary同時提供 → secondary hidden。
8. multi-exception：2～5個不同嚴重度 → 第一層最高一項／聚合，detail保留全部且排序穩定。
9. recognition session：`queued/extracting/review_ready/extraction_partial/extraction_failed/ready_to_formalize/formalized/cancelled`全部由`recognitionStatus`投影。
10. recognition candidate：`proposed/conflict/accepted/corrected/mapped/ignored/deferred/blocked`全部由`recognitionReviewStatus`投影，detail狀態不得搶占item primary。

每個case驗證`level/severity/label/description/reason`，不得只snapshot label。

## 5. Module and route matrix

| 模組 | 主要入口 | 必測案例 |
|---|---|---|
| 圖料／圖號／料號 | `/numbering/search`、`/numbering/drawings`、`/parts` | 關聯完整降層、缺製造圖可見、發布異常、legacy/unified parity、list/drawer一致 |
| 審核／送審 | `/approvals`、`/approvals/[requestId]`、`/submissions/[id]`、`/upload` | pending、apply failed、history、raw target/status shielding、scope help |
| BOM | `/bom/new`、`/bom/workbench`、`/bom/workbench/[draftId]` | create-source raw shielding、Draft/Rejected/InReview/Released/Obsolete、Floating、reconfirmation、conflict |
| 技轉／交接 | `/transfer-packages/*`、`/technical-transfer`、`/handoff` | adapter blocker、stale、release failed、published complete降層 |
| 檔案／辨識 | attachment panel、`/numbering/drawings/[drawingId]/workspace`、`/numbering/recognition/[sessionId]`、`/numbering/revisions` | pending review、sync failed、preview failed/delayed、8個recognition session status、8個candidate review status、selection changed、required file missing、unknown raw shielding |
| 帳號／邀請／安全 | `/settings/accounts`、`/settings/account-invitations`、`/account/security` | active、suspended、offboarded、expired、privacy/security exception、scope help |
| Dashboard／task／report | `/`、`/numbering/tasks`、`/numbering/reports`、`/numbering/impact` | 比較軸保留、成功降層、failed/action required可見 |
| Public／error | `/share/[token]`及各頁401/403/404/5xx | 不依賴hover；必要說明inline；無raw code/stack |

## 6. Actor and actionability matrix

使用相同fixture依序以RD、RD主管、系統管理員、唯讀角色讀取：

- primary label、canonical description、visibility level與exception排序必須一致。
- `isMine/canAct/disabledReason/CTA`可不同，但不得新增第二個viewer-relative badge。
- exact reviewer、role queue、owner與system-admin recovery規則沿用既有authority。
- 無適用action時不得僅因permission顯示人工待辦。

## 7. Accessibility and interaction

對list、card、drawer header各驗證：

- Tab可聚焦；Enter／Space開啟；Escape關閉；焦點回trigger。
- click/touch可切換；outside click關閉；觸發器不啟動父row navigation。
- `aria-expanded`、`aria-controls`、可見文字與閱讀順序正確。
- 不能只靠tone/icon；Windows high contrast／reduced motion下仍可辨識。
- 390px popover在viewport內，互動目標不小於現行共用控制規範。

## 8. Viewport and visual gate

固定驗證：`1440×900`、`1024×768`、`390×844`。

每個viewport檢查：

- row/card只顯示一個primary與最多一個exception control。
- 無文字裁切、badge重疊、水平overflow、popover越界或遮住唯一CTA。
- detail內容可捲動且不產生雙scroll owner。
- screenshot只看第一層即可辨認工作階段與最高風險例外。

## 9. Failure and recovery matrix

- projector unknown：安全顯示待確認，console無exception。
- list/detail API 401/403/404/409/5xx：沿用inline recovery，不把HTTP狀態當badge。
- popover detail load失敗：保留第一層例外，顯示可重試／可理解訊息，不顯示上一筆內容。
- stale response：切換row後不得把舊entity的exception渲染到新row。
- aggregate mismatch：consumer與shared policy不同時fail closed，contract QC失敗，不以local override放行。

## 10. Commands and evidence

預定命令：

```powershell
npm.cmd run qc:dev-080:projection
npm.cmd run qc:dev-080:contract
npm.cmd run qc:dev-080:browser
npm.cmd run qc:dev-080
```

`qc:dev-080`至少聚合：DEV-080三支、status vocabulary/scope coverage/scope browser、DEV-078/055/062、approval、numbering approval UI、account lifecycle/invitations、master attachments、BOM workbench、transfer、DEV-053、DEV-068、`typecheck:app`與`build:isolated`；另必須明確執行`qc:dev-060-bom-create`、`qc:dev-071-contract`、`qc:dev-071-browser`、`qc:dev-079:contract`、`qc:pdm-numbering-task-center-ui`與`qc:ux-attribute-hierarchy`。

Evidence root：`output/qa/dev-080-status-visibility/<run-id>/`，至少包含：

- `inventory.json`
- `projection-matrix.json`
- `source-guard.json`
- `route-actor-viewport-matrix.json`
- `accessibility.json`
- `visible-console-network-errors.json`
- screenshots／DOM snapshots
- `run-manifest.json`與runtime cleanup證據

歷史run、report與screenshots不得覆寫。

## 11. PASS / FAIL gate

PASS必須同時滿足：

- QA-080-01～12（對應SPEC acceptance criteria）全部PASS。
- P0/P1 finding=0。
- critical/security/blocking hidden=0。
- raw status exposed=0。
- item badge wall=0。
- inaccessible critical explanation=0。
- unexpected visible/console/network error=0。
- 42 routes均有disposition；58 direct files可追溯；43 validation-only都有結果；新增consumer差異有manifest；runtime完成清理。

任一P0/P1、資料／權限／生命週期退化、critical hover-only、public頁依賴hover或scope錯軸即FAIL並回RD；不得調低severity、刪assertion或修改fixture掩蓋。

## 12. Independent QC handoff

獨立QC需重跑完整aggregate，抽查至少一個正常成功、一個人工阻擋、一個系統失敗、一個資安／法規例外與一個public-readonly案例。QC只能依rendered facts與evidence結案；RD self-check不可單獨替代。

## 13. 2026-08-19 QA scope re-audit closure

文件QA曾發現原盤點漏列BOM建立、lifecycle、recognition三個surface、task/public raw fallback與part baseline raw status，且23-context/20-scope不足以封口recognition語意。此計畫已以SPEC §5.1、§9.1、§10修正為25 contexts、22 scopes、42-route disposition、30 required source、27 required test/QC、43 validation-only source與58 direct files。

本段只表示readiness文件的P1已轉成可執行契約，不代表產品實作或QC已PASS。RD完成後仍須依本計畫產生新run evidence；不得引用本次靜態盤查作功能驗證。

## 14. 2026-08-19 execution evidence

本次已完成 DEV-080 presentation implementation 與 focused QA/QC。證據均寫入新的 run directory，未覆寫既有證據：

| Gate | 結果 | 證據 |
|---|---:|---|
| `qc:dev-080:projection` | PASS 15/15 | `npm.cmd run qc:dev-080:projection` |
| `qc:dev-080:contract` | PASS 26/26 | `npm.cmd run qc:dev-080:contract` |
| DEV-080 rendered browser matrix | PASS 240/240 | `output/qa/dev-080-status-visibility/20260819072228-1d1c809a/report.json` |
| DEV-071 browser regression | PASS 56/56 | `output/qa/dev-071-xmind-bom-editor/20260819072708/` |
| `typecheck:app` | PASS | `npm.cmd run typecheck:app` |
| `build:isolated` | PASS；124 pages | `npm.cmd run build:isolated` |

DEV-080 browser matrix實際覆蓋7條required route（`/numbering/drawings`、`/numbering/search`、`/approvals`、`/bom/new`、`/numbering/tasks`、`/settings/accounts`、`/settings/account-invitations`）與desktop/tablet/mobile三種尺寸；檢查了第一層primary／exception、legacy viewer-relative label shielding、scope help、popover keyboard/focus return、例外聚合、horizontal overflow、console與request errors。task-owned temporary runtime已停止，並確認4173 primary runtime仍存活。

## 15. Existing baseline regression findings

下列命令仍未通過，但失敗發生在既有fixture／已退役流程，沒有證據指向 DEV-080 presentation code：

| Command | Finding | 影響判定 |
|---|---|---|
| `qc:dev-060-bom-create` | copied local SQLite fixture的`submissions`與`items`為空，無法取得 required released child identity | DEV-060 fixture blocker；未修改來源DB |
| `qc:ux-attribute-hierarchy` | 舊QC仍POST `/api/submissions`，canonical flow已回傳HTTP 410 `GENERIC_SUBMISSION_RETIRED` | stale QC contract；非 DEV-080 UI finding |
| `qc:dev-068:browser` | 既有 recognition fixture建立時回HTTP 404 `RECOGNITION_CONTEXT_NOT_FOUND` | DEV-068 fixture blocker；尚未進入DEV-080斷言 |

因此 `qc:dev-080` fail-fast aggregate目前不能宣告全綠；本次結論為「DEV-080 focused gates通過、既有跨DEV baseline findings保留、production/release仍 gated」。不得把上述三項重命名為DEV-080缺陷，也不得刪除其assertion來取得綠燈。後續若要關閉完整aggregate，應由各既有DEV owner修復fixture或更新至canonical API，再重跑本計畫第10節命令。

## 16. 2026-09-03 DEV-115 successor-disposition amendment

RD技術主管複核確認，上一段「修復所有舊cross-DEV baseline後重跑原aggregate」不再是current closure authority。DEV-087已intentional-replace DEV-080舊status authority與projection chain，DEV-112承接現行workbench顯示模式；繼續要求`bomCreate`、舊Drawing status-help、DEV-055／078 status source或DEV-071 XMind DOM會把退役架構做回產品。

本節有意取代第10節原aggregate的current closure用途；第10～15節保留為歷史契約與當時證據。DEV-115必須對QA-080-01～12逐案建立machine-readable disposition：

- `current-runner`：仍存在的非workbench surface、critical exception、public/read-only、keyboard/touch與unknown fail-closed行為，使用現行route／component執行residual smoke。
- `successor-replaced`：精確連結DEV-087／112 current case與evidence，不要求整個successor aggregate或無關child runner全綠。
- `retired`：舊scope、route、generic submission與UI入口驗證不存在、410／fail-closed及zero-write。

Current `qc:dev-080`必須改為Node aggregate：建立task-owned data/repository fixture、明確傳遞隔離env、執行全部current child後再統一判定，不以shell `&&`首敗遮蔽結果；不得再讀`bom-create-workflow.tsx`、`part-detail-content.tsx`、`relation-workbench.tsx`等已退役檔案。DEV-060／068 fixture與UX hierarchy 410保留原owner finding，但不再作DEV-080 closure prerequisite。

Current PASS gate：12案disposition missing／duplicate=0；所有current residual case PASS；critical/security/blocking hidden=0、raw status=0、badge wall=0、accessibility與unexpected visible／console／network error均為0；primary invariant與cleanup完成。通過後DEV-080狀態改為`× 併入 DEV-087／112`，不重複計算successor完成率；若current case發現真實產品缺陷，回該產品owner修正，不得改expected掩蓋。
