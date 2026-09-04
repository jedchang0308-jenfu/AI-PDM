# QA-DEV-116：Production Level 4 驗證租戶隔離驗證計畫

Status: `Local QA-QC Complete / Fixed Current Denominator 31 / 31 of 31 PASS / R02 Receipt Contract 5 of 5 PASS / QA-116-R01 READ-ONLY PRECHECK COMPLETE BUT BLOCKED BY DEV-010 R1 / R04 POLICY PRECHECK PASS, RELEASE-COMMIT EVIDENCE PENDING / R02-R03 NOT_RUN`

Date: 2026-09-04

Related DEV: `DEV-116 / DEV-PDM-PRODUCTION-SMOKE-TENANT-ISOLATION-001`

Related SPEC: `.ai-doc/specs/SPEC-PDM-PRODUCTION-SMOKE-TENANT-001-level4-isolation-and-evidence.md`

## 1. Validation Objective

Current 31案證明`company-smoke`隔離foundation可在task-owned環境沿正常application、Auth、API、domain、repository與database transaction路徑完成真實commit＋reload，同時`company-jenfu`固定business invariant scope不變；任何tenant predicate、身分綁定或證據欄位缺失都必須被測試或aggregate抓出。它不證明production network／runtime／Cloud SQL已通過；Production Level 4只由R02的exact production candidate evidence成立。

本計畫定義Current Phase固定`QA-116-001..031`與Future Release Gate `QA-116-R01..R04`。2026-09-04使用者啟動116-R後，R01只完成Production catalog／ledger唯讀precheck並因DEV-010 R1前置不存在而BLOCKED；R04完成current official-price policy precheck，但尚未綁定最終release commit。R02／R03仍`NOT_RUN`；未執行migration apply、資料修復、principal provisioning、deploy、write smoke或traffic promotion。

## 2. Evidence Rules

- Test/build/static、SQLite、PostgreSQL、API、browser與production candidate evidence各自只支持其實際層級。
- Fixture只建立前置company、actor與parent data；案例要驗證的root/part/drawing結果必須由正常delivery path建立。
- Browser direct URL只能補route證據，不能取代正常navigation入口；Level 4必須login、正常入口、create、commit、reload與readback。
- Current execution只允許task-owned `PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`、disposable PostgreSQL、free port與明確process tree；primary schema/data/identity before=after。
- 任一P0/P1 failure、missing/duplicate case、source drift、unexpected 4xx/5xx、console error、visible error、cleanup failure或manifest provenance mismatch使aggregate FAIL。
- QA case不得因fixture不足改成PASS；環境／角色／資料不可得時標`BLOCKED`或`NOT_RUN`。
- 每份aggregate必填`claimLevel`。Current只能是`local-foundation`；R02才可為`production-candidate-level4`；R03只證明`canonical-post-promote`，不得互相冒充。

## 3. Required Fixtures

| Fixture | Purpose |
|---|---|
| `COMPANY-JENFU` | Business company，具可辨識root/part/drawing、sequence、audit、report/count基線 |
| `COMPANY-SMOKE` | `id=company-smoke`、`code=SMOKE`、`kind=production_smoke` |
| `ACTOR-JENFU-ENGINEER` | 只有JENFU membership的正常Engineer |
| `ACTOR-SMOKE-ENGINEER` | 只有SMOKE membership、user/default/session/mapping一致的dedicated actor |
| `ACTOR-NO-MEMBERSHIP` | Active identity但無company membership，用於fail-closed |
| `ACTOR-MISMATCH` | Session claim、user company、membership或platform mapping至少一項不一致 |
| `LEGACY-AUDIT` | submission-derived、detail-derived與無法唯一導出的legacy audit rows |
| `GLOBAL-AUDIT` | exact角色／權限／delegation／rule治理action，`scope_kind=global`且`company_id=NULL` |
| `LEGACY-SEQUENCE` | 正常company-prefixed、錯誤stored company、unprefixed與max-used mismatch rows |

Fixtures不得包含production payload、real credential、Firebase UID、email、token、cookie、connection URL或private file。

## 4. Current Fixed Acceptance Matrix

### 4.1 Contract and Migration

