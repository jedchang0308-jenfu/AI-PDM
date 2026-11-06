# DEV-127 驗證狀態與下一步

更新：2026-11-06（Asia/Taipei）。本頁只記錄可追溯證據及未完成範圍，不宣稱獨立QC或產品驗收。唯一工程契約與current status見[spec §8.4](../specs/DEV-127-platform-super-admin-consumer-contract.md#84-唯一當前進度與下一步)，完整接受分母見[spec §6.3](../specs/DEV-127-platform-super-admin-consumer-contract.md#63-normal-ui-acceptance)。

官方source：[PR #571](https://github.com/jedchang0308-jenfu/AI-PDM/pull/571)已protected merge至`main@2d66b9ffdec00af91638f8771ea3e6edee00b869`，PR head=`95f4f5fec370c533b8f89d53adc745ab7ab0e462`；合併後required CI為42130771577。其後corrective source只修owner runner artifact建置入口與共用build transport，沒有修改SQL／產品授權行為；未執行primary-local或production寫入。

| 證據層 | 判定 | 支持的行為／限制 |
|---|---|---|
| Bounded source review | 無未解P1/P2 | TL review涵蓋closed CLI/bridge/097/原096、shared executor及mock/native evidence，記於PR #571；不是獨立產品QC，也不代表primary前置已成立 |
| 合併後 required CI | 兩個 required jobs SUCCESS | [CI42130771577](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/42130771577)綁exact merge SHA；`DEV-012 Isolated PostgreSQL Cutover`與`Production Slice QC`均成功。isolated application candidate成功；isolated runtime candidate build step與full isolated release candidate skipped，不代表完整release build或部署 |
| SQL component | PASS，1/1，0 skipped；較早source-bound run | [CI42120180413](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/42120180413)在CI自建nonce PostgreSQL驗原097＋原096、缺grant-option整筆rollback、ACL/owner、舊rows保留、unknown commit fresh ledger read、catalog CAS與原receipt。producer為synthetic；此項不和合併後CI另寫成同一次測試 |
| Local RD source自查 | PASS；非獨立QC | Node18 bridge/source檢查、ESLint/diff及PR-base DB boundary34有原記錄；RD自查不是正式target或產品驗收 |
| Formal migration profile | 41 entries；order 41為096 | protected main source的固定profile保留40筆prefix並追加`db/postgres/096_dev127_platform_super_admin_consumer.sql`；local-only 091–095與097不在formal profile。尚未安裝migration或改寫catalog |
| Owner準備包 | Source/runtime refs PROVIDER_VERIFIED | `REL-AIPDM-DEV127-20261106-001`，checkout=`C:/VIBE CODING/.release-checkouts/AI_PDM/dev127-2d66b9ff-20261106`；source SHA=`2d66b9ffdec00af91638f8771ea3e6edee00b869`，artifact SHA256=`2242b3ea1018c97d53eea0bef1db8c3ece838b8d2559187b270f03afc13e9736`／generation=`1793925993585105`；runtime artifact SHA256=`efb181d76ef6fe788bcd7dd7e2ef858bf8e48cd382ed2f77b1a91bafb41e819f`／generation=`1793926105103310`。owner metadata要求保留此checkout/object provider以供release與recovery；handoff scope只有source-freeze/runtime refs，沒有workflow、migration、runtime、traffic、Job、intent或grant apply。immutable refs不是正式零寫入檢查，也不是runtime部署 |
| Runner artifact builder corrective source | LOCAL SOURCE／MOCK PASS，未發布 | `scripts/dev117-build-migration-runner.mjs`唯一immutable own source-lock輸入；固定own checkout／profile／builder／image，重算tree／manifest並provider驗merged PR及兩required CI。runner新mock10例、既有runtime／migration focused53例PASS，非獨立QC且分母重疊；normal createBuild lookup／fence／unknown恢復沿同一transport，原16項closure加YAML為17。affected CI-profile318例PASS（22/267/29）、DB boundary33檔及diff檢查PASS；ESLint PASS；review／PR與CI依本輪provider交付readback，protected merge及main required CI仍待續接；正式Cloud Build／Job rotation未執行 |
| 正式相容性首個 gate | `MIGRATION_RUNNER_SOURCE_REFRESH_REQUIRED` | liveJob43綁runner source=`3720c7cea8f294f086e34a175fdf911283971007`、digest=`2cb13029f309e7b952ef99857f80675dd3beb497a1a70ef91e827b4072e545d9`。需既有normal `APP_INFRA` runner image rotation；尚未build／apply rotation，亦未migration、runtime、traffic或grant |
| Primary-local readonly plan | 舊95f plan為歷史`PLANNED`；不可沿用 | CLI reference SHA=`1cd312aadc2872e532a5a9d411b7ab429abedfc7ad7c5452fc63fe99e46e17c4`；當時ledger53／known marker MATCH，兩Org函數EXECUTE=false、Platform v3 state與兩contract namespace USAGE=true。這不授權write；source／Org044/045／ACL/inventory改變後須以clean owner source重新readonly plan，舊CAS不沿用 |
| Primary-local install／catalog | NOT_RUN | 未執行local097／096、DDL、catalog commit或本地授予app管理任用。早期readonly observation顯示兩schema owner為postgres、migrator缺USAGE/CREATE；仍待各owner完成前置並readback |
| 正式release | NOT_RUN；準備gate未通過 | 未build／apply runner rotation、未建立candidate／runtime、未執行migration／finalize/catalog/grant／traffic。CI與immutable refs均不是部署收據 |
| 同本人兩環境正常Google/UI／完整接受 | NOT_RUN／NOT_ACCEPTED | 指定同一Google個人帳號`jedchang0308@jenfu.com.tw`／張仕杰`JFS0005`。地端與production都需真AAL1最低並保留有效AAL2、Platform root/admin、AI-PDM app-admin、中文姓名/reload、圖號入口、policy create/save/apply/reload及business-write拒絕；app-admin不擴成business或跨app權限。§6.3分母未縮減 |

失敗與未執行證據仍按來源保留：004 readonly plan的JSON OID型別、004 CI connectionString覆寫DB、e855/db40 CI Docker bridge位址均有修正記錄，見spec §8.6；各輪Windows成功與Linux失敗分開。DOM4本機因canonical jsdom前置條件未執行；本機isolated build曾受capacity guard阻擋且未取得lease。沒有為此新增本機資料庫、降低capacity policy或重播正式操作。

下一步依序為：

1. 先完成runner artifact builder corrective source的review、protected merge及exact-main required CI；再以其clean own checkout、既有immutable source-lock執行standalone builder。`APP_INFRA`接續既有normal image rotation，fresh provider readback後重跑compatibility gate；本機mock不代替正式artifact。
2. 各owner完成並提供OrgMaster 044/045及三個versioned contract ACL證據；coordinator以clean merged source、同profile／known marker與真migrator OIDC重做readonly plan。
3. gate和owner前置通過後，按既有sealed workflow執行正式release；primary-local bridge另循atomic install→ledger readback→catalog plan/CAS/receipt。unknown先fresh readonly readback，不重送writer。
4. 以同一指定本人經正常Google/UI完成地端與production完整分母。維持AAL1最低／有效AAL2、權威中文名、Platform root／AI-PDM app-admin／business權限分離。
