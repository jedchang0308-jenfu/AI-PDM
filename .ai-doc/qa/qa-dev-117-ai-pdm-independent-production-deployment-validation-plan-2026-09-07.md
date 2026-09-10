# QA-DEV-117：AI_PDM 獨立正式部署 adapter 驗證計畫

> **2026-09-10 R20 amendment**：新增app-infra驗證：APP_INFRA_B additional exact set必含`google_service_account_iam_member.builder_act_as_self`且stage A不得含，resource target與member都須為`aipdm-prod-builder`，role須為`roles/iam.serviceAccountUser`；任何OrgMaster／Platform／runtime／deployer／verifier member為FAIL。R20在OrgMaster build 403後停止，R21舊分類作廢，AI-PDM未dispatch且不可計為production PASS。

> **2026-09-08 DEV-012 S1C amendment（V2 historical；current見§15）**：當時新增owner production-entry驗證，固定official repo=`jedchang0308-jenfu/AI-PDM`、branch=`main`；驗source-freeze／runtime-config／release-intent native chain、shared-LB host binding、candidate期間`internal`與activation後`internal-and-cloud-load-balancing`、own Workflows smoke SA＋OIDC、Firebase refresh token numeric Secret及legacy Hosting不被改指neutral target。Public `run.app`在該V2方案為FAIL；此入口判定已由§15 V3 direct-run contract取代。其local結果只保留為V2 provenance，不得作current release authority。

- 文件成熟度：`V3 Architecture Finalized / RD Tech Lead PASS / Owner QA Contract Executed；v1／v2 Historical`
- 狀態：`V3 Owner PASS / S1B-20 PASS / DEV-012 S1C 8／8 PASS / S2 Unlocked, Not Started / Production NOT_RUN`
- 日期：2026-09-09
- 來源 DEV：`DEV-117 / DEV-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001`
- 規格 authority：[DEV-117 SPEC §26](../specs/SPEC-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001-app-owned-release-adapter.md)
- Machine registry：[dev-117-current-case-registry.json](dev-117-current-case-registry.json)
- 角色邊界：QA定義驗證；RD可新增測試／adapter；QC依凍結案例執行且不修改產品或文件

## 1. 驗證目標

證明 AI_PDM 能在不部署、切換或回復 Jenfu-Platform 的前提下，建立一條可重現、fail-closed、可回復的
app-owned production release lane。§§1～14保留v1／v2 source與local machine contract；current QA authority為§15。
正式provider artifact、candidate、Production Level 4、promotion、canonical smoke與live receipt仍屬DEV-012
S2／S3，不能以fixture或legacy結果冒充。

## 2. Evidence layers

| Layer | Current S1 | Future R1 | 不可替代 |
|---|---|---|---|
| L1 Source／contract | profile、workflow、validator、tests、source hash | frozen release commit／tree | dirty worktree、聊天文字 |
| L2 Local execution | unit、mutant、static workflow、isolated build、DB boundary | provider CLI dry check | staging／legacy pipeline PASS |
| L3 Provider candidate | NOT_RUN | artifact、service／revision、IAM／Secret／traffic readback | local fixtures、自由文字 URL |
| L4 User flow | NOT_RUN | DEV-116 R02 authenticated `company-smoke` commit＋reload | generic smoke、rollback-only |
| L5 Canonical live | NOT_RUN | `pdm.jenfu.com.tw` post-promotion smoke＋receipt | candidate URL、legacy hosting URL |

## 3. Fixed denominator

固定分母為 `QA-117-001..012`。實作中不得刪除、合併或以新的 PASS case補分母；若契約改變，先更新 SPEC、
取得使用者確認並以新版本明列被取代案例。Current S1可完成所有12案的 source／local oracle，但案例中的 provider
assertion只能標示 `CONTRACT_PASS / PROVIDER_NOT_RUN`，不得改寫為 production PASS。