| ID | Pri | Scenario / operation | Expected | Evidence layer |
|---|---|---|---|---|
| QA-116-001 | P0 | Static inventory解析company code/resolver/user repository | `SMOKE`為明確code；unknown/empty不存在JENFU fallback | Static contract + focused unit |
| QA-116-002 | P0 | Static inventory解析normal create/reload實際命中的Current audit write/read及全部既有writer | Current production-slice event有typed company且read含predicate；其他writer列入TD-116-01 inventory並排除於tenant view，不假稱全系統完成 | Static import/callsite inventory manifest |
| QA-116-003 | P0 | Static inventory解析sequence key/select/update/lock | 所有路徑同時使用company與canonical prefixed key | Static inventory + mutant |
| QA-116-004 | P0 | Fresh SQLite與fresh PostgreSQL apply | company kind、audit scope與structural CHECK語意一致；DB沒有第二份action allowlist或冗餘sequence unique index | SQLite + disposable PG schema readback |
| QA-116-005 | P0 | Existing-history migration含LEGACY-AUDIT | 可唯一導出者正確backfill；未知保留NULL，不猜JENFU；bytes/action/timestamp不變 | Before/after row/hash manifest |
| QA-116-006 | P0 | Existing-history migration含LEGACY-SEQUENCE | mismatch/unprefixed active key fail closed並輸出plan，沒有自動production-style repair | Disposable DB failure receipt |
| QA-116-007 | P0 | Migration transaction中途注入failure後rerun | 首輪零partial schema/data；rerun成功或no-op；source migration bytes不變 | SQLite + disposable PG fault injection |

### 4.2 Identity, Session and Permission

| ID | Pri | Scenario / operation | Expected | Evidence layer |
|---|---|---|---|---|
| QA-116-008 | P0 | ACTOR-SMOKE登入並解析company | session/user/membership/mapping皆為company-smoke且角色Engineer | Auth integration + DB readback |
| QA-116-009 | P0 | ACTOR-SMOKE以header/query/body要求JENFU或MAXIMA | 403、zero business/audit/receipt/sequence write，不列出合法company | API + DB before/after |
| QA-116-010 | P0 | ACTOR-JENFU要求SMOKE或使用smoke object ID | 403/404、zero-write、response不洩漏smoke identity | API negative + DB fingerprint |
| QA-116-011 | P0 | ACTOR-NO-MEMBERSHIP登入或呼叫business API | `pdm_company_membership_required`或更嚴格拒絕；不得fallback JENFU | Auth/API negative |
| QA-116-012 | P0 | ACTOR-MISMATCH四種claim/user/membership/mapping差異 | 每種都在domain mutation前拒絕 | Auth/API matrix |
| QA-116-013 | P1 | 正常navigation與tenant indication | Jenfu/Maxima actor看不到SMOKE；smoke actor看見不可點擊的驗證租戶badge且無business tenant切換入口 | Real browser desktop + narrow |

### 4.3 Data, Sequence, Audit and Read Models

QA-116-014～018、21～022主要對應normal create/reload mutation path；QA-116-019～020是production activation必需的cross-surface zero-leak read gate，不表示本DEV新增或全面重寫export／report／task／notification lifecycle。這兩類證據不得互相代替。

| ID | Pri | Scenario / operation | Expected | Evidence layer |
|---|---|---|---|---|
| QA-116-014 | P0 | SMOKE正常建立root＋part＋drawing | 所有business rows、FK、created_by與transaction只屬company-smoke | API/service + DB commit readback |
| QA-116-015 | P0 | 相同初始sequence下SMOKE與JENFU各分配號碼 | 可見code格式相同但next value、lock、reservation互不影響 | Concurrent disposable PG |
| QA-116-016 | P0 | SMOKE committed root／part／drawing與正式號生命週期邊界 | row/event/company唯一性正確；cleanup不得刪除、回收或重發已commit正式號 | Repository/API + DB readback |
| QA-116-017 | P0 | Jenfu在normal create/reload範圍的search/list/detail/series/preview empty-state/append policy | 無SMOKE row、ID、count、cursor、suggestion或empty-state影響 | Repository + API contract |
| QA-116-018 | P0 | Jenfu tenant audit trail、Current global admin audit與recent-idempotency read | tenant view只回JENFU；legacy/global/SMOKE不混入。Admin只回exact current global allowlist，TD-116-01 action不冒充tenant/global；SMOKE Engineer無權存取 | Repository + API + DB query plan |
| QA-116-019 | P0 | Jenfu export job、monthly report與export audit summary | 內容與total不含SMOKE，export artifact無smoke code/ID | API + artifact inspection |
| QA-116-020 | P0 | Jenfu dashboard/count/task/notification | 所有數字、分頁與pending count before=after | API/read-model fingerprint |
| QA-116-021 | P0 | 同idempotency key在JENFU與SMOKE執行合法command | receipt/outbox按company隔離；各company exactly once | Concurrent repository/API |
| QA-116-022 | P0 | 使用另一company合法UUID呼叫read/update | 403/404、zero-write，無partial join/projection或existence leak | API + DB fingerprint |

