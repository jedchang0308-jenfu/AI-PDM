# DEV-116-R R01 Production Release Preflight

日期：2026-09-04
Release ID：`REL-116-20260904`
狀態：`R01 started / fail-closed / DEV-010 R1 dependency blocked / production data writes 0`

## 2026-09-04 Follow-up amendment（current authority）

本報告下方原有`2A REGIONAL_DEDICATED`與「exact REGIONAL tier／cost未核定」描述是R01執行當時的歷史快照，現已由使用者後續成本決策有意取代。Current DEV-010 production target為`db-custom-1-3840 / ZONAL_DEDICATED / USD 100 alerts-only budget（TWD 3,200）`；保留automatic backups、PITR、deletion protection、private IP、IAM DB auth及app schema／role隔離，不提供automatic cross-zone failover，也不得宣稱HA。

R01仍為`BLOCKED`。舊REGIONAL machine config缺口已關閉：Platform capacity／preflight／release-adapter已前向更新為current ZONAL方案；R1-11 receipt contract、release binding與guarded provider executor source亦已完成，current capacity contract=`7/7 PASS`、provider executor=`9/9 PASS`。Migration plan現由執行器與測試共用，逐檔驗證locked HEAD存在，並已排除只存在其他dirty worktree的未提交DEV-046 migration。Current preflight仍列9項blocker：neutral project identity、正整數RTO、非負整數RPO、budget／restore／incident／maintenance owners、maintenance window與`db-custom-1-3840` R1-11兩輪數值容量；正式capacity run及DEV-010 production 15案仍未執行。AI-PDM已補`QA-116-R02` hash-bound receipt verifier `5/5 PASS`，與Platform `QA-010-R1-07`形成同receipt co-gate；但authenticated production browser executor及真實COMMIT＋reload仍未執行。上述條件未完成前不得production write、live migration、deploy或promotion。

## 結論

DEV-116可以依序解鎖，但不能從local foundation直接跳到Production write smoke。正式Cloud SQL唯讀盤點證明目前仍是第一版legacy topology；`062`所需的neutral schemas、roles與Platform／OrgMaster contracts均不存在。使用者已完成1A classified source commit授權、後續選定`db-custom-1-3840 / ZONAL_DEDICATED / USD 100`取代原2A REGIONAL方向，並以3A授權「15案全PASS後才live migration」；尚未套用`063`、建立smoke principal、部署candidate或切換流量。

正確順序固定為：

1. `DEV-116 legacy 063`：使用現有AI-PDM migration identity在legacy `public` layout完成backup／restore rehearsal後套用location-aware 063。
2. `DEV-010 R1`：由三系統release orchestrator依producer-first graph建立neutral roles/contracts並移動三app schema；不得由AI-PDM legacy runner執行062。
3. `DEV-116 R01`：讀回`company-smoke`、專用corporate principal、single membership、active OrgMaster mapping、sequence/audit/read-model zero leak與三個side-effect flags。
4. `DEV-116 R02`：對zero-traffic candidate走正常Production登入與UI，以`company-smoke`真實commit一個root＋part＋drawing bundle並reload/readback；同一machine receipt必須被Platform `QA-010-R1-07`引用，只有兩邊co-gate一致PASS才可稱AI-PDM Production Level 4。
5. `DEV-116 R03`：Product Owner另行GO後才promotion，完成canonical smoke；失敗則traffic-only rollback。

## Production唯讀證據

Cloud Run Job execution：`ai-pdm-prod-migration-runner-mcmxs`。執行內容只有`BEGIN READ ONLY` catalog／ledger查詢與`ROLLBACK`，沒有DDL／DML。

| Readback | 結果 |
|---|---|
| Production project／region | `jenfu-ai-pdm-prod / asia-east1` |
| Cloud SQL | `ai-pdm-prod-postgres / PostgreSQL 17 / db-f1-micro / ZONAL` |
| Backup／PITR／private IP | enabled／enabled／public IPv4 disabled |
| Serving revision／traffic | `ai-pdm-prod-gh-bb30682c-33729286511 / 100%` |
| Migration ledger | `public.pdm_schema_migrations / 53 rows / highest 056` |
| 062／063 | both absent |
| `ai_pdm_core`／neutral ledger | absent／absent |
| `platform_contract`／`orgmaster_contract` | absent／absent |
| DEV-010 app roles | `jenfu_platform_runtime`、`jenfu_orgmaster_runtime`、`jenfu_ai_pdm_migrator`、`jenfu_ai_pdm_runtime` all absent |
| Required principal／entitlement contract views | all absent |