## 4. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| legacy target被當成neutral | 沿用舊workflow常數 | 部署完成判定錯誤 | project／origin／identity mutant | P0 | QA-117-002硬拒絕 |
| Platform與AI-PDM被一起部署 | combined workflow／image | 無法獨立回復 | source inventory＋mutation manifest | P0 | QA-117-003／009 |
| candidate建立時已承接流量 | first revision語意錯誤 | 未驗證版本暴露 | missing-service fixture＋traffic readback | P0 | QA-117-005／006 |
| candidate stage偷建驗證tag | access approval與candidate耦合 | 未核准入口可達 | workflow graph／tag readback | P0 | QA-117-006／007 |
| artifact在candidate階段重建 | mutable tag或未join prepare receipt | source／binary漂移 | digest／provenance join mutant | P0 | QA-117-003／006 |
| shared DB gate被app繞過 | DEV-117自行建role／migration | 跨app資料或權限破壞 | command allowlist＋DB boundary | P0 | QA-117-004 |
| Secret使用`latest`或payload落盤 | workflow方便化 | 不可回溯／憑證洩漏 | YAML／receipt redaction scan | P0 | QA-117-004／012 |
| local或legacy smoke冒充L4 | claim ladder缺失 | 未驗證production write path | receipt environment／candidate join | P0 | QA-117-007 |
| `company-smoke`洩漏到Jenfu | tenant predicate／side effect drift | 正式資料污染 | DEV-116 zero-leak／before-after | P0 | QA-117-008 |
| promotion同dispatch自動執行 | workflow耦合 | 無人類GO即切流 | dispatch graph static mutant | P0 | QA-117-010 |
| rollback需同時回復Platform | traffic owner未分離 | 雙系統中斷 | before／after provider diff | P0 | QA-117-009／011 |
| canonical URL仍是legacy | DNS／receipt未更新 | Portal導向錯誤 | exact URL與browser smoke | P1 | QA-117-010／012 |
| outcome unknown被重跑 | 無progress ledger | 重複mutation | interruption fixture | P1 | QA-117-006／011 |

## 5. Test data 與 fixtures

- `valid-neutral-profile.json`：exact `jenfu-platform-prod / ai-pdm-prod / pdm.jenfu.com.tw`。
- `legacy-project-mutant.json`、`legacy-origin-mutant.json`、`legacy-identity-mutant.json`。
- existing-service與missing-service兩種provider readback fixture。
- valid／tampered source lock、artifact、shared gate、candidate、DEV-116 R02及app release receipts。
- candidate traffic `0 / 1 / 100`、tag present／absent、numeric／latest Secret version mutants。
- Platform before／after service inventory fixture，只有AI-PDM revision或traffic允許差異。
- outcome-unknown progress ledger與safe resolved readback fixture。

Fixture不得包含真實credential、token、cookie、Secret payload或個資；hash可重現且產生器必須由測試鎖定。

## 6. Fixed cases

### QA-117-001 — clean source freeze

- 前置：valid profile與clean test repository fixture。
- 操作：執行source-lock producer；再注入dirty required file、untracked required source、commit／tree drift。
- PASS：clean fixture產生self-hashed `FROZEN` receipt；任一drift均 `INVALIDATED`且不進artifact stage。
- Evidence：source-lock receipt、mutant results、providerCalls=0。

### QA-117-002 — neutral target exactness／legacy deny

- 前置：neutral與三個legacy mutant profiles。
- 操作：依序驗證project、region、service、identity、Cloud SQL、schema、origin。
- PASS：只有第7節exact target通過；`jenfu-ai-pdm-prod`、legacy Firebase URL與legacy identity全部FAIL。
- Evidence：profile validator report、forbidden-values matrix。

### QA-117-003 — AI_PDM-only immutable artifact

