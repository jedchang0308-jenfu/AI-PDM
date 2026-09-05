# SPEC-PDM-PRODUCTION-SMOKE-TENANT-001：Production Level 4 驗證租戶隔離與證據契約

Status: `Local RD Implemented / RD Tech Lead Approved after Corrections / Human Confirmed / 116-A-B-C Complete / Current QA-QC 31 of 31 PASS / R02 Receipt Contract 5 of 5 PASS / DEV-010 R1E Verifier, R1-01 Inventory and R1-04A／F Producer Sources Local Implemented and QC PASS / Production Execution and 116-R Activation Gated`

Date: 2026-09-05

Owner: Dev PM

Related DEV: `DEV-116 / DEV-PDM-PRODUCTION-SMOKE-TENANT-ISOLATION-001`

Related authority:

- `.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`
- `.ai-doc/decisions/ADR-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch-boundary.md`
- `.ai-doc/qa/qa-dev-116-production-smoke-tenant-isolation-validation-plan-2026-09-04.md`
- `DEV-032` production release closure、`DEV-040` production slice、`DEV-044` company/principal boundary、`DEV-069` cost boundary
- Platform [`DEV-010` neutral database topology contract](../../../Jenfu-Management-system/ai-doc/specs/DEV-010-three-system-database-consolidation-contract.md)與[`QA-010-R1`](../../../Jenfu-Management-system/ai-doc/qa/DEV-010-three-system-database-consolidation-validation-plan.md)

## 1. Outcome

未來例行 Production Level 4 必須同時證明：

1. exact production artifact 可以經正式 Auth、UI、API、domain、repository 寫入正式 Cloud SQL，真實 `COMMIT` 後 reload 仍可讀回。
2. 上述 committed data 只屬邏輯 `company-smoke`；`company-jenfu` 的受控業務資料、正式號碼、sequence、tenant audit、export、report、counter、dashboard 與通知投影在固定 invariant scope 內不變。全域 infrastructure log、Cloud billing meter與資料庫總容量會因合法 smoke activity 改變，不得被誤列為 Jenfu 污染。
3. cleanup 失敗不會破壞第 2 點。cleanup 只控制驗證租戶資料量，不是安全邊界。
4. 每次判定都由 machine-readable manifest 綁定 source、artifact、actor、company、object、readback 與 before/after fingerprint；單一文字說明、截圖或不透明檔案路徑不能單獨構成 PASS。

本文件已依branch `持續優化2`、source HEAD `80770f2db257374725414456efeb0f0d0302da0f`完成repository-specific assessment與116-A→B→C依序實作。116-A先通過company／audit／sequence與雙provider migration gate，才解鎖116-B；116-B通過query／API／idempotency／cross-surface gate後才解鎖116-C。Current固定31案最終為`31/31 PASS`、P0/P1 failure=0、primary SQLite before=after、task-owned runtime cleanup complete，claim僅為`local-foundation`。這不授權production migration、principal provisioning、write smoke、deploy或release；上述動作仍只屬116-R。

### 1.1 RD Tech Lead Review（2026-09-04）

結論為`有條件通過`。核心因果鏈已收斂為：release runner未把驗證actor綁定隔離company → resolver／repository仍存在JENFU fallback及漏company predicate → production commit成為Jenfu正式業務事件 → UI cleanup無法回復sequence／audit／其他已提交副作用。最小安全槓桿是「server-derived fail-closed company context + current delivery path的DB/query scope + candidate-bound evidence」，不是建立第二套production stack，也不是要求測試後刪資料。

本次技術主管修正：

1. 建立claim ladder：local 31/31只證明隔離foundation與runner可信度；只有116-R的實際production candidate authenticated commit＋reload可稱Production Level 4，canonical gate另證明promotion後入口。
2. Jenfu不變量改為可計算的business invariant scope，不宣稱Cloud log、billing meter或整體DB容量不變。
3. Audit DB只負責結構一致性`CHECK`；action→scope分類只有`src/lib/audit-scope.ts`一個authority，避免application與兩套DB trigger allowlist漂移。
4. Mutation hardening只收斂實際production-slice async create／reload delivery path；未進此路徑的sync／附件／submission等audit writers登錄為隔離中的相容技術債，不再為「一次把全系統audit改完」擴張本DEV。但production啟用前的zero-leak read gate仍要覆蓋所有已啟用且Jenfu使用者可觸及的list／search／report／export／counter／dashboard／task／notification投影；這是讀隔離關卡，不等於擴張write lifecycle。
5. 成本分成release前upper-bound gate與啟用後effectiveness review；尚未啟用前不再以「10 runs或30日」形成循環阻塞。

使用思考習慣：#問對問題、#最小化、#可驗證性

## 2. 已確認的現況與 P0 缺口

| 面向 | Repo 現況 | DEV-116 判定 |
|---|---|---|
| Company model | `companies`、`users.company_id`、`user_company_memberships`已存在 | 可沿用，但缺少穩定的production-smoke分類 |
| Company code | `PdmCompanyCode`只有`JENFU／MAXIMA`；其他code在部分mapping會落成`JENFU` | P0：`SMOKE`必須成為明確code；unknown不得回退JENFU |
| Empty membership | company resolver與user repository存在default/fallback `company-jenfu`路徑 | P0：production-like runtime不得由缺membership回退JENFU |
| Session binding | Firebase/platform session已帶PDM user/company資訊 | 必須增加smoke actor的claim、user、membership三方一致性 |
| Audit | `audit_logs`沒有`company_id`；numbering audit/export/trail以全域action查詢 | P0：單純新增company仍會跨租戶洩漏 |
| Sequence | `numbering_sequences`有`company_id`，但部分select/update只用`sequence_key` | P0：所有分配與更新必須同時限制company，且key格式不可碰撞 |
| Business data | root/part/drawing/draft/candidate多數已有`company_id`與company unique key | 需做完整write/read inventory，不能從「多數」推論「全部」 |
| Receipt/outbox | platform receipt/outbox已有company scope | 需驗證所有本期command實際使用同一company，且未啟用consumer維持disabled |
| File side effects | 目前production slice的GCS file writer維持fail-closed | Current Phase不得為smoke開啟；未來啟用時須re-entry |

## 3. Product Boundary

### 3.1 Current Phase In Scope

- 對「同一Production Cloud Run、Firebase Auth／Identity Platform、Cloud SQL與正式artifact中的邏輯`company-smoke`」建立可實作契約；Current實際執行只在task-owned local/disposable target，production execution仍屬116-R。
- 一個dedicated smoke principal，固定單一company membership與現行最小`Engineer`角色。
- 正式領號／草稿production slice的正常UI入口、API、domain、repository、transaction、commit與reload/readback。
- Company、identity/session、numbering sequence/reservation、business row、audit、export/report/count/dashboard、task/notification與receipt/outbox的隔離契約。
- Task-owned SQLite／disposable PostgreSQL migration、repository、API、browser、failure injection、mutant與evidence aggregate。
- Future production candidate所需的manifest schema、zero-leak gate與cost readback條件。

### 3.2 Out of Scope

- 新建第二個GCP project、Cloud SQL instance/database、Cloud Run service、Firebase project或Identity Platform tenant。
- 新增測試專用產品API、browser直連DB、request可指定任意company ID、或硬編碼`TEST-*`第二套編號規則。
- 正式 submission／approval／release、CAD、BOM、GCS file writer、outbox consumer、search index或外部notification activation。
- 刪除／回收 `company-jenfu` 或 `company-smoke` 已正式建立的root/part/drawing號碼、重置正式sequence或繞過append-only audit。
- 本輪產品碼、schema、資料、IAM、Firebase、Cloud、deploy、traffic、release、production smoke、merge或PR。

## 4. Architecture Memory Capsule

- Production environment與Jenfu business tenant是兩個不同維度；Level 4必須驗證前者，但例行測試不得寫入後者。
- `company-smoke`必須共用正式artifact、schema與database runtime，否則只能證明另一套環境。反之，本機task-owned資料庫即使行為相同也只證明foundation，不是Production Level 4。
- Smoke company committed E2E與Jenfu transaction-bound rollback是互補證據；rollback-only不能證明production HTTP flow真的commit並可reload。
- Tenant boundary由server-derived session／membership與DB/query predicate共同建立，不能依賴UI隱藏、名稱前綴或`detail_json.companyId`。
- Platform `DEV-010`若完成physical topology切換，本契約仍作用於AI-PDM owner schema；不得因shared database而把company隔離改成交叉app schema隔離。
- Cleanup failure必須是預期可承受狀態。安全性由隔離保證，不由刪除成功保證。