### 4.4 Delivery Path, Failure Recovery and Evidence

| ID | Pri | Scenario / operation | Expected | Evidence layer |
|---|---|---|---|---|
| QA-116-023 | P0 | 正常UI login→navigation→建立編號→reload→search/detail | 由正常入口建立並真實commit；reload讀回同一object IDs與內容 | Real Chromium + API + DB |
| QA-116-024 | P1 | QA-116-023在1440px與390px | company標記、表單、成功/readback狀態可見，無overflow、focus/console/network錯誤 | Real Chromium screenshots/measurements |
| QA-116-025 | P0 | Commit response loss後same-key retry | 不重複sequence/object/audit/receipt；UI經readback收斂同一結果 | Fault injection + browser/API/DB |
| QA-116-026 | P0 | Bundle中途failure與concurrent duplicate submit | 全rollback或exactly once；無partial root/part/drawing/sequence/audit | Disposable PG concurrency/fault |
| QA-116-027 | P0 | Smoke business cleanup完全失敗 | SMOKE資料可retained_controlled；Jenfu所有surface與fingerprint仍不變 | Failure injection + cross-surface aggregate |
| QA-116-028 | P0 | GCS writer/outbox consumer/external notification disabled readback | 全部仍disabled，沒有external side effect；若不可證明則FAIL | Config/runtime readback |
| QA-116-029 | P0 | Jenfu outer transaction supporting probe | 強制rollback且before=after；manifest標為supporting，不冒充HTTP commit E2E | Repository/service + DB role receipt |
| QA-116-030 | P0 | 六種tenant/evidence mutant逐一啟用 | 每個mutant都使對應case或aggregate FAIL，不能false pass | Mutant receipts |
| QA-116-031 | P0 | Aggregate manifest與artifact verifier | 31案無missing/duplicate；source/candidate/actor/company/object/fingerprint完整且無secret/PII | Machine manifest verifier |

Current completion固定為`31/31 PASS`；不接受調整分母、用parent aggregate整包代替、或把future release cases算入分子取得完成。

## 5. Future Production Release Gate Cases

下列案例為`116-R / Release Gate Required`，不阻止local implementation completion，但全部阻止production write smoke activation：

| ID | Pri | Scenario | Expected evidence |
|---|---|---|---|
| QA-116-R01 | P0 | Exact zero-traffic production candidate preflight | source revision、dirty boundary、image digest、Cloud Run revision、DB identity與smoke company/principal readback一致 |
| QA-116-R02 | P0 | Candidate-bound authenticated SMOKE Level 4／Platform R1-07 AI-PDM co-gate | normal UI commit＋reload通過，Jenfu before/after一致，zero-leak=0，side effects disabled；同一receipt SHA-256亦被同release／source lock／candidate／neutral target的Platform `QA-010-R1-07`引用 |
| QA-116-R03 | P0 | Canonical post-promotion smoke | 只做核准的canonical checks；不得重用candidate evidence冒充canonical，任何write仍受獨立GO |
| QA-116-R04 | P1 | Release前cost upper-bound gate | 依當次有效SKU／帳務設定計算單run上限；新增固定SKU=0，bundle/request/log cap可驗證，超預算或價格不可得即NO-GO |

R02 receipt固定`releaseId`、三repo source-lock SHA、candidate image digest／Cloud Run revision、neutral database identity、hash後actor、`company-smoke / SMOKE / production_smoke`、committed object IDs／codes、reload readback hash、Jenfu invariant before／after、zero-leak count、三個side-effect flags、`platformCaseId=QA-010-R1-07`、`pdmCaseId=QA-116-R02`及receipt自身SHA-256。Platform與AI-PDM aggregate必須引用同一receipt；任一欄缺失、receipt重用、identity漂移或兩邊hash不同，R02與R1-07的AI-PDM子結果同時FAIL。R02只覆蓋AI-PDM；Portal與OrgMaster證據仍由Platform分別完成。

R02 receipt verifier已在本機實作並以`npm run test:dev-116:r02-receipt`取得`5／5 PASS`；production pipeline QC仍為`24／24 PASS`且明確禁止把既有unauthenticated generic smoke標成`production-candidate-level4`。Verifier只接收已觀測資料並產生hash-bound receipt／Platform projection，不能deploy、migrate、promote或發出production request。因此本結果屬release tooling foundation，不增加R02分子；R02仍須由未來reviewed authenticated browser executor對exact zero-traffic candidate實際執行。