- 前置：valid source lock、artifact receipt及combined／mutable／digest-drift mutants。
- 操作：驗source、builder、linux/amd64、OCI digest、SBOM、provenance、scan與repository boundary。
- PASS：只有AI_PDM-only exact digest且HIGH／CRITICAL=0通過；candidate stage無build command。
- Evidence：artifact contract report、workflow static scan、mutation manifest。

### QA-117-004 — environment／Secret／DB least privilege

- 前置：valid runtime manifest及latest-secret、owner-role、foreign-core、manual-DDL mutants。
- 操作：驗plain env、numeric enabled Secret refs、runtime identity、role membership、schema與command allowlist。
- PASS：只允許AI schemas與runtime role；Secret payload read、`latest`、owner／DDL／migrator權限、其他`*_core`全部FAIL。
- Evidence：runtime manifest report、`npm run check:db-boundary`、mutant results。

### QA-117-005 — first-revision holding safety

- 前置：existing-service與missing-service fixtures。
- 操作：執行candidate plan producer。
- PASS：existing service不得執行holding；missing service先要求DEV-010 R1-04F valid 503-only／no-role receipt，
  且不得宣稱第一revision為0% candidate。
- Evidence：plan、conditional branch coverage、holding receipt validator。

### QA-117-006 — digest-only zero-traffic candidate

- 前置：valid prepare／shared／holding receipts與candidate readback fixtures。
- 操作：驗candidate不rebuild、exact digest、revision、0% traffic、no tag、service baseline及outcome ledger。
- PASS：candidate receipt self-hash有效，traffic=0，Platform mutation=0；digest／tag／traffic／unknown重跑mutant全FAIL。
- Evidence：candidate receipt、before／after service diff、progress ledger tests。

### QA-117-007 — independently approved access／same-candidate Production Level 4 join

- 前置：valid candidate、Level4 access、DEV-116 R02 receipt及local／legacy／staging／cross-candidate mutants。
- 操作：驗access是candidate後的獨立approval，fixed tag只指向exact 0% revision，canonical traffic不變；再join
  release、source、digest、revision、target、actor、company、commit-readback與evidence hashes。
- PASS：只有neutral exact candidate的受限access與authenticated R02可進`LEVEL4_VERIFIED`；wildcard、同stage
  建tag、錯revision、過期access或其他evidence一律FAIL。
- Evidence：Level4 access receipt、tag／traffic readback、DEV-116 receipt hash、negative cases。

### QA-117-008 — tenant zero-leak／side-effect disabled

- 前置：DEV-116 R02 fixture含`company-smoke`一個root＋part＋drawing bundle、Jenfu fingerprints與side-effect readback。
- 操作：驗SMOKE single membership、Jenfu before=after、zero leak、GCS／outbox consumer／external notification disabled。
- PASS：business objects只屬`company-smoke`；Jenfu所有受控投影不變；expected quarantine不被cleanup。
- Evidence：browser＋provider joined receipt、DB readback、zero-leak matrix。

### QA-117-009 — cross-app mutation boundary

- 前置：AI_PDM／Platform before-after provider inventories。
- 操作：比較artifact、service、revision、env、Secret metadata與traffic。
- PASS：只允許AI_PDM scope內、stage宣告的差異；Platform service／artifact／traffic任何diff均FAIL。
- Evidence：provider diff receipt、mutation allowlist。

### QA-117-010 — separate promotion／canonical entry

- 前置：candidate、R02、rollback、zero-P0/P1 receipts及Product Owner GO fixture。
- 操作：驗dispatch graph、approval、exact revision promotion及`https://pdm.jenfu.com.tw` smoke contract。
- PASS：prepare／candidate不會自動promote；只有獨立promotion dispatch可切AI_PDM traffic；canonical origin exact。
- Evidence：workflow static graph、promotion request validator、canonical smoke schema。

### QA-117-011 — AI_PDM-only traffic rollback