## 5. Logical Company and Identity Contract

### 5.1 Company Authority

Current contract固定一個邏輯驗證公司：

| Field | Contract value |
|---|---|
| `companies.id` | `company-smoke` |
| `companies.company_code` | `SMOKE` |
| `companies.display_name` | `Production 驗證租戶`；僅供顯示，不作授權predicate |
| `companies.company_kind` | `production_smoke` |

`companies.company_kind`為新的穩定分類，允許值至少為`business | production_smoke`；DDL固定`NOT NULL DEFAULT 'business'`，既有company forward migration為`business`，使未修改的既有company writer保持相容。Server-only release config必須指定expected smoke company ID，runtime readback同時核對ID、code與kind；任一不符即fail closed。

`PdmCompanyCode`與repository projection必須明確支援`SMOKE`。Unknown、空字串、未映射code或不存在company不得被正規化為`JENFU`。Local demo若需要default company，必須由fixture明確建立membership，不能沿用production fallback。

### 5.2 Smoke Principal

- 使用現有Firebase／platform identity contract，不建立第二套credential或session authority。
- PDM user的`users.company_id`固定`company-smoke`；`user_company_memberships`恰一筆、`is_default=1`、company亦為`company-smoke`。現行membership schema沒有active欄位，不得在契約中虛構「active membership」；啟停狀態由user／platform principal處理。
- Current Phase角色固定`Engineer`與既有production-slice最小permissions；不得同時持有Admin、R&D Manager、JENFU或MAXIMA membership。
- Session claim的`pdmUserId/companyId`、PDM user、唯一membership及platform principal/organization mapping必須全部一致；任一missing、ambiguous、suspended或mismatch回401/403且zero-write。
- Smoke identity的實際email、Firebase UID或外部subject只存在於release/IAM evidence或secret-controlled provisioning input，不寫入SPEC、source或公開manifest。
- Normal Jenfu／Maxima actor不得取得SMOKE membership。Smoke actor若透過query、header、body或deep link要求JENFU／MAXIMA，沿用`pdm_company_forbidden`或更嚴格403，且不得先執行duplicate-check audit或其他write。

### 5.3 Company Selection

- 正常production UI不顯示`Production 驗證租戶`切換選項；只有dedicated smoke actor可在session-derived default context進入。
- Smoke flow不得依賴client傳`company_id`。API可以保留現有company code輸入以相容一般多company流程，但最終authority只能來自已驗證membership與session context。
- Production-like runtime發現user沒有membership時回穩定`pdm_company_membership_required`，不得fallback至`company-jenfu`。

## 6. Data and Migration Contract

### 6.1 `audit_logs`

- 新增nullable `company_id`、`scope_kind TEXT NOT NULL DEFAULT 'legacy_unscoped'`與`companies(id)` foreign key。`scope_kind`固定為`tenant | global | legacy_unscoped`；existing rows先標`legacy_unscoped`，未修改的legacy writer繼續透過DB default寫入`legacy_unscoped + NULL`，Current production-slice的新tenant numbering事件則必須顯式寫入`tenant + company_id NOT NULL`。
- Backfill順序固定：先由合法`submission_id -> submissions.company_id`導出；再只對可驗證、已存在company且事件語意一致的legacy detail導出；唯一導出者同時設為`tenant + derived company_id`。不能唯一導出的row保留NULL與`legacy_unscoped`，不猜測JENFU。已知角色／權限／delegation／rule治理事件才依exact action allowlist標為`global`，不得用`action LIKE`籠統推定。
- Current numbering write path必須把server-derived `companyId`作為typed input寫入實體欄位。`detail_json.companyId`可保留為payload，但不得當filter、join、authorization或backfill後的主要authority。
- Tenant numbering audit/export/trail/recent-idempotency等read path必須使用`scope_kind='tenant' AND company_id=:companyId`；沒有company context不得回傳business audit。Global admin matrix維持單一全域政策，不複製成每company一套；其audit只讀exact `scope_kind='global'` allowlist，SMOKE Engineer無權進入。
- 建立`(company_id, scope_kind, action, created_at)`索引。SQLite與PostgreSQL只用同語意`CHECK`保證合法組合：`tenant`必須有company，`global／legacy_unscoped`必須沒有company；DB不得再複製action allowlist。`src/lib/audit-scope.ts`是唯一action→scope authority，Current production-slice writer必須顯式呼叫並fail closed。
- Append-only、既有submission audit可讀性與歷史timestamp/action/detail bytes維持；migration不得更新或刪除既有event內容。
- `TD-116-01`：未進Current production-slice的既有audit writer暫時仍產生`legacy_unscoped`，只允許相容寫入且一律排除於tenant business view。Contract runner必須輸出其writer/action inventory與數量；其owner route未來要進production allowlist時，先補typed scope與negative test，全部收斂後才移除legacy write compatibility。不得把這項技術債解讀為已完成全系統tenant audit migration。

### 6.2 `numbering_sequences`

- `company_id`保持必填；Current production-slice async path的所有SELECT／INSERT／UPDATE／lock都同時帶`company_id`與`sequence_key`。
- 新key固定以`<companyId>:`開頭；root、part、drawing與candidate scope不得共享未含company的key builder。
- 現有global `sequence_key` primary key保持唯一且已強於`(company_id, sequence_key)`；不得新增冗餘unique index。application仍必須同時驗證company-prefixed key與stored `company_id`，所有SELECT／UPDATE／lock也必須同時帶兩者。
- Migration先read-only inventory：stored company、key prefix、root/part/drawing max-used value、recovery reservation與next value必須可解釋。mismatch或legacy unprefixed active key不得自動修成JENFU；停止並產生repair plan，任何production apply另走release gate。
- Smoke與Jenfu可產生相同格式的可見號碼，但存在不同company scope；兩者的next value、candidate reservation與formal uniqueness互不影響。

### 6.3 Business and Read-model Scope

Current Phase的mutation scope只盤點正常`POST /api/numbering/records`建立root＋part＋drawing，以及該流程create-form prerequisites與reload實際命中的append/search/list/detail/read-model。任何命中write/read的table、view、function或async repository均須有company predicate、同company join與negative evidence：

- `part_roots`、`part_numbers`、`drawing_numbers`與current canonical Drawing／Part projection。
- 該create transaction直接使用的sequence、recovery reservation、relation、workbench-state與publication/non-reuse evidence；不因此納入完整candidate／approval lifecycle。
- Numbering search/list/detail、series options、duplicate checks、append policy與無檔案preview empty state。
- `audit_logs`與正常create/reload命中的current business projection。另外，因現行上位production-slice gate要求「任何Jenfu正常使用者投影都不得看到SMOKE」，已啟用的numbering export job／monthly audit report／task／notification／dashboard/count另作zero-leak read verification；除修正其company-scoped read predicate與current audit summary外，不新增這些功能的write lifecycle。
- `platform_command_receipts`與`platform_outbox_events`。Current Phase outbox consumer必須disabled；若仍產生outbox row，其aggregate/company/idempotency必須只屬SMOKE。

完整`numbering_draft_workspaces` candidate／review／publication流程、submission／approval／release、preview reset與attachment mutation不是本次Level 4 delivery path；只有source inventory證明normal create/reload實際依賴時才依「§11.2 controlled expansion」納入。

ID、code、foreign key與join任何一層都不得只靠globally unique UUID推定company。以另一company合法ID呼叫read/update時須回404/403且zero-write，不能洩漏存在性或partial projection。

### 6.4 Migration Safety