Machine summary：`output/production-release/REL-116-20260904/r01-readonly-preflight.json`。

## DEV-010三repo可執行性盤點

權威QA plan第7節原本只凍結`QA-010-R1-01～15`。Platform現已補上`010-R1A` preflight、兩段式foundation gate、R1-11 receipt binding與guarded capacity provider executor；後者只可在machine-derived foundation READY、exact source lock、`--execute`及exact acknowledgement同時成立後，對隔離temporary database執行兩輪rehearsal，不能連`jenfu_prod`或改traffic。其餘14案與live migration executor仍不得用臨場shell命令替代。

| Component | Initial branch／HEAD snapshot | Initial dirty entries | Initial N2 freeze first failure | R1 runner |
|---|---|---:|---|---|
| Platform | `main / 487e135f39d1` | 1556 files | `ALLOWLIST_DRIFT: config/dev-010/n1b-managed-nonprod.json` | local preflight present；production runner absent |
| OrgMaster | `master / c8cc16f515f0` | 185 files | `ALLOWLIST_DRIFT: AGENTS.md` | production runner absent |
| AI-PDM | `持續優化2 / 80770f2db257` | 59 files | `HASH_MISMATCH: db/postgres/001_initial_schema.sql` | production runner absent |

`gcloud projects describe jenfu-platform-prod`只得到`permission denied or project may not exist`，因此preferred neutral project ID仍是ambiguous，不可宣稱已保留或可用。Machine evidence：`output/production-release/REL-116-20260904/r01-cross-repo-readiness.json`。

R1A source classifier初始盤點：Platform=`185 release + 28 governance + 1343 generated`、OrgMaster=`164 + 17 + 4`、AI-PDM=`39 + 10 + 10`；unknown=0、secret-local=0。1A後只有release／governance source進commit，generated-local排除；post-commit lock再以exact HEAD＋tree封存，避免tracked config自我參照。Evidence=`../Jenfu-Management-system/output/dev-010/r1/REL-116-20260904/source-classification.json`與`release-source-lock.json`。

2026-09-04 closure readback：三repo已從generated source lock建立clean worktrees，最終N2 aggregate=`../Jenfu-Management-system/output/dev-010/n2/aggregate/AGGREGATE-20260904T130541293Z-12084/aggregate-report.json`，結果`48 PASS / 0 FAIL / 0 NOT_RUN / 0 PARTIAL`。Windows clean checkout曾把canonical financial catalog轉為CRLF並觸發正確的fail-closed；已用`.gitattributes eol=lf`修復來源位元組，沒有放寬catalog驗證。Container、volume、55430與browser runtimes全部清理，`productionWrites=false`。

## Release adapter correction

- Workflow改為三個獨立dispatch：`prepare → candidate → promote`。Prepare只建置一次並輸出immutable app/migration digests與manifest hash；candidate不得重建artifact。
- Candidate需要manifest-bound migration evidence、DEV-010 R1 evidence、dedicated smoke-principal evidence與current cost evidence，缺一即停止。
- Cloud Run candidate／promotion均逐項讀回`PDM_SMOKE_GCS_WRITER`、`PDM_SMOKE_OUTBOX_CONSUMER`、`PDM_SMOKE_EXTERNAL_NOTIFICATION`為`disabled`；Terraform也保存同一基線，避免後續apply移除。
- Legacy Cloud SQL package明確排除`062_dev010_neutral_schema_boundary.sql`；該migration屬三系統DEV-010 release orchestrator，不可由`pdm_migration` runner冒充。Current legacy package為54支：既有53支＋location-aware 063，最高063。
- Production verify納入DEV-116與DEV-010 N2D gate。後續source drift已由三repo重新freeze並以clean worktree完成48／48 aggregate；未修改expected hash，也未用開發工作目錄冒充release candidate。

## R04成本結果

新增`config/production-smoke-cost-policy.json`與`production:smoke-cost-gate`。價格snapshot日期為2026-09-04，來源只允許Google Cloud官方頁，超過30日即NO-GO；計算刻意不扣free tier。