- 前置：previous neutral revision、candidate revision與failure／outcome-unknown fixtures。
- 操作：模擬post-promotion smoke failure、rollback success／failure及中斷重啟。
- PASS：只將`ai-pdm-prod` traffic回到verified previous neutral revision；不down migrate、不改Platform、不刪revision；
  unknown狀態先readback後才可新run。
- Evidence：traffic before／after、rollback receipt、provider diff、progress ledger。

### QA-117-012 — live receipt／Platform consumption

- 前置：valid live evidence與schema／expiry／URL／credential／hash mutants。
- 操作：產生並驗證 `jenfu.app.release-receipt.v1`，再以Platform DEV-011 validator fixture唯讀消費。
- PASS：固定application／environment／status／canonical origin正確，未過期，self-hash有效，無credential／PII；
  Platform能啟用launch但不能修改或代簽 receipt。
- Evidence：app receipt、consumer decision、redaction report。

## 7. Current S1 execution commands

RD完成後，QC依序執行：

```text
npm run test:dev-117:release-adapter
npm run qc:dev-117:release-adapter
npm run qc:production-deployment-pipeline
npm run check:db-boundary
npm run typecheck:app
npm run build:isolated
```

`qc:dev-117:release-adapter` 必須輸出固定12案 aggregate，包含source fingerprint、case owner、actual／expected、
evidence refs、mutation counters、P0／P1 count、cleanup及self-hash。若任一命令未執行或證據缺失，Current S1只能
`NOT_RUN`或`BLOCKED`，不得以人工敘述改為PASS。

## 8. Future R1 provider execution order

1. 建立fresh `REL-*`、freeze clean main source。
2. 執行DEV-117 prepare，取得provider-attested AI_PDM artifact receipt。
3. 驗DEV-010 shared gate；若service不存在，先執行R1-04F holding。
4. 以prepare exact digest建立0%且no-tag的AI_PDM candidate並provider readback。
5. 另行核准`level4-access`，將fixed tag綁exact candidate並引用authorized-domain／origin allowlist receipt；
   canonical traffic維持不變。
6. 執行DEV-116 R01與R02，完成same-candidate authenticated Level 4。
7. 完成rollback readiness、zero open P0/P1與必要observation；等待Product Owner獨立GO。
8. promotion只切AI_PDM traffic；執行canonical browser／API／DB smoke與error sweep。
9. 成功後簽發live receipt；失敗則traffic-only rollback並保留 evidence。

每一步須以前一步fresh typed receipt為input；不可跨release／source／candidate拼接。

## 9. Future canonical user flow

- 未登入：開啟 `https://pdm.jenfu.com.tw/login`，完成共同identity登入並建立AI_PDM host-only session。
- 已登入有權限：進入AI_PDM dashboard／工作臺，API與UI不出現visible error，關鍵counter符合provider readback。
- 無權限／session失效：server fail-closed且不洩漏tenant資料；不得只靠UI隱藏。
- Portal launch：Platform只在有效AI_PDM live receipt時導向canonical origin，不附token／credential query。
- candidate Level 4：受限authenticated URL只用`company-smoke`，不以canonical user traffic執行。

Future QC必須執行hard reload、login、主流程、visible error sweep、`[role=alert]`／HTTP 4xx/5xx檢查、console／network
error與data sanity；任何意外空資料或全零critical counter都視為FAIL，不能以direct API PASS覆蓋畫面失敗。

## 10. Pass／Fail／Blocked

- `PASS`：該案例所有必要layer與exact target evidence完整；Current S1只可宣稱local contract PASS。
- `FAIL`：預期與實際矛盾、mutant未被攔截、跨app mutation、target／digest／traffic／receipt漂移或可見錯誤。
- `BLOCKED`：必要source、provider、credential、billing、DEV-010或user decision缺失，且在任何不可逆動作前停止。
- `NOT_RUN`：尚未執行；不得計入分子。
- `UNVERIFIED`：執行過但缺必要evidence；不得等同PASS。

## 11. Current expected result