- SQLite authority與PostgreSQL migration source必須語意一致；只用新的forward migration，不修改已套用migration bytes。
- PostgreSQL forward migration固定為`db/postgres/063_production_smoke_tenant_isolation.sql`。`062_dev010_neutral_schema_boundary.sql`已存在於current repo，因此不得占用歷史gap或改寫`001..062`；`063`必須先分類「objects完整位於`public`」或「objects完整位於`ai_pdm_core`」兩種lane，恰好一種成立才以quoted dynamic SQL原位alter。兩者並存、不完整或皆不存在立即abort；本DEV不得移動object或改變physical topology。
- Fresh authority同步修改`db/schema.sql`與`db/postgres/001_initial_schema.sql`；existing SQLite以`dev-116-production-smoke-tenant-v1`寫入`pdm_local_data_migrations`。SQLite backfill在單一`BEGIN IMMEDIATE`內暫移append-only update trigger、只更新新增scope欄位、重建trigger並做row-count／immutable-column hash／`PRAGMA foreign_key_check`；任一步失敗整筆rollback。
- Primary read-only盤點在本契約凍結時已確認sequence共111筆、`company_id`／key-prefix mismatch為0；audit共845筆，其中`numbering.*`589筆，只有2筆numbering event可由明確detail唯一導出company，587筆不可可靠歸屬。這是planning evidence，不是migration PASS；因此legacy numbering audit允許NULL且不得為了追求全數NOT NULL猜成JENFU。
- Fresh schema、existing-history、mixed legacy audit、rerun/idempotence、transaction abort與restore rehearsal都必須使用task-owned資料。
- Production migration、company/principal provisioning、legacy repair或IAM change不屬本文件執行邊界。

## 7. API and Behavior Contract

- 不新增test-only product route。Level 4只使用已核准的normal entry與production-slice API。
- 所有numbering request在permission/domain mutation前完成auth、session、membership與effective-company解析；denial path不得寫audit、receipt、sequence或rate-limit以外的business side effect。若安全rate-limit必須寫入，也只能寫request actor的原company scope。
- Current allowlisted write仍依production slice matrix；DEV-116不開啟submission、approval、release、CAD、BOM或file route。
- Create／append／draft／duplicate-check／export等service輸入必須是server-derived company context，不接受repository caller省略company後套default。
- Read API與HTML response維持private/no-store；SMOKE資料不得出現在Jenfu的normal response、count、pagination total、cursor、suggestion或empty-state判斷中。
- 跨companyID或code的拒絕使用既有404/403語意；新增`pdm_company_membership_required`只用於沒有有效membership的fail-closed情況。對外不揭露合法company清單、Cloud SQL資訊、Firebase subject或credential。

## 8. Normal UI Entry and Level 4 Delivery Path

Target actor為dedicated smoke `Engineer`。正常入口與驗證路徑：

```text
Production login
  -> 正常AI-PDM入口
  -> 圖料／圖號／料號工作臺
  -> 既有「建立編號」入口
  -> 正常表單建立root + part + drawing
  -> API/domain/repository/Cloud SQL COMMIT
  -> browser reload
  -> 正常search/list/detail讀回同一IDs與內容
```

UI Entry Contract：

- 不提供「測試模式」按鈕、隱藏route或直接URL捷徑；runner必須由正常navigation找到入口。
- 頁面需可辨識目前是`Production 驗證租戶`，但標記不取代server/DB隔離。唯一UI delta為既有sidebar登入身分區的smoke-only badge：來源只能是`/api/auth/me`回傳的server-derived `default_company.companyKind=production_smoke`；一般business actor不顯示，collapsed與390px仍保留可讀／讀屏名稱，且badge不可點擊、不可切換company。
- loading、success、response-loss retry、duplicate submit、permission denial與unexpected error使用既有產品狀態；不得只看HTTP 201而略過reload UI readback。
- 最終browser evidence至少覆蓋desktop與390px窄版的正常entry、create、reload、search/detail、console/network與visible error sweep。視覺驗證支持入口與readback；DB/API evidence另支持commit與隔離。

## 9. Transaction, Idempotency and Cleanup

- 每個normal mutation沿用既有transaction與company-scoped idempotency receipt；same actor/company/command/key重試只能回同一結果，跨company相同key不得collision。
- 任何root/part/drawing bundle或draft promotion的partial failure必須整筆rollback，sequence/reservation/audit/receipt不可半套commit。
- Jenfu supporting probe不是browser E2E。它只能由reviewed runner使用相同repository/service與production runtime DB role，在outer transaction內執行並強制rollback；執行前必須證明本路徑沒有transaction外Storage、notification或consumer side effect。無法證明時取消此probe，不得冒險執行。
- Jenfu rollback前後fingerprint必須相同；rollback PASS只能支持role/schema/constraint/transaction層，不可取代SMOKE的HTTP commit＋reload Level 4。
- 已commit的smoke正式號碼不刪除、不回收。Cleanup只可移除task-owned瀏覽器／暫存檔、依法回收尚未跨controlled boundary的provisional reservation，或依未來獨立maintenance政策整理smoke tenant；cleanup failure不改變release判定所需的Jenfu zero-leak結果。

## 10. Machine-readable Evidence Contract

Aggregate manifest至少包含：

```json
{
  "schemaVersion": 1,
  "claimLevel": "local-foundation | production-candidate-level4 | canonical-post-promote",
  "runId": "...",
  "candidate": {
    "sourceRevision": "...",
    "dirtyBoundaryHash": "...",
    "imageDigest": "sha256:...",
    "cloudRunRevision": "..."
  },
  "target": {
    "environment": "production-candidate",
    "projectId": "...",
    "service": "...",
    "databaseIdentityHash": "..."
  },
  "actor": {
    "pdmUserIdHash": "...",
    "role": "Engineer",
    "companyId": "company-smoke",
    "companyCode": "SMOKE",
    "companyKind": "production_smoke"
  },
  "flow": {
    "entryRoute": "...",
    "idempotencyKeys": ["..."],
    "committedObjectIds": ["..."],
    "committedCodes": ["..."]
  },
  "readback": {
    "api": "PASS",
    "browserReload": "PASS",
    "databaseCommit": "PASS"
  },
  "jenfuInvariant": {
    "beforeHash": "...",
    "afterHash": "...",
    "zeroLeakChecks": [],
    "passed": true
  },
  "sideEffects": {
    "gcsWriter": "disabled",
    "outboxConsumer": "disabled",
    "externalNotification": "disabled"
  },
  "cleanup": {
    "runtime": "complete",
    "smokeBusinessRows": "retained_controlled"
  },
  "result": "PASS"
}
```

- Manifest不得包含cookie、token、password、email、Firebase UID、connection string或未hash的外部subject。
- `result=PASS`只有該claim level的固定case全部PASS、source/candidate一致、required artifact存在、Jenfu business invariant before=after且zero-leak為0時成立。`local-foundation`即使31/31也不得輸出或暗示`production-candidate-level4`。
- Opaque URL/path、人工勾選、不同revision evidence、只驗API未reload、或只驗rollback未commit都必須FAIL或`insufficient_evidence`。
- Mutant至少涵蓋：移除company predicate、unknown company回退JENFU、smoke actor增加JENFU membership、sequence只按key更新、audit只從JSON過濾、manifest缺source/candidate/actor/company/fingerprint任一欄位。

### 10.1 Platform `QA-010-R1-07` co-gate

`QA-116-R02`同時只滿足Platform `QA-010-R1-07`的AI-PDM子流程；Portal本身與OrgMaster正常流程仍由Platform各自驗證。兩邊aggregate必須引用同一份receipt及其SHA-256，receipt除上方manifest外還必填：

- `releaseId`與三repo `sourceLockSha256`。
- candidate image digest、Cloud Run revision與neutral database identity。
- hash後smoke actor，以及`company-smoke / SMOKE / production_smoke`三方readback。
- committed object IDs／codes、reload readback hash、Jenfu business invariant before／after hash、zero-leak count與三個side-effect flags。
- `platformCaseId=QA-010-R1-07`、`pdmCaseId=QA-116-R02`與receipt自身SHA-256。

兩案必須同release、同source lock、同candidate、同target、同actor與同一次execution；receipt缺件、重用、identity drift、Jenfu before≠after、zero-leak非0或任一side-effect非disabled時，R02與R1-07的AI-PDM子結果同時FAIL。Local 31/31、rollback-only、API-only、事後刪除或另一revision的canonical smoke均不可補正。

2026-09-04 local receipt gate已實作：`scripts/lib/dev116-r02-receipt.mjs`固定schema `jenfu.dev116.r02.production-candidate-receipt.v1`，同時驗`platformCaseId=QA-010-R1-07`與`pdmCaseId=QA-116-R02`，並輸出Platform可驗章的exact projection；`scripts/dev116-r02-receipt.mjs`只把位於`output/production-release/`的已觀測JSON轉成hash-bound receipt，明確拒絕`--execute／--deploy／--migrate／--promote`。Unit `5／5 PASS`涵蓋Jenfu actor、Jenfu invariant漂移、API-only、nonzero traffic、side-effect enabled、receipt tamper、敏感資料與mutation flag負例。