| 項目 | Upper bound |
|---|---:|
| 單次完整write smoke | USD 0.020812 |
| 每月最多10次 | USD 0.208120 |
| 新固定SKU | 0 |
| 核准界線 | USD 0.10/run；USD 1/month |

此值只涵蓋例行DEV-116 smoke增量，不把DEV-010 shared production topology成本混入。Current決策已選ZONAL dedicated-core；未來若另行升級REGIONAL，增加的是三系統production architecture固定成本，不是company-smoke造成的成本。

## Gate結果

- Static／package gates：migration package `15/15 PASS`、production pipeline `24/24 PASS`、DEV-095 `20/20 PASS`、DEV-106 `25/25 PASS`、workflow YAML parse PASS。
- R01 adapter regression：`DEV116-R01-ADAPTER-20260904-R1`固定`31/31 PASS`，含正常瀏覽器登入／建立／commit／reload、response-loss同key收斂、雙tenant zero-leak、side-effect disabled readback與六種mutant；證據仍明確為`claimLevel=local-foundation`、`productionLevel4Claimed=false`，所有task-owned browser／Next／PostgreSQL runtime與ports均已清理。
- DEV-010 R1 preflight：current capacity v2 unit `5/5 PASS`、preflight v3 unit `15/15 PASS`、release-adapter v2 unit `11/11 PASS`，三項focused QC均PASS。Tampered lock／tree drift／post-lock staged drift／untracked required source、舊REGIONAL、R1-07 receipt drift與R1-11 numeric overrun皆有fail-closed coverage；current preflight列9項human／target／capacity blocker。Production／cloud／traffic mutations均為0。Evidence=`../Jenfu-Management-system/output/dev-010/r1/REL-116-20260904/`。
- DEV-010 R1A source classification：unit `5/5 PASS`；classified commits、N2 clean requalification與post-commit HEAD＋tree lock完成，generated-local不進release source；並另有preflight unit `14/14 PASS`。
- R04 cost policy precheck：以current source revision `80770f2db257374725414456efeb0f0d0302da0f`計算為PASS；這不是最終release commit綁定證據，source freeze後必須重新產生。
- AI-PDM R02 receipt gate：schema／hash／redaction／candidate／actor／company／commit-readback／Jenfu invariant／side-effect verifier與Platform projection已實作，unit `5/5 PASS`；既有generic production smoke明確不得輸出Level 4 claim。這不是authenticated candidate execution，R02仍`NOT_RUN`。
- R01：`BLOCKED`。N2 source requalification與ZONAL machine contract focused QC已完成；current阻塞為neutral project identity、RTO／RPO、owners／maintenance、R1-11 numeric capacity，以及DEV-010 R1 15案provider execution。
- DEV-010 R1 executable gate：`PARTIAL`。R1A exact source已freeze、current machine contract、strict receipt validators與R1-11 provider executor source已完成；正式foundation apply、R1-11 provider run及其餘14案仍未執行，neutral project identity仍ambiguous。
- R02／R03：`NOT_RUN`。
- Production data writes：`0`；deploy：`0`；traffic change：`0`；principal provisioning：`0`。

## Human re-entry

下一個有風險動作不是DEV-116 candidate，而是先把跨`Jenfu-Management-system / OrgMaster / AI_PDM`的DEV-010 R1補成可重現release contract。恢復條件為：

1. Machine contract／schema／tests前向更新與focused QC已完成；下一步驗證preferred neutral project identity，補正整數RTO、非負整數RPO、budget／restore／incident／maintenance owners及maintenance window。Current legacy `db-f1-micro`不得被誤當neutral production end state。
2. Platform的R1-11 provider executor source與獨立QC已完成；在8項foundation blocker清零並另行明確建立零流量candidate後，才執行兩輪數值容量並產生R1-11 receipt。其餘`QA-010-R1-01～15`case executor／receipts仍由Platform owner逐案完成；R1-07的AI-PDM子流程須與`QA-116-R02`共用exact `company-smoke` receipt。AI-PDM receipt verifier已完成，但authenticated browser execution仍缺；不可臨場拼接production shell commands。
3. 15案rehearsal全PASS後才可依3A執行live migration；任一案未PASS即停止。
4. Traffic promotion不在3A內，仍須Product Owner獨立GO。

上述決策完成前，本文件禁止用opaque evidence ref手動繞過candidate gate。

使用思考習慣：#風險優先、#底層依賴、#證據閉環、#可回復性設計