候選版正常登入固定走受限`candidate` Cloud Run traffic-tag origin；QA須同時證明Identity Platform authorized domain與server origin pattern都只允許exact production service/tag，untagged direct `run.app`仍為403。此origin exception只解決零流量candidate的Firebase BFF session exchange，不建立第二個canonical入口，也不構成R02 PASS。R02 runner還必須提供正常登入表單、SMOKE tenant indicator、UI create、COMMIT、reload、provider DB readback與Jenfu zero-leak同一execution receipt。

DEV-010 neutral target的ZONAL／USD 100決策不得以修改AI-PDM legacy `db-f1-micro／USD 300`設定代替。QA-116-R01須把legacy與neutral project／instance／database identity分開列示；若切換期間同時存在，引用Platform `QA-010-R1-02`的overlap window與incremental-cost receipt。沒有neutral identity或把legacy readback當成neutral時，R01與R02都維持BLOCKED。

`OBS-116-01`不是首次啟用前置case。首次啟用後以10次完整run或30日先到者，比對同長度baseline的Cloud SQL／backup／Cloud Run／logging／Auth實際差額；超過每月`USD 1`規劃目標、出現未核准fixed floor或無法歸因時，暫停後續例行write smoke並回成本gate。

## 6. Fail-seeking / FMEA Focus

最高風險失敗不是「smoke資料刪不掉」，而是「資料已跨tenant寫入或被normal Jenfu projection讀到，但cleanup表面成功」。因此QA優先尋找：

- parser或fallback把`SMOKE/unknown/empty`變成`JENFU`。
- session claim正確，但body/header覆寫effective company。
- table有`company_id`，query/join/count/cursor/audit卻漏predicate。
- sequence key看似含company，select/update實際未驗stored company。
- API 201成功但reload走另一projection讀不到，或fixture直接seed成功結果。
- manifest只保存檔案路徑／PASS文字，未綁candidate與before/after。

## 7. No-Go Criteria

- Current 31案任一FAIL/BLOCKED/NOT_RUN卻宣稱local completion或RD implementation完成。
- Current production-slice的新tenant numbering event缺company、business audit查詢讀到legacy unscoped或SMOKE rows。
- Unknown/empty company或missing membership可落入JENFU。
- SMOKE/JENFU sequence、candidate、receipt、outbox或idempotency互相影響。
- 正常Level 4只驗HTTP、direct URL、DB seed或rollback，未經normal UI commit＋reload。
- R02未與同release的Platform `QA-010-R1-07`共用exact receipt，或任何測試業務物件寫入`company-jenfu`；cleanup、刪除與rollback-only均不能補正。
- Cleanup成功被當成隔離證據，或cleanup失敗導致Jenfu可見資料。
- 使用production credential/target、remote schema/data/IAM、deploy、traffic或release而未進release gate。

## 8. Evidence Handoff

Current evidence root預定為`output/qa/dev-116-production-smoke-tenant/<run-id>/`，至少保存：

- source/dirty inventory、case registry與aggregate manifest。
- SQLite/PostgreSQL fresh/history/rerun/fault/concurrency receipts。
- Identity/API/repository/cross-surface before-after results。
- Browser report、viewports、routes、operations、screenshots、console/network/visible-error summary。
- Mutant receipts、secret/PII scan、primary invariant、runtime/port/temp cleanup。

Case registry authority固定為`.ai-doc/qa/dev-116-current-case-registry.json`；runner與schema source固定為：

- `scripts/qc-dev-116-contract.mjs`
- `scripts/qc-dev-116-migration.mjs`
- `scripts/qc-dev-116-isolation.mjs`
- `scripts/qc-dev-116-isolation-b.mjs`
- `scripts/qc-dev-116-isolation-c.mjs`
- `scripts/qc-dev-116-browser.mjs`
- `scripts/qc-dev-116-aggregate.mjs`
- `scripts/qc-dev-116.mjs`
- `scripts/dev-116-evidence-utils.mjs`
- `config/production-smoke-tenant.json`

## 9. Exact Runner-to-case Mapping