2026-09-05 authenticated browser executor foundation亦已實作：`scripts/run-dev116-r02-authenticated-browser.mjs`只接受hash-valid且`READY_FOR_R1_REHEARSAL`的DEV-010 preflight、同source lock／AI-PDM HEAD的candidate context、0% traffic、neutral `jenfu-platform-prod / jenfu-platform-prod-pg / jenfu_prod`、SMOKE-only Engineer與三個disabled side effects；另需exact candidate-write acknowledgement。登入identifier／password只可由`PDM_DEV116_R02_LOGIN_IDENTIFIER`與`PDM_DEV116_R02_LOGIN_PASSWORD`取得，command line、observation與stdout均不得保存。Runner從`/numbering/drawings`正常登入後點擊「建立編號」，只建立一個root＋part＋drawing bundle，驗POST response、結果頁、reload與search；它只輸出`browser-observation.v1`，不自行查DB或宣稱Level 4。Platform `dev010-r1-r07-provider-observation` producer再把同次provider-native readback驗成`provider-observation.v1`，固定exact IDs／codes、database commit、neutral DB identity、Jenfu before=after、zero-leak=0、side effects及browser後30分鐘觀測窗；它動態使用本repo schema authority，沒有query／gcloud／psql能力。`scripts/dev116-r02-finalize.mjs`只有在兩份self-hashed observation一致時才產生R02 receipt。Browser contract unit=`7／7 PASS`、Platform provider producer=`5／5 PASS`、receipt unit=`5／5 PASS`、production pipeline static QC=`25／25 PASS`；actual candidate與provider-native execution仍`NOT_RUN`，沒有production write。

Candidate登入使用既有fixed `candidate` traffic-tag URL作release-only origin exception：Identity Platform只授權該exact domain，server origin verifier只接受HTTPS、exact service與fixed／workflow-bound candidate tag；untagged direct `run.app`仍拒絕session exchange，canonical使用者入口仍是`jenfu-ai-pdm-prod.web.app`。既有`run-production-release-smoke.mjs`只證明shell／auth mode／origin boundary／production slice與未開放route，不能因candidate origin可登入就升格為R02。新authenticated executor雖已能從正常登入表單走UI COMMIT＋reload，仍必須取得同一次execution的provider-native DB identity、Jenfu invariant與zero-leak observation才能finalize；單獨browser PASS只可標`BROWSER_PASS_PROVIDER_OBSERVATION_REQUIRED`。

DEV-010 selected ZONAL target與本repo legacy production不得混為同一資源。`jenfu-ai-pdm-prod / ai-pdm-prod-postgres / db-f1-micro`及其USD 300 budget是DEV-032 legacy operating truth；Platform的`db-custom-1-3840 / ZONAL_DEDICATED / USD 100`才是neutral三系統future target authority。DEV-116不得先修改legacy tier／budget來冒充DEV-010完成，也不得讓兩套固定成本無限並存；transition overlap與incremental cost由Platform `QA-010-R1-02`驗章，neutral cutover與observation完成後才可退休legacy。

## 11. Current Phase RD Handoff Contract

### Purpose and Outputs

交付一個可在task-owned環境證明的tenant isolation foundation，以及能阻止錯誤Production Level 4證據進入release gate的aggregate verifier。

### Dependencies

- Existing production-slice route/API allowlist與number-state transaction authority。
- Firebase/platform session、user/company membership與DEV-044 platform mapping。
- SQLite＋PostgreSQL provider parity與Platform `DEV-010` schema placement規則。
- DEV-032型release gate的exact artifact、candidate、rollback與promotion boundary。

### Entry Conditions

- 本文件的repository assessment、exact boundary與31-case registry已完成；RD可由116-A開始，不需再補產品決策。
- RD開始前執行§11.1 source／dirty preflight；任一planned product path已有未辨識變更，立即停止回Dev PM，不得覆寫。
- Current implementation只能建立task-owned fixture、runner與本機forward migration；任何remote target、production credential、principal provisioning、workflow/release檔案或正式資料修復都不在本授權內。

### Execution Boundary

| Phase | Document status | Scope | Entry | Exit / Evidence |
|---|---|---|---|---|
| `116-A Company authority` | `Complete / QA-116-001..012 PASS` | company kind/code、membership/session、current-path audit scope與sequence migration | §11.1 preflight PASS | SQLite／disposable PG public與`ai_pdm_core` parity、history／fault／rerun PASS |
| `116-B Query/API isolation` | `Complete / QA-116-013..022 PASS` | Current production-slice async write/read models、API deny、idempotency與cross-company mutants | 116-A PASS | normal navigation、Jenfu zero-leak、export／audit／count與same-key isolation PASS |
| `116-C Level 4 evidence foundation` | `Complete / QA-116-023..031 PASS` | normal browser delivery path、failure injection、manifest與aggregate | 116-A/B PASS、local source fingerprint frozen | UI commit＋reload、response loss、rollback、cleanup failure、6 mutants、cleanup與aggregate PASS；claim仍只為local-foundation |
| `116-R Production activation` | `Future Phase / Release Gate Required` | Production principal/company provisioning、candidate authenticated Level 4、cost/readback與GO | 116-A～C完成、release型指令、exact target/candidate | QA-116-R01～R04與獨立release gate PASS |

### Estimated Backlog Range

技術主管瘦身後，116-A～C規劃量為`12～17 person-days`：schema／雙provider history migration 3～5、identity/context 2～3、current async audit／sequence／read model 2～3、API isolation／fault 2～3、browser／registry／aggregate／mutants 3。這是排程範圍，不是完成承諾；116-R、全系統audit收斂與任何production操作不含在內。

### 11.1 Source and Dirty-worktree Preflight

- Frozen planning source：branch=`持續優化2`；HEAD=`80770f2db257374725414456efeb0f0d0302da0f`。
- 本次開發沿用既有dirty worktree；使用者既有`next-env.d.ts`維持no-touch內容，SHA-256=`0F70629890B72A0A82E91972CC032C04B658B26C265373CB711CF576BFBF8FCC`。隔離Next runtime會自動重寫該generated entry，因此browser runner在啟動前做byte snapshot、停止task-owned process後原樣復原，並由aggregate驗證`nextEnvRestored=true`；不得把runtime產生的dist path納入交付。
- RD開始時先保存`git status --short`與planned paths的worktree SHA-256。所有Modify path必須與accepted planning baseline一致或由同一DEV的前一slice明確交接；陌生overlap立即停止。禁止`git reset --hard`、`git checkout --`或清理共享dirty worktree。
- Primary `data/ai-pdm.sqlite`只可在runner前後做read-only invariant；不得作fixture、seed、migration rehearsal或cleanup target。

### 11.2 Planned Current-phase Direct-touch Boundary

以下是依現行source得到的最小planned boundary，不是用檔名假裝完整性的白名單。RD若發現Current delivery path必須修改未列檔案，須先留下import/callsite證據、更新本表與QA inventory，再進行窄幅修改；若新增面向超出normal production-slice、改變產品語意或使估工超過上限，停止回Dev PM。任意擴張與為符合表格而漏改都不允許。

`Add (14)`（implementation inventory；相較planning增加runtime side-effect guard、A/B/C分段runner與唯一orchestrator，均仍在同一Current scope）：

