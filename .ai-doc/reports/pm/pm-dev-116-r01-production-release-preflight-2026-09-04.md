# DEV-116-R R01 Production Release Preflight

日期：2026-09-04
Release ID：`REL-116-20260904`
狀態：`R01 started / fail-closed / DEV-010 R1 dependency blocked / production data writes 0`

## 結論

DEV-116可以依序解鎖，但不能從local foundation直接跳到Production write smoke。正式Cloud SQL唯讀盤點證明目前仍是第一版legacy topology；`062`所需的neutral schemas、roles與Platform／OrgMaster contracts均不存在。使用者已完成1A classified source commit授權、2A `REGIONAL_DEDICATED`選擇與3A「15案全PASS後才live migration」授權；尚未套用`063`、建立smoke principal、部署candidate或切換流量。

正確順序固定為：

1. `DEV-116 legacy 063`：使用現有AI-PDM migration identity在legacy `public` layout完成backup／restore rehearsal後套用location-aware 063。
2. `DEV-010 R1`：由三系統release orchestrator依producer-first graph建立neutral roles/contracts並移動三app schema；不得由AI-PDM legacy runner執行062。
3. `DEV-116 R01`：讀回`company-smoke`、專用corporate principal、single membership、active OrgMaster mapping、sequence/audit/read-model zero leak與三個side-effect flags。
4. `DEV-116 R02`：對zero-traffic candidate走正常Production登入與UI，真實commit一個root＋part＋drawing bundle，reload/readback；只有此步可稱Production Level 4。
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

權威QA plan第7節原本只凍結`QA-010-R1-01～15`。本輪已在Platform repo補上`010-R1A` local preflight adapter，把clean source、exact SHA、15案registry、target identity、availability／tier與live-migration approval變成machine gate；它刻意沒有production apply能力。真正R1 production rehearsal／apply runner仍不存在，故不得用臨場shell命令直接操作正式schema、data或authority。

| Component | Branch／HEAD | Dirty entries | Existing N2 freeze first failure | R1 runner |
|---|---|---:|---|---|
| Platform | `main / 487e135f39d1` | 1556 files | `ALLOWLIST_DRIFT: config/dev-010/n1b-managed-nonprod.json` | local preflight present；production runner absent |
| OrgMaster | `master / c8cc16f515f0` | 185 files | `ALLOWLIST_DRIFT: AGENTS.md` | production runner absent |
| AI-PDM | `持續優化2 / 80770f2db257` | 59 files | `HASH_MISMATCH: db/postgres/001_initial_schema.sql` | production runner absent |

`gcloud projects describe jenfu-platform-prod`只得到`permission denied or project may not exist`，因此preferred neutral project ID仍是ambiguous，不可宣稱已保留或可用。Machine evidence：`output/production-release/REL-116-20260904/r01-cross-repo-readiness.json`。

R1A source classifier初始盤點：Platform=`185 release + 28 governance + 1343 generated`、OrgMaster=`164 + 17 + 4`、AI-PDM=`39 + 10 + 10`；unknown=0、secret-local=0。1A後只有release／governance source進commit，generated-local排除；post-commit lock再以exact HEAD＋tree封存，避免tracked config自我參照。Evidence=`../Jenfu-Management-system/output/dev-010/r1/REL-116-20260904/source-classification.json`與`release-source-lock.json`。

## Release adapter correction

- Workflow改為三個獨立dispatch：`prepare → candidate → promote`。Prepare只建置一次並輸出immutable app/migration digests與manifest hash；candidate不得重建artifact。
- Candidate需要manifest-bound migration evidence、DEV-010 R1 evidence、dedicated smoke-principal evidence與current cost evidence，缺一即停止。
- Cloud Run candidate／promotion均逐項讀回`PDM_SMOKE_GCS_WRITER`、`PDM_SMOKE_OUTBOX_CONSUMER`、`PDM_SMOKE_EXTERNAL_NOTIFICATION`為`disabled`；Terraform也保存同一基線，避免後續apply移除。
- Legacy Cloud SQL package明確排除`062_dev010_neutral_schema_boundary.sql`；該migration屬三系統DEV-010 release orchestrator，不可由`pdm_migration` runner冒充。Current legacy package為54支：既有53支＋location-aware 063，最高063。
- Production verify納入DEV-116與DEV-010 N2D gate。現行DEV-010 N2D因DEV-116 source drift而正確FAIL，必須由三repo重新freeze／aggregate，不能修改expected hash取得假PASS。