- 文件：`QA Contract Executed`。
- RD：`117-S1 IMPLEMENTED`。
- QA-117-001..012：`12/12 CONTRACT_PASS / PROVIDER_NOT_RUN`，P0／P1=`0/0`。
- Final aggregate：`output/qa/dev-117-independent-release/20260907T132932Z/aggregate-manifest.json`；
  evidence SHA-256=`f3445b374d8ecd0a52c609892c25cb6d1dfaa80be45332ca497cf3bd624dcd3e`。
- Cloud／DB／traffic／DNS mutation：0。
- QC commands：DEV-117 test／aggregate、legacy pipeline 25/25、DB boundary、typecheck與isolated build均PASS；
  isolated build primary invariant與cleanup PASS，runtime／port residue=0。
- Current source observation：工作樹不是clean `main`，因此preflight為`INVALIDATED / BLOCKED`；沒有將本機
  contract PASS冒充production readiness。
- 下一步：先將reviewed S1 changes收斂至clean `origin/main`並建立fresh `REL-117-*` source lock；其後仍須
  neutral billing、DEV-010 shared provider receipts與另行production release授權，才能執行prepare。

使用思考習慣：#可驗證性、#反事實測試、#風險優先

## 12. DEV-012 continuous v2 validation amendment（historical；current見§15）

舊 QA-117-001..012 與其 six-stage workflow證據保留為 v1 historical denominator，不得用來宣稱 v2 continuous release已完成。v2 owner主案例為 Platform DEV-012 QA 的 `S1B-20`，並共同接受 `S1B-01～06／08～18／22～24` 中與 AI_PDM owner slice有關的正負 oracle；上游完整文件 SHA-256=`a1bff69cc3f54775fb193c6fb0ba2d2ce6a89e89f7e4aa4edc0433c6780211c1`、§25～EOF SHA-256=`52eca43d8e09505ae8ca9f9c90b1fa9286143898b738825ea5485b589acae5b2`。

S1B-20 必須同時證明：continuous v2 保留 v1 strict validator；exact neutral target與pool8；current 14-entry ordered migration分類／checksum；DEV-116 R02 exact native join；Email/Password登入不含TOTP enrollment、challenge UI或client resolver；single-capsule workflow沒有 stage／approve／skip／receipt輸入；同 fingerprint不重 build；own registry／bucket／service／state／OIDC／IAM deny；abort controller在重送、crash前後、412與 unknown outcome 下只回復 own exact revision。禁止修改 DEV-116 producer、使用 company-jenfu、漏 migration、殘留TOTP登入分支、把六段人工 GO 或 local fixture冒充 production。

固定 owner commands為：

```text
npm run test:dev-117:continuous
npm run qc:dev-117:continuous
npm run test:dev-117:abort
npm run check:db-boundary
npm run typecheck:app
npm run build:isolated
terraform fmt -check / init -backend=false / validate（dev-117-production-release）
git diff --check
```

每份結果必須綁同一 source／contract hash，列出 case、providerMutationSummary、cleanup與native evidence refs。Local fixture=`LOCAL_CONTRACT`，受控 non-serving target=`CONTROLLED_PROVIDER`；Production Level 4、Billing／quota、正式 migration、candidate、traffic與canonical均仍屬 DEV-012 S2／S3，不得預填 PASS。

## 13. `CONTINUOUS_NO_DWELL_V2` QA amendment

依DEV-012 §25，原continuous owner結果由新契約取代並須重跑。S1B-20固定增加以下oracle：release intent不得預填artifact／candidate／decision；application digest、migration bundle與pinned generic runner必須同source authority並有native readback；workflow exact九階段包含`migrate`；production job只用aipdm migrator與exact 14-entry manifest；ledger／schema／ACL readback先於candidate；inactive exact revision以唯一temporary tag提供DEV-116 R02入口且general traffic不變；machine decision、activation、canonical與tag cleanup皆有immutable receipt。