| Path | Single responsibility |
|---|---|
| `src/lib/audit-scope.ts` | audit scope enum、global action exact allowlist、tenant/global write guard |
| `src/lib/production-smoke-runtime.ts` | smoke identity與GCS writer／outbox consumer／external notification exact disabled readback；不符合即mutation前fail closed |
| `db/postgres/063_production_smoke_tenant_isolation.sql` | location-aware public／ai_pdm_core forward migration與DB structural checks |
| `config/production-smoke-tenant.json` | stable company identity、principal policy、disabled side-effect與retention expectations；不得含credential |
| `scripts/check-shared-database-boundary.mjs` | primary SQLite與task-owned mutation boundary的read-only preflight |
| `scripts/dev-116-evidence-utils.mjs` | source fingerprint、case result、producer manifest與run-root authority共用函式 |
| `scripts/qc-dev-116-contract.mjs` | QA-116-001..003 static/typed/query inventory與mutant contract |
| `scripts/qc-dev-116-migration.mjs` | QA-116-004..007 SQLite＋self-owned PostgreSQL fresh/history/fault/rerun |
| `scripts/qc-dev-116-isolation.mjs` | QA-116-008..012 company/session/membership/mapping negatives |
| `scripts/qc-dev-116-isolation-b.mjs` | QA-116-014..022 disposable PostgreSQL create/read/cross-surface/idempotency isolation |
| `scripts/qc-dev-116-isolation-c.mjs` | QA-116-026..030 PostgreSQL fault/rollback/cleanup/side-effect/mutant evidence |
| `scripts/qc-dev-116-browser.mjs` | QA-116-013、023..025 task-owned normal-entry Chromium |
| `scripts/qc-dev-116-aggregate.mjs` | fixed registry coverage、source/candidate consistency、primary invariant、cleanup與final result |
| `scripts/qc-dev-116.mjs` | 唯一run-id與primary before/after owner；依entry gate順序執行所有producer，即使失敗也進aggregate |

`Modify (14)`：

| Path | Required delta |
|---|---|
| `package.json` | 新增A/B/C可獨立執行的producer commands、aggregate與唯一`qc:dev-116`orchestrator |
| `db/schema.sql` | fresh SQLite company kind、audit scope/company/index/structural checks |
| `db/postgres/001_initial_schema.sql` | fresh PostgreSQL同語意authority |
| `db/postgres/README.md` | 063 order、雙layout分類與production apply仍gated |
| `src/lib/company-context.ts` | typed `SMOKE`／company kind、absent-valid-invalid request union、zero-membership fail closed |
| `src/lib/numbering-company-context.ts` | body/query/header precedence保留raw invalid狀態並共用唯一resolver |
| `src/lib/repositories/user-async-repository.ts` | production async company projection不再unknown→JENFU，並投影`company_kind`與SMOKE |
| `src/lib/platform-command-context.ts` | auth→membership→effective company→actor metadata不可變binding；domain前拒絕mismatch |
| `src/components/sidebar-nav.tsx` | 從auth user投影smoke-only company badge；不建立tenant selector或client authority |
| `src/app/globals.css` | sidebar smoke badge的desktop/collapsed/390px可見與非色彩唯一樣式 |
| `src/lib/db.ts` | SQLite existing-history forward migration、company kind與audit structural constraint；既有generic writer保留legacy compatibility |
| `src/lib/numbering-sequence-utils.ts` | canonical company-prefixed key builder與stored-scope assertion |
| `src/lib/repositories/numbering-async-repository.ts` | Current async create／append、sequence、audit與read model移除default company／JSON authority；global governance audit明確分類 |
| `src/lib/numbering-async.ts` | Current production facade以required company型別與runtime assertion綁定command／repository company；不全面破壞legacy shared input type |

`Delete (0)`。現有route若已把server-resolved `companyId`傳入service，只作verification，不為了本DEV機械改寫。Global role／permission／rule資料表與`/api/numbering/admin/matrix`維持全域治理，不複製tenant schema。

### 11.3 Explicit No-touch and Release Re-entry

Current Phase禁止修改`.github/workflows/deploy-production.yml`、`scripts/run-production-release-smoke.mjs`、`scripts/qc-production-deployment-pipeline.mjs`、`scripts/dev-046-cloudsql-migration-package.mjs`、`scripts/start-localhost-3000.ps1`、`next-env.d.ts`、production target/IAM/Firebase設定及`data/ai-pdm.sqlite`。`src/lib/repositories/numbering-repository.ts`、`src/lib/repositories/user-repository.ts`、generic audit facade/writers、preview／attachment／submission audit亦屬本期no-touch compatibility boundary；contract inventory可讀取但不得為擴大全系統scope而修改。前三項release檔目前只接受opaque evidence reference／basic unauthenticated smoke，確為116-R gap；現在修改會混入merge、deploy、rollback與production smoke artifact，違反Implementation Ready邊界。

116-R重返時才以exact candidate修改release workflow/runner/verifier，並同時解決production migration package從歷史最高056銜接062／063的manifest count、checksum與restore。Current 116-A～C不得產生可直接執行的production command或secret input。

### 11.4 Typed Interface Freeze

```ts
type PdmCompanyCode = "JENFU" | "MAXIMA" | "SMOKE";
type PdmCompanyKind = "business" | "production_smoke";
type PdmCompanyRequest =
  | { state: "absent" }
  | { state: "valid"; code: PdmCompanyCode }
  | { state: "invalid" };
type AuditScopeKind = "tenant" | "global" | "legacy_unscoped";
type TenantAuditInput = {
  scopeKind: "tenant";
  companyId: string;
  actorId?: string | null;
  submissionId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
};
type GlobalAuditInput = {
  scopeKind: "global";
  companyId: null;
  actorId?: string | null;
  action: GlobalAuditAction;
  detail?: Record<string, unknown>;
};
type CurrentScopedAuditInput = TenantAuditInput | GlobalAuditInput;
```

- `invalid`不可降格成`absent`；invalid回400 `pdm_company_code_invalid`，未有membership回403 `pdm_company_membership_required`，有membership但要求其他company回403 `pdm_company_forbidden`。回應不得列合法company。
- `serializeAuthUserAsync.default_company`在零membership時為`null`；不得使用`defaultPdmCompany`補值。Smoke actor exactly one membership；一般business multi-company使用者仍可依既有default／explicit valid membership選擇。
- Current production-slice async HTTP/facade的company-sensitive inputs以required intersection type加runtime assertion保證；既有shared input與sync compatibility API可暫時保留optional欄位，但contract runner必須證明production import graph不會走其Jenfu default。不得為型別美化一次改壞所有legacy caller。
- Platform command的`actor.organizationId`、repository input、receipt/outbox `company_id`必須exact一致；不一致在claim receipt之前拒絕。

### 11.5 Query and Callsite Freeze

| Data class | Write authority | Required read/lock predicate | Negative oracle |
|---|---|---|---|
| Company/session | resolver＋user membership repositories | user＋唯一membership＋company id/code/kind | unknown／empty／mismatch zero-write |
| Sequence | Current async numbering repository | `company_id=:companyId AND sequence_key=:canonicalKey`; PG lock同predicate | cross-company same local key互不更新 |
| Root/part/drawing/draft/candidate | numbering repositories | 每個root ID/code、child join、list/search/detail皆有company | foreign-company UUID 403/404且不洩漏存在性 |
| Tenant audit | `audit-scope.ts`＋Current async numbering writer | `scope_kind='tenant' AND company_id=:companyId` | legacy/global/SMOKE不進Jenfu business audit；Current action漏scope即FAIL |
| Global governance audit | `audit-scope.ts` exact current admin action allowlist | `scope_kind='global' AND company_id IS NULL`＋Admin guard | smoke Engineer不可讀寫admin matrix；未納管action維持legacy隔離債 |
| Export/report/task/notification | numbering repositories | job/report/entity/company一致，pagination total也scoped | artifact、count、cursor無foreign-company token |
| Receipt/outbox | existing platform command service | command actor org＝repository company＝row company | same key跨company各exactly once |

`selectV3ReservedRootCodes`只讀同company master與tenant audit；legacy unscoped event為保守歷史non-reuse evidence時，不得直接分配到任一tenant，也不得出現在tenant UI/audit。若不能建立不誤占business sequence的deterministic rule，migration／allocation case必須BLOCKED回Dev PM，不可猜測。

### 11.6 Runner and Evidence Commands

Implementation新增以下package scripts；`<run-id>`由orchestrator產生並傳給各lane，單跑lane時必填：

```text
npm.cmd run qc:dev-116:contract -- --run-id <run-id>
npm.cmd run qc:dev-116:migration -- --run-id <run-id>
npm.cmd run qc:dev-116:isolation -- --run-id <run-id>
npm.cmd run qc:dev-116:browser -- --run-id <run-id>
npm.cmd run qc:dev-116:aggregate -- --run-id <run-id>
npm.cmd run qc:dev-116
```