## R04成本結果

新增`config/production-smoke-cost-policy.json`與`production:smoke-cost-gate`。價格snapshot日期為2026-09-04，來源只允許Google Cloud官方頁，超過30日即NO-GO；計算刻意不扣free tier。

| 項目 | Upper bound |
|---|---:|
| 單次完整write smoke | USD 0.020812 |
| 每月最多10次 | USD 0.208120 |
| 新固定SKU | 0 |
| 核准界線 | USD 0.10/run；USD 1/month |

此值只涵蓋例行DEV-116 smoke增量，不把DEV-010 shared production topology／HA升級成本混入。Current Cloud SQL實際是ZONAL；若DEV-010選REGIONAL HA，增加的是三系統production architecture固定成本，不是company-smoke造成的成本。

## Gate結果

- Static／package gates：migration package `15/15 PASS`、production pipeline `24/24 PASS`、DEV-095 `20/20 PASS`、DEV-106 `25/25 PASS`、workflow YAML parse PASS。
- R01 adapter regression：`DEV116-R01-ADAPTER-20260904-R1`固定`31/31 PASS`，含正常瀏覽器登入／建立／commit／reload、response-loss同key收斂、雙tenant zero-leak、side-effect disabled readback與六種mutant；證據仍明確為`claimLevel=local-foundation`、`productionLevel4Claimed=false`，所有task-owned browser／Next／PostgreSQL runtime與ports均已清理。
- DEV-010 R1A preflight：v2 unit `13/13 PASS`；新增tampered lock、tree drift與post-lock staged drift negative gates。後續未stage工作樹開發會列為excluded，release runner只能使用clean locked worktree。Current `REL-116-20260904`只剩neutral target identity與exact tier兩項blocker，production／cloud／traffic mutations均為0。Evidence=`../Jenfu-Management-system/output/dev-010/r1/REL-116-20260904/preflight.json`。
- DEV-010 R1A source classification：unit `5/5 PASS`；classified commits、N2 re-freeze與post-commit lock完成，generated-local不進release source。
- R04 cost policy precheck：以current source revision `80770f2db257374725414456efeb0f0d0302da0f`計算為PASS；這不是最終release commit綁定證據，source freeze後必須重新產生。
- R01：`BLOCKED`。原因為DEV-010 R1未執行且current DEV-010 N2 source manifest已被後續合法變更失效。
- DEV-010 R1 executable gate：`PARTIAL`。R1A exact source已freeze；production rehearsal／apply runner尚待完成，neutral project identity仍ambiguous且exact REGIONAL dedicated-core tier／cost未核定。
- R02／R03：`NOT_RUN`。
- Production data writes：`0`；deploy：`0`；traffic change：`0`；principal provisioning：`0`。

## Human re-entry

下一個有風險動作不是DEV-116 candidate，而是先把跨`Jenfu-Management-system / OrgMaster / AI_PDM`的DEV-010 R1補成可重現release contract。恢復條件為：

1. 驗證preferred neutral project identity，並依N2容量／連線證據核定exact `REGIONAL` dedicated-core tier與成本owner；current legacy `db-f1-micro`不得被誤當neutral production end state。
2. 由Platform owner實作、獨立驗證DEV-010 R1 project release adapter，逐案產生`QA-010-R1-01～15`machine receipts；不可臨場拼接production shell commands。
3. 15案rehearsal全PASS後才可依3A執行live migration；任一案未PASS即停止。
4. Traffic promotion不在3A內，仍須Product Owner獨立GO。

上述決策完成前，本文件禁止用opaque evidence ref手動繞過candidate gate。

使用思考習慣：#風險優先、#底層依賴、#證據閉環、#可回復性設計
