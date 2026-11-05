# DEV-127 驗證狀態與下一步

更新：2026-11-06（Asia/Taipei）。本頁整理既有證據與缺口，不宣稱獨立QC或產品驗收。唯一工程契約與live狀態見[spec §8.4](../specs/DEV-127-platform-super-admin-consumer-contract.md#84-唯一當前進度與下一步)，原完整接受分母見[spec §6.3](../specs/DEV-127-platform-super-admin-consumer-contract.md#63-normal-ui-acceptance)。

程式／SQL受測source：`434f32925ac23945aeedb6db2cef0a62287c379e`；[PR571](https://github.com/jedchang0308-jenfu/AI-PDM/pull/571) OPEN/DRAFT。本次文件更新不修改程式／SQL，也不執行primary或production寫入。

| 證據層 | 判定 | 支持的行為／限制 |
|---|---|---|
| Bounded source review | 無未解P1/P2 | 本session TL核434 closed CLI/bridge/097/原096、shared executor與mock/native證據，記錄於PR571；不宣稱獨立產品QC或primary前置已成立 |
| Local Node／source | 18 PASS；RD自查 | plan/source/metadata/ledger drift、wrong role／quota／SID、runtime無DDL、bounded raw reader、atomic ledger順序、unknown只fresh read；ESLint/diff與PR-base DB boundary34 PASS |
| CI disposable PostgreSQL | PASS，1/1，0 skipped | [42120180413](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/42120180413) Linux required SUCCESS。新component真跑缺grant-option整筆rollback、原097＋原096安裝、實際ACL/owner、舊rows與owners保留、COMMIT斷線fresh原ledger、catalog CAS及原receipt；producer明示synthetic，DB由此job自建nonce marker，不含primary資料 |
| 同SHA Windows required QC | SUCCESS | 同run的Production Slice QC完成，兩項required checks均SUCCESS。Verify isolated application candidate成功、Full isolated release candidate skipped；不稱full release build或真人UI PASS |
| 真primary-local readonly | e855時PLANNED | 真profile／owned OS／exactDEV migrator OIDC／runtime／inventory只讀計畫；artifact SHA=`b203719321ceeb85d6b9bdce44305d27dcbe678863aa0197ad885d4bca891fe4`。未DDL或catalog寫入；434含新marker與scope，Org前置亦將變，必須重plan |
| Primary-local install與catalog | NOT_RUN | 最近只讀PDM ledger53 rows、v2 view有／v3無；未實際套local097／096、未升v2 catalog、未本地授app管理任用 |
| Production owner release | NOT_RUN | protected merged source、provider migration／finalize/catalog／grant／traffic等正常owner證據仍須取得；CI不是部署 |
| 同本人兩環境正常Google/UI | NOT_RUN／NOT_ACCEPTED | `jedchang0308@jenfu.com.tw`／張仕杰`JFS0005`，真human_personal AAL1最低、保留有效AAL2；Platform root/admin、PDM app-admin正常UI、中文名/reload、business-write拒絕均須依原分母逐環境觀察 |

保留的首敗與scope：004真readonly plan的JSON OID表示差異、004 CI connectionString覆蓋DB、e855/db40 CI Docker bridge地址，均已定位修正，精簡證據表見spec §8.6。三輪Windows各自SUCCESS與Linux失敗分開；434新Linux component另外實際PASS。Windows open-file rename受到OS EPERM保護，不冒稱它走過Linux reader inode branch。本機jsdom／capacity-blocked build保留原NOT_RUN；本次未新建local PostgreSQL、未降低capacity policy。

下一步按依賴接續：

1. 434兩項requiredCI及bounded localbridge TLsource review已閉合。文件提交後取得最終clean source／其必要CI；有新失敗沿同PR修正受影響部分，不套用舊綠燈。
2. 各owner完成Org044/045及三個versioned contract的真local ACL；coordinator以最終clean source、fixed127/known DB/known marker、真migrator OIDC重新readonly plan。舊plan及CAS不改寫、不沿用。
3. 在原授權與review／required CI條件下，才由coordinator接primary-local atomic install→原ledger readback→catalog plan/CAS/原receipt；unknown先status/fresh read，不重送writer。
4. 以同一指定本人完成地端與production正常Google/UI及各owner正常release；app管理grant不得變business全權或跨app權限，不能用fixture／CLI／SQL或替代帳號頂替本人驗收。

目前沒有新的產品決策或使用者核准問題；上述是仍待工程與驗證的工作，文件整理不使其自動完成。