- `qc:dev-116`依序建立run root、執行contract→migration→isolation→browser→aggregate；任一producer FAIL/BLOCKED仍必須執行final cleanup與寫出fail-closed manifest，不能把未產生case省略。
- PostgreSQL lane沿用repo現有self-owned `pg_ctl`模式，在dynamic non-default loopback port建立task-owned cluster/database；找不到本機PostgreSQL binaries時標對應case `BLOCKED`，不得連shared／staging／production DB補證據。
- Browser lane使用task-owned `PDM_DATA_DIR=tmp/dev-116/<run-id>/data`、`PDM_REPOSITORY_DIR=tmp/dev-116/<run-id>/repository`、獨立`PDM_NEXT_DIST_DIR`與dynamic port；既有`npm.cmd run dev:local`仍是人類固定入口，不得被QA runner重啟或清除。Runner開始前輸出project、purpose、port、process tree、mutation scope、cleanup condition，結束只停自己PID tree並證明port released。
- Evidence固定在`output/qa/dev-116-production-smoke-tenant/<run-id>/`；case registry authority為`.ai-doc/qa/dev-116-current-case-registry.json`，aggregate只接受31個唯一current IDs，不接受R01～R04。

### 11.7 Slice-level Stop and Handoff

- 116-A未同時通過fresh/history/rerun/fault的SQLite＋PostgreSQL與identity negatives，116-B維持`Not Yet Eligible`。
- 116-B任一static inventory有unknown write/read surface、optional company runtime path或foreign-company partial projection，116-C不得開始。
- 116-C必須以normal navigation進入；direct URL可做negative test但不能是成功主路徑。Chromium需desktop 1440×900與mobile 390×844、console/page error/network failure/overflow/focus evidence。
- RD交付後仍只可標`Local RD Implemented / QA Pending`；31/31、P0/P1=0、primary before=after與cleanup complete後，才可交QA/QC判斷local foundation完成。Production Level 4只能由116-R candidate case判定，canonical入口由post-promote case判定；成本長期有效性另由啟用後觀察判定。

## 12. Acceptance and QA Authority

Current fixed denominator為`QA-116-001..031`，定義於`.ai-doc/qa/qa-dev-116-production-smoke-tenant-isolation-validation-plan-2026-09-04.md`。本地foundation完成需31/31、P0/P1=0、primary資料不變、task-owned runtime/port/temp cleanup完成。

Future production write smoke另需`QA-116-R01..R04`與release gate；31/31 local PASS不能宣稱production activation、production Level 4或cloud cost effective。

## 13. Stop Conditions and Failure Recovery

立即停止並回Dev PM／RD的條件：

- Unknown/empty company仍可落入JENFU、smoke actor可取得business membership，或session/user/membership無法唯一一致。
- 任一current write/read model缺company predicate，或audit/sequence只能靠JSON、UI filter、code prefix或globally unique ID隔離。
- Legacy audit／sequence無法唯一分類，migration需要猜測、修改已套用migration或直接修production資料。
- SQLite／PostgreSQL語意不一致、transaction abort留下partial row、same-key跨company collision、cleanup failure造成Jenfu可見資料。
- 正常UI入口不可達、runner以direct URL／seed完成預期結果、reload讀不到committed object或evidence來源與candidate不一致。
- 方案要求新增固定付費資源、第二套identity/DB authority、production credential、remote schema/data/IAM mutation或production smoke。

Failure recovery：Current Phase只回復task-owned migration/database/runtime與未提交patch；不reset共享worktree、不刪primary data。Schema/data修正一律forward-only。任何production rollback／restore細節留到release lane。

## 14. Release Feasibility and Cost Guard

- `config/platform/cost-budget.template.json`中的`USD 30／月`是DEV-010之前的歷史app規劃基線，不是neutral三系統shared database的current成本權威。Current shared topology以Platform DEV-010的`USD 65～80／月`正常估計與`USD 100` alerts-only budget為準；本節只計算company-smoke的增量。
- `company-smoke`本身不新增固定SKU；低頻release smoke的DB row、backup、Cloud Run request、log與Auth增量暫估`USD 0～1／月`，是planning estimate，不是承諾。
- 116-R每個candidate最多建立一個root＋一個part＋一個drawing bundle，另只允許同logical command的idempotent replay；不加入檔案、額外backup job、常駐instance或高頻排程。若驗證目的需要第二個bundle，必須在run manifest記錄原因，不得以迴圈壓測冒充Level 4。
- Release前R04只做可先驗證的cost gate：以當次有效SKU／帳務設定計算單run upper bound、新fixed floor必須為0，且manifest證明bundle/request/log上限。無法取得價格、需要新固定資源或upper bound超出核准預算即NO-GO。
- `OBS-116-01`為啟用後effectiveness review：以10次完整run或30日先到者，讀回Cloud SQL storage/backup、Cloud Run request/CPU/memory、logging ingestion/retention與Firebase Auth差額，並以啟用前相同長度baseline正規化。月增量超過`USD 1`目標、出現未核准fixed floor或無法依SKU解釋差額時，暫停後續例行write smoke並回成本gate；它不是首次啟用前不可能完成的循環前置條件，也不得靠cleanup刪row取得PASS。
- 2026-09-04 release re-entry已新增`config/production-smoke-cost-policy.json`與`production:smoke-cost-gate`。當日Google Cloud官方價格snapshot、不扣free tier的gross upper bound為`USD 0.020812/run`、10 runs=`USD 0.208120/month`，fixed SKU=0；價格超過30日、任一unit price缺失或界線超標即NO-GO。這是R04 release前policy evidence，不是啟用後帳單效果證明。
- DEV-010的`TD-010-ZONAL-01`是三系統shared database的availability技術債，不是`company-smoke`成本，也不改變本SPEC的tenant隔離或Level 4分母。若DEV-010因restore超出核准RTO／RPO、zone-attributable P0／P1 outage或Business Owner要求automatic failover而改為REGIONAL，target identity即改變；舊R01／R02／R04 evidence全部失效，須以新candidate／target／成本重新驗章，不得沿用ZONAL receipt。

## 15. Deferred Scope Audit

`GCS file writer、outbox consumer、cache、search index、external notification與跨系統同步`分類為`Future Phase Captured / Not Requested`。任一能力準備在production slice啟用時重新進入DEV-116或建立其owner DEV，加入company namespace、delivery dedupe、read model、failure injection與zero-leak mutant；未通過前不得加入production write smoke。

## 16. Spec Governance Result

- Spec Impact：`Compatible amendment`。本文件落實既有production-slice ADR的smoke company決策，不改產品slice或正式號不可重用政策。
- ADR：`No New ADR`。主要長期選擇已由`ADR-PDM-PRODUCTION-SLICE-001`接受；本文件補的是資料、身分與證據契約。若日後改成第二套stack／identity tenant、正式Jenfu例行寫入或改變Platform `DEV-010` topology，必須重開ADR。
- Current local foundation P0/P1 implementation與驗證gap：0。116-A／B／C產品碼、migration、runner與固定31案已完成，狀態為`Local RD Implemented / Local QA-QC 31/31 PASS / local-foundation`；R02 machine receipt verifier為`5/5 PASS`，authenticated browser executor contract為`7/7 PASS`，Platform provider observation producer為`5/5 PASS`，production pipeline為`25/25 PASS`。DEV-010 R1E已在三repo完成PostgreSQL verifier NOLOGIN group、八個owner-owned evidence views、exact IAM login binding與provider-native read-only executor；fresh N1A=`11/11 unit＋30/30 QC PASS`、R1E=`14/14 unit＋4/4 focused QC PASS`、N2=`48/48 PASS`，原P0 source blocker已關閉。R1-04A production packages、exact-commit local build及Platform guarded provider artifact producer source亦已完成；R1-04F／B guarded producer source也已完成，B 7案＋F 8案＋IaC 7案=`22/22 PASS`，並把runtime secrets修正為五個獨立版本流。116-R仍因Production neutral roles/contracts與062尚未套用、現行ledger仍為`public / 53 / highest 056`、DEV-010既有9項preflight blocker、實際provider artifacts、需要時R1-04F與R1-04B provider execution及reviewed runtime manifest缺件而`BLOCKED`；正式binding、principal provisioning、`063 → 062` apply、actual candidate Level 4與promotion維持`NOT_RUN`。

## 17. 2026-09-04 R01 production read-only preflight