負例至少包含：build前要求digest、staging／legacy DB或runner、execution done冒migration PASS、deployer actAs migrator、漏migration job、candidate無可達驗證URL、任意tag／LATEST receipt authority、tag取得一般流量、run中真人GO、placeholder throw／echo仍在正式路徑、tag cleanup失敗、舊serving revision不相容。全部只能用local／recorded transport驗證；production evidence維持NOT_RUN。
## 14. DEV-012 §26 runtime bridge 驗證補充

S1B-20／S1B-15須證明一容器holding baseline可透過已驗章runtime config建立`ai-pdm`＋固定Cloud SQL proxy的兩容器0% candidate；缺proxy、mutable tag、非numeric Secret、漏plain env、錯VPC／runtime SA／probe／resource或一般traffic變更皆在provider write前FAIL。

## 15. `CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP` current QA contract and result

本節依SPEC §26及Platform DEV-012 §29前向取代§§12～14中custom-domain、shared edge與nine-stage的current oracle；共同contract SHA-256=`857f8a94ab13f63071156f85e76e5c675b348588b1126c147e0e54b431b6e8c5`。v1十二案與V2 S1B-20保留歷史，V3 delta由Platform S1C-01～08固定驗證。2026-09-10補充oracle：owner profile必含共同身分`on`、entitlement `enforce`及exact shared identity tuple，runtime-config以任一fixed value漂移作負向案例並須在provider write前FAIL。

2026-09-10再補shared-foundation handoff oracle：AI-PDM intent只接受own-bucket foundation mirror，bytes須等於Platform provider receipt；只有foundation可保留`shared-foundation` owner與Platform source provenance，infra/runtime owner或source drift仍FAIL。R15／R16安全停止不算正式PASS，須由fresh cohort重證。

2026-09-10再補cross-OS／cross-Git source identity oracle：`git ls-tree -r -z --full-tree <revision>` canonical tree manifest的`sourceSha256`須在source lock與GitHub runner一致；build上傳的gzip物件是獨立transport，擁有自己的GCS bytes SHA，不與identity SHA混用。任何直接比較跨環境gzip／raw-tar bytes、tree manifest drift、空archive或identity fail後仍呼叫Cloud Build都FAIL；R18／R19不計正式PASS。

| Gate | Current oracle | 結果 |
|---|---|---|
| Owner authority | V3 profile由AI-PDM擁有且hash exact；central只hash-ref；V2 bytes不變 | PASS |
| Control flow | 十stage，`candidate→entrypoint→verify` receipt鏈不斷，run中human action=0 | PASS |
| Entrypoint | fresh etag、exact三欄mask、template／traffic零漂移、no-op與unknown readback | PASS |
| Origin／Auth | canonical＋單一exact `PDM_RELEASE_CANDIDATE_ORIGIN`；wildcard／legacy host拒絕；session／CSRF／permission不退化 | PASS |
| Recovery | own traffic rollback→tag cleanup→entry baseline restore；already-direct baseline為no-op | PASS |
| Edge／scope | Hosting／LB／DNS=`RETAINED_UNUSED_EDGE`；TOTP、DEV-116 producer、legacy state及sibling均no-touch | PASS |
| Engineering exit | owner test、DB boundary、typecheck、isolated build、diff、central S1C aggregate與cleanup | PASS |

Current evidence=`../../../Jenfu-Platform/output/dev-012/s1c/2026-09-09T111340-014Z/qc-report.json`，SHA-256=`bbd767fffb6364a770586cfe6122269ef1095184244a5ed4b2047d05d48b2b7f`。結果S1A 32／32、S1B 24／24、S1C 8／8，V3 Terraform validation PASS，scope=`LOCAL_RECORDED_PROVIDER`、`releaseAuthority=false`；只證明Architecture Finalized與V3 source implementation，正式Billing／quota、migration、candidate、entrypoint、DEV-116 R02、traffic與canonical仍`NOT_RUN`。