| Runner | Primary case ownership | Supplemental responsibility |
|---|---|---|
| `qc:dev-116:contract` | `001..003` | source/dirty inventory、action/surface manifest、static mutants |
| `qc:dev-116:migration` | `004..007` | SQLite＋self-owned PostgreSQL public／ai_pdm_core lanes、immutable hash、rerun/fault |
| `qc:dev-116:isolation:a` | `008..012` | auth/session/membership/mapping fail-closed negatives |
| `qc:dev-116:isolation:b` | `014..022` | repository/API/read model/idempotency與cross-surface zero-leak |
| `qc:dev-116:browser` | `013, 023..025` | normal navigation、1440×900／390×844、reload、response-loss recovery、console/network/a11y |
| `qc:dev-116:isolation:c` | `026..030` | PostgreSQL concurrency/failure、cleanup failure、side-effect readback、rollback與六mutants |
| `qc:dev-116:aggregate` | `031` | 讀取前六producer，不自行偽造其case PASS；驗證31個唯一ID、provenance、primary invariant、cleanup與redaction |

每個case只有一個primary owner。Supplemental runner可引用同一case的artifact，但不得再產生第二筆case result。Registry中的`primaryRunner`、priority與phase不可由runtime改寫。

## 10. Exact Commands and Exit Contract

```text
npm.cmd run qc:dev-116:contract -- --run-id <run-id>
npm.cmd run qc:dev-116:migration -- --run-id <run-id>
npm.cmd run qc:dev-116:isolation:a -- --run-id <run-id>
npm.cmd run qc:dev-116:isolation:b -- --run-id <run-id>
npm.cmd run qc:dev-116:browser -- --run-id <run-id>
npm.cmd run qc:dev-116:isolation:c -- --run-id <run-id>
npm.cmd run qc:dev-116:aggregate -- --run-id <run-id>
npm.cmd run qc:dev-116 -- --run-id <run-id>
```

- Individual lane缺`--run-id`、run root不一致或source fingerprint不同時exit non-zero，不建立PASS。
- `qc:dev-116`是唯一整體orchestrator：產生或接受唯一run-id，依contract→migration→isolation-A→isolation-B→browser→isolation-C→aggregate執行。Producer失敗後仍進cleanup/finalizer；aggregate必須記錄missing/blocked/failure而非縮小分母。
- Migration runner自行建立loopback dynamic-port PostgreSQL cluster；缺binary時QA-116-004..007及依賴的015/021/026為`BLOCKED`，不得以static SQL取代actual provider evidence。
- Browser runner使用dynamic port及task-owned `PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`、`PDM_NEXT_DIST_DIR`。它不得停止或重啟既有`npm.cmd run dev:local` port 3000 runtime；port衝突時另選free port並只管理自身PID tree。
- PASS exit code=0；任何`FAIL/BLOCKED/NOT_RUN`、missing/duplicate ID、cleanup incomplete、primary drift、secret/PII finding或source mismatch均exit non-zero。

## 11. Artifact Layout and Required Fields

```text
output/qa/dev-116-production-smoke-tenant/<run-id>/
  source.json
  primary-before.json
  contract.json
  migration.json
  isolation-a.json
  isolation-b.json
  browser-b.json
  isolation-c.json
  screenshots/
  cleanup.json
  aggregate.json
  aggregate-manifest.json
```

- 每個case result固定`id/status/startedAt/finishedAt/sourceRevision/runner/artifacts/assertions`；status只允許`PASS|FAIL|BLOCKED|NOT_RUN`。
- Aggregate需有SPEC §10的candidate、target、actor、flow、readback、Jenfu invariant、side effects、cleanup與result；local run的candidate/target欄位明確標`local-task-owned`，不得冒充production candidate。
- Primary fingerprint至少含schema hash、canonical root/part/drawing identity hash、sequence scope inventory、migration-residue inventory、global foreign-key result；before/after逐欄一致才PASS。
- Manifest與所有artifact執行token/cookie/password/email/Firebase UID/private key/connection URL掃描；hash後actor ID可保留，raw secret/PII一律FAIL。

## 12. RD-to-QA Handoff Gate

116-A已先完成QA-116-001..012，116-B再完成013..022，116-C最後完成023..031；固定分母未調整，Current=`31/31 PASS`。第一次aggregate因Next runtime改寫受保護的`next-env.d.ts`而正確FAIL，修正runner復原與cleanup assertion後才允許最終run。Current 31/31只支持local isolation foundation completion；`QA-116-R01..R04`仍須另行release gate與production明確授權，其中只有R02可形成Production Level 4 claim。

使用思考習慣：#可驗證性、#批判、#風險管理