- Release capsule：`REL-116-20260904`；PM report=`.ai-doc/reports/pm/pm-dev-116-r01-production-release-preflight-2026-09-04.md`；machine summary=`output/production-release/REL-116-20260904/r01-readonly-preflight.json`。
- Cloud Run Job execution `ai-pdm-prod-migration-runner-mcmxs`只執行`BEGIN READ ONLY` catalog／ledger查詢後`ROLLBACK`。Production data writes、deploy、traffic change與principal provisioning均為0。
- 實際Production為PostgreSQL 17、`db-f1-micro / ZONAL`、backup/PITR enabled、private IP only；serving revision仍為`ai-pdm-prod-gh-bb30682c-33729286511`且100%。
- `ai_pdm_core`、`platform_contract`、`orgmaster_contract`、DEV-010四個必要role與principal／entitlement contract views均不存在；AI-PDM legacy runner不得直接套用062。
- Legacy package改為54支（既有53＋063），明確排除DEV-010-owned 062；workflow改為`prepare → candidate → promote`，candidate另要求DEV-010 R1、migration、smoke principal與cost evidence，且三個side-effect flag必須在revision readback均為`disabled`。
- DEV-010 N2D曾因DEV-116合法後續變更而fail closed；其後又發現Platform bootstrap database ACL hard-code `jenfu_dev010`的production deployability gap，已前向修正為identifier-safe `current_database()`，exact-target guard仍在DDL前。Fresh N1A=`11/11 unit＋30/30 PostgreSQL QC PASS`；三repo以detached exact-HEAD clean worktrees重跑N2=`48/48 PASS`，aggregate=`../../../Jenfu-Management-system/output/dev-010/n2/aggregate/AGGREGATE-20260904T164946034Z-9908/aggregate-report.json`、SHA-256=`548f54f43ee2896c0ac448789dd6905fefd72da9e241d937f603f75a246d5a1b`。Platform current capacity v2／preflight v3／release-adapter v2固定`db-custom-1-3840 / ZONAL_DEDICATED / USD 100`並保持backup／PITR／private IAM／schema-role隔離，不宣稱HA。這關閉bootstrap與舊REGIONAL machine-contract source gap，但不解鎖R1：此階段的post-commit source lock仍待以Platform generated evidence綁定最新三repo HEAD；其後已由第19節記錄為`FROZEN`。neutral target identity、RTO、RPO、budget／restore／incident owners、maintenance window／owner、production capacity及15案provider execution仍未完成。

## 18. 2026-09-04 Local implementation and tech-lead closure

- 實作：`SMOKE / production_smoke`成為typed company authority；unknown、empty與missing membership不再fallback JENFU。Smoke command另外要求dedicated Engineer、single default membership、active principal／organization mapping與三個side-effect runtime flag全為`disabled`，否則在domain mutation前回403／503。
- 資料：SQLite fresh schema／history initializer與PostgreSQL `063`新增compatible `company_kind`及`audit_logs.company_id/scope_kind`；tenant/global/legacy分類只有一個application authority，legacy未知歸屬保留NULL。Current async sequence、audit、search/list/detail/export/count/task/notification都以company predicate及同company join封口。
- UI：只有smoke actor看到不可互動的`驗證租戶`badge；一般Jenfu actor無切換控制且不洩漏smoke identity。1440×900與390×844皆通過，未新增第二套產品流程。
- 證據：唯一orchestrator `npm run qc:dev-116`固定先後執行contract→migration→isolation-A→isolation-B→browser→isolation-C→aggregate；producer失敗仍留下FAIL/BLOCKED，aggregate只接受31個唯一ID、同run/source、primary before=after、cleanup及redaction通過。最終authority預定為`output/qa/dev-116-production-smoke-tenant/DEV116-LOCAL-20260904-FINAL-R1/aggregate-manifest.json`。
- Tech Lead correction：第一次整體預驗的前30案通過，但Next自動改寫`next-env.d.ts`造成source fingerprint漂移，QA-116-031正確FAIL；已新增byte-for-byte restore與aggregate cleanup assertion後重驗。這筆preflight FAIL保留，不能取代最終PASS。
- 架構判定：`通過（Local foundation）`。原本Production Level 4目的仍可保留，因future R02仍在同一Production artifact／runtime／Cloud SQL中以smoke company真實commit＋reload；本地31/31只證明安全基礎與runner，不冒充R02。沒有新增第二套Cloud Run／Cloud SQL／Firebase或常駐SKU，因此固定雲端成本floor仍為0；低頻request、DB row與log增量維持`USD 0～1／月`planning target，實際值由R04與`OBS-116-01`量測。

## 19. 2026-09-05 DEV-010 R1 verifier dependency amendment

RD技術主管複審結論：Platform改採`db-custom-1-3840 / ZONAL_DEDICATED / USD 100`沒有改變DEV-116原始目的。R02仍要求同一production artifact／runtime／Auth／API／Cloud SQL上的SMOKE真實`COMMIT + reload + provider readback`，並保持Jenfu before=after、zero-leak=0、side effects disabled；ZONAL只代表不提供automatic cross-zone failover，不能用Level 4 PASS宣稱HA。

GCP IAM與PostgreSQL ACL必須分開驗證。Platform IaC建立的`r1_verifier` service account、Cloud SQL IAM user及viewer／client權限，只支持連線與provider metadata，不會自動取得`ai_pdm_contract` SELECT。DEV-010 010-R1E現已在本地source完成以下邊界：

- `jenfu_r1_verifier` NOLOGIN group與exact IAM DB login membership；login不得是superuser、owner、migrator或runtime member。
- AI-PDM在`ai_pdm_contract`提供verifier-only、`security_barrier`、欄位allowlisted evidence views；至少涵蓋root／part／drawing／relation、company-scoped sequence、`numbering.create` audit與command／outbox摘要。不得對verifier blanket grant `ai_pdm_core` base tables、JSON payload、email／credential欄位、DML、sequence或function。
- Provider executor使用同一effective role，在browser前建立Jenfu baseline，browser後30分鐘內以`BEGIN READ ONLY`讀exact SMOKE IDs／codes與Jenfu after；兩次fingerprint欄位、排序、target與source必須相同，期間不得cleanup。
- Positive gate證明exact views可讀；negative gate證明base table、DML、sequence、function、role escalation與未allowlisted schema均denied。若只能借用`jenfu_ai_pdm_runtime`、migrator或superuser，R02固定FAIL，不以較高權限輸出補正。

此依賴不增加第二套stack或常駐SKU，只有既有Cloud SQL中的role／views與低頻read-only query，故DEV-116固定成本floor仍為0；實際query／log增量仍納入R04與`OBS-116-01`。AI-PDM local 31／31不因這項release dependency回退。Implementation commits為Platform `351d3bc`／`d9c3295`／`2e4bdef`、OrgMaster `8046418`、AI-PDM `2ad790137`；fresh N1A=`11／11 unit＋30／30 QC PASS`，R1E=`14／14 unit＋4／4 focused QC PASS`，detached exact-HEAD N2=`48／48 PASS`，均為`productionWrites=false`。因此010-R1E source blocker已關閉，但production尚未套用；既有production layout必須先由DEV-116 legacy package套用`063`建立`company_kind`與audit scope欄位，再由DEV-010 neutral migration套用`062` views，順序不可顛倒或合併成未鎖版SQL。Post-commit source lock已以最新三repo committed HEAD重建為`FROZEN`，其動態hash以Platform generated receipt為權威。正式IAM membership binding、provider readback與actual R02仍受DEV-010既有9項preflight blocker及獨立release gate限制，狀態維持`BLOCKED / NOT_RUN`。

## 20. 2026-09-05 DEV-010 R1-01 source inventory dependency

Platform現已建立`QA-010-R1-01` guarded executor source，並以前向修正納入AI-PDM legacy database全部非system schemas、owner／ACL／ledger／exact row count與同project／region Cloud Run service／job direct consumers；不再只掃`public`或使用repository migration數量冒充live inventory。OrgMaster current local-json authority也以frozen `dev006:inventory`輸出artifact、media及legacy／previous／temporary residue的去識別化identity／content hashes；所有物件與consumer都必須有owner及處置分類，否則不能finalize。

這項依賴只決定「真正要搬的來源與仍在使用legacy DB的consumer是否已知」，不取代DEV-116 `QA-116-R02`。R02仍必須在neutral candidate以相同production artifact／Auth／API／Cloud SQL，讓`company-smoke`完成真實COMMIT＋reload，再由專用verifier證明Jenfu before=after、zero leak及side effects disabled。R1-01即使PASS也不得寫`company-jenfu`、不得宣稱Production Level 4，亦不得解鎖traffic。

Current source verification為R1-01 focused `7／7 PASS`及Platform release-adapter `12／12 PASS`；實際legacy DB／Cloud Run盤點尚未執行，classification receipt不存在，full preflight仍有9項blocker，因此`QA-010-R1-01`與`QA-116-R02`皆維持`NOT_RUN`。Executor只有`BEGIN TRANSACTION READ ONLY／ROLLBACK`與provider list／describe，固定月成本floor為0；一次性catalog、exact count與log用量納入DEV-010 R1 transition cost，不提高DEV-116的`USD 0～1／月`例行smoke目標。

## 21. 2026-09-05 Neutral candidate producer dependency

DEV-116不自行建立另一個AI-PDM smoke image。R02只接受Platform DEV-010 `QA-010-R1-04`同一三repo release candidate中的AI-PDM digest／revision；candidate producer固定依`R1-04A immutable artifact build → 必要時R1-04F fail-closed first-revision foundation → R1-04B digest-only neutral revision`前進。AI-PDM既有`jenfu-ai-pdm-prod` workflow綁legacy project，只能提供build邏輯盤點，不能把其image、service、revision、environment或receipt直接標成neutral candidate。

AI-PDM R1-04A artifact必須從source-lock列出的exact commit／tree與tracked lockfile建置，保存builder digest、OCI digest、SBOM／provenance digest與secret scan；R1-04B只可把exact digest部署到neutral `jenfu-platform-prod / ai-pdm-prod`，讀回runtime identity、neutral database target、exact secret version refs、`PDM_SMOKE_GCS_WRITER／PDM_SMOKE_OUTBOX_CONSUMER／PDM_SMOKE_EXTERNAL_NOTIFICATION=disabled`、min instances 0及startup readiness。Candidate與promotion不得rebuild，legacy environment不得未經manifest逐欄分類就複製。

若neutral `ai-pdm-prod` service尚不存在，Cloud Run第一個revision不能被文件假設為0% traffic。必須先以DEV-010 R1-04F建立獨立no-role identity及無database credential、無business route、無canonical DNS／正常登入且scale-to-zero的holding revision；effective IAM須證明Cloud SQL connect／login與五個獨立runtime secret access均為DENIED。它雖接收service當下100% foundation assignment，但固定internal ingress、default URL disabled、private IAM及所有method／path 503；不得為了HTTP probe暫開URL或allUsers。Holding artifact／revision與release candidate分離，不得用DEV-116 runner寫資料，也不得算R01／R02 PASS。其後actual candidate revision才可保持0% canonical traffic。

R02受限candidate tag只能在R1-04 provider verifier PASS及獨立write GO後建立／啟用。Identity Platform authorized domain與server origin allowlist必須綁exact tagged host及candidate revision，不可使用wildcard；此tag可達性不是canonical promotion。任一source／lockfile drift、mutable-tag authority、provenance／SBOM缺件、secret進layer、legacy target混入、foundation可連DB／business route、candidate非0% traffic、side-effect flag漂移或R1-04與R02 candidate不一致，都使R01／R02保持BLOCKED。

Cloud Build與revision建立屬DEV-010一次性transition cost；Artifact Registry依artifact bytes與保留天數計費，在刪除前不是零。這些不併入DEV-116 `USD 0～1／月`例行smoke增量，但同project budget未按service過濾時仍占用USD 100告警線；R1-02須記錄bytes、retention-until與cleanup。`min instances=0`時固定compute floor為0。任何非零min instance、長期保留candidate或新增常駐worker都須先回DEV-010成本決策。2026-09-05三repo production container package source與exact-commit local OCI build已完成；AI-PDM以commit `49e17607627c1b00b6cc6a6a8fa094e274a6cfe4`／tree `7782e12c8266cd260cb649e90164176525cacfca`建出local digest `sha256:4399639605a9c506e5acd36b126d068cc3d30f1b31572309e8823f4681984d75`，nonroot／runtime assets／SBOM／bounded app secret scan與primary-data before-after均PASS。Platform `6c54439`另完成R1-04A guarded provider producer source；Platform `38506b5／8889e47／287da0f`再完成R1-04F source、gen2 512 MiB與zero direct invoker hardening。後續R1-04B source `bc79bc662799bf5d28e8fe83bf6160918935ded2`已固定A exact digests＋F receipt＋reviewed runtime manifest、五個獨立numeric secret versions、service baseline不變、startup readiness及candidate traffic=0；B 7＋F 8＋IaC 7=`22/22 PASS`。Current 8項foundation blocker與A／F／runtime evidence缺件使三個producer都在provider auth前停止，故為`R1-04A Local Packaging＋A/F/B Producer Source PASS / Provider Artifact and A/F/B Execution NOT_RUN`；仍未push、deploy、改authorized domain、寫Production或改traffic，且不得宣稱R01／R02或Production Level 4 PASS。

使用思考習慣：#多層次分析、#批判、#可驗證性

## 22. 2026-09-05 DEV-010 R1O operational evidence dependency

Platform commit `3a3a3e9`修正R1 release adapter：`QA-010-R1-05／06／08／09／10／12／13／14／15`不再能以`caseEvidence=null`配合外層PASS checks解鎖15案。九案現在都必須具備self-hashed typed evidence，並綁同一release、preflight、source lock、neutral target、逐check provenance、mutation boundary及`QA-010-R1-04` candidate manifest SHA；reconciliation差異、freeze後寫入、dual-write、P0／P1、legacy consumer、舊secret仍有效、production target rollback、event loss或handoff未完成等stop condition均會fail closed。

此修正強化DEV-116的前置安全性，但不改`QA-116-R02`自身分母，也不能替代R02。只有同一R1-04 AI-PDM candidate在`company-smoke`走正常Production Auth／UI／API／Cloud SQL真實COMMIT＋reload，並由專用verifier證明Jenfu before=after、zero leak與side effects disabled，才可形成Production Level 4；其他十四案或operational evidence全部PASS也不能代替這條write-path證據。

Current Platform release adapter unit=`19／19 PASS`，fresh release／preflight／foundation QC均PASS；full preflight仍`BLOCKED 9`、foundation仍`8 blockers＋1 deferred capacity`，R1十五案與QA-116-R02仍全部`NOT_RUN`。九案provider executors尚未實作／執行，因此這只關閉false-PASS schema gap；production／Cloud／traffic mutation為0，DEV-116低頻smoke成本與DEV-010 USD 100 alerts-only budget均不變。

## 23. 2026-09-05 DEV-010 R1-05 canonical reconciliation dependency

Platform commits `9b1bd5f／54faeac`已將`QA-010-R1-05`從通用typed payload升級為12組canonical source／candidate snapshot gate，並補上repair chronology gate。它要求legacy AI-PDM DB、OrgMaster frozen JSON、neutral DB與neutral object storage四類read-only input，同時綁定source lock、R1-04 exact candidate manifest、neutral target及同一migration cursor；row／PK／content hash／FK、immutable audit、file object readback、migration disposition、domain invariant及unclassified difference全部歸零後，才可產生R1-05 evidence。Snapshot超過300秒、candidate／cursor漂移、missing file object、repair未逐筆`APPROVED_AND_RESOLVED`，或時間鏈不符合`final snapshots → repair ledger → reconciliation report`都會fail closed。

這項對帳只證明「搬遷到將執行R02的同一candidate後，canonical data沒有遺漏或未核准差異」，不能替代DEV-116的write path。`QA-116-R02`仍必須在該AI-PDM revision走Production Auth／UI／API／Cloud SQL，以`company-smoke`真實COMMIT＋reload，再用專用verifier證明Jenfu before=after、zero leak與side effects disabled。R1-05即使actual PASS，也不證明SMOKE actor、tenant predicate、編號sequence或browser delivery path正確；反之R02成功也不能掩蓋R1-05資料對帳差異，兩者都是必要條件。

R1-05 unit=`9／9 PASS`、含release adapter focused QC=`28／28 PASS`；但目前完成的是input contract與assembler，不是四類provider snapshot producer的actual execution。Current preflight仍`BLOCKED 9`且在讀input前停止，R1-05與R02都維持`NOT_RUN`。Assembler沒有DB driver、gcloud或固定SKU，成本floor為0；未來一次性read-only snapshot IO與logs屬DEV-010 transition cost，不調高DEV-116 `USD 0～1／月`例行smoke目標，也不改USD 100 alerts-only project budget。
