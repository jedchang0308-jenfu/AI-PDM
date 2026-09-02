# ADR-PDM-BOM-DOMAIN-002：統一 BOM 組成權威與執行策略延後

狀態：Accepted / Human Confirmed / RD Implemented Locally / RD Tech Lead Reviewed and Corrected / Full QA-QC Passed 54/54 / Production Release Gated
日期：2026-09-01
關聯DEV：DEV-109
取代：ADR-PDM-BOM-PURPOSE-001的current decision；該ADR與DEV-106保留為historical record
Current Contract：SPEC-PDM-BOM-CREATE-PAGE-001 §29～§33

## Context

DEV-106以manufacturing／sales_kit分離「有M圖的製造組立」與「無圖販售組合包」，但後續案例證明這個切法把CAD evidence、BOM composition與ERP fulfillment混在一起：

- 新料號B可能由具SLDPRT的零件A與無圖潤滑油組成，仍需要受控BOM。
- purchased／manufactured、M圖、SLDASM與Child Drawing都不能可靠表示BOM應如何備貨、製造或出貨。
- PDM目前沒有工單、庫存、揀貨或訂單transaction consumer，要求建立者選purpose沒有當期決策效用。
- 現行purpose已進入eligibility、API、UI、snapshot、export與feature flag，形成兩套行為但沒有兩套composition authority的必要。

另一方面，SLDASM確實是「該exact Part有下階結構」的充分證據；Child基本單位則是quantity可被正確理解與封存的必要master data。兩者都不應被建模成BOM type。

## Considered Options

### Option A：保留manufacturing／sales_kit

優點是舊程式改動較少，未來ERP看似可直接消費。缺點是繼續讓PDM替尚不存在的transaction consumer做分類，並以CAD／M圖假設阻擋合法BOM。否決。

### Option B：UI移除purpose，backend保留預設manufacturing

短期最省工，但把產品差異藏成不可見預設；legacy branch、snapshot與export仍持續累積。否決。

### Option C：單一BOM composition domain，execution policy在真實integration boundary另建

建立、版本、審核與發行只回答Parent由哪些Child、數量及locked UOM組成。當ERP／庫存真的需要produce-and-stock或explode-at-fulfillment，再由該integration擁有獨立policy。採用。

### Option D：另建非製造BOM模組

會複製Definition、Draft、editor、review、release與audit authority，長期一致性最差。否決。

## Decision

1. PDM current domain只有BOM，不存在manufacturing BOM或non-manufacturing BOM type。
2. 任一same-company合法assembly Part均可建立或開啟BOM，不以item_kind、M圖、CAD類型或Child Drawing作資格。
3. Existing shared Definition、exact Parent bindings、Draft、Outliner、review與release lifecycle保持唯一writer／authority。
4. Purpose runtime退役；existing value只以nullable legacy_purpose供歷史追溯。New Definition不寫purpose。
5. Existing review／release schema v1／v2與hash保持immutable；new review／release使用schema v3，不含bomPurpose／fulfillmentPolicy。
6. Child Part持有base UOM；BOM line snapshot quantity＋locked UOM。No silent EA、no line-level arbitrary unit、no conversion engine。
7. Active primary SLDASM在formal exact relation唯一成立時，透過upload／relation transaction共用primitive單向晉級Part為assembly；不建立BOM，不解析Child，不自動降級。
8. ERP／inventory execution policy為future integration contract，不得由legacy purpose、CAD、M圖或item_kind推論。
9. New v3 quantity以plain decimal string進API，並以scale-6 integer作SQLite／PostgreSQL唯一持久化authority；既有floating quantity只保留legacy evidence／display compatibility，不參與v3 hash。這是exact encoding，不是conversion engine。
10. SLDASM promotion invariant套用於所有現存formal primary relation writer的final state，包含async authority與SQLite sync numbering／lifecycle paths；不得以queue、trigger或第二writer補洞。

## Authority Boundaries

| Concern | Authority |
|---|---|
| Part identity／structure／base UOM | canonical exact Part Number及existing Part work |
| CAD file kind | Drawing Revision active file binding／file asset |
| Drawing-Part關係 | formal relation authority |
| BOM composition／revision | stable Definition＋exact Parent binding＋Draft |
| Review／release evidence | versioned immutable BOM snapshot |
| Order／inventory／work-order behavior | future ERP／inventory integration policy |

## Consequences

正面：

- 使用者不再回答無當期效用的purpose問題。
- 無圖組件、purchased assembly與含耗材組件都用同一受控BOM。
- CAD evidence只影響Part structure，不再偷偷決定BOM用途。
- 未來execution policy可依具名consumer設計，不污染composition identity。

成本與風險：

- 需要雙provider forward migration、purpose runtime retirement、snapshot v3與legacy decoder共存。
- Part與BOM line需要UOM schema、UI、drift與migration issue處理。
- V3 exact quantity需要nullable scaled欄位與legacy Draft人工重新確認；不得從既有浮點值假造exact migration。
- SLDASM side effect跨Drawing、relation與Part transaction，必須有lock order、idempotency、audit與storage compensation。
- Existing primary data reconciliation是release-gated mutation；historical evidence不能重用成新domain PASS。

## Compatibility and Migration

- 不刪除或重寫PostgreSQL 052與migration history；forward migration必須同時接受pre-052與post-052來源狀態。
- Existing Definitions保留ID、binding與revision lineage；不因相同root自動合併。
- Pending legacy review在cutover前必須清零；Released／Obsolete v1／v2只讀。
- legacy purpose輸入在target API明確拒絕，不採silent ignore。
- Migration issue code採既有code與new code聯集；legacy Draft UOM或exact quantity未決只能建issue並阻擋v3 submit，不預設EA、不回填scaled value。
- Existing SLDASM reconciliation只做exact、same-company、one-way assembly promotion；無target或ambiguous不猜測。

## Re-entry Triggers

- 具名ERP／庫存consumer需要PDM提供可驗收的工單、備貨、揀貨或訂單行為。
- 已確認案例無法以Part base UOM直接表達，必須做conversion、density或supplier packaging。
- 一個Drawing必須對多個primary Part同時提供SLDASM auto-promotion，且現行unique-target產品決策不足。
- BOM composition真的需要第二套review／permission／lifecycle；不得只因顯示需求建立第二writer。

## Rejected Interpretations

- Assembly等於有SLDASM。
- SLDPRT等於single_part。
- Purchased等於非製造BOM。
- 沒有M圖等於sales kit。
- 移除SLDASM等於可以自動降級。
- purpose欄位留著但不顯示就算完成退役。

## RD Implementation Readiness Amendment（2026-09-01）

本ADR的產品決策不變；`SPEC-PDM-BOM-CREATE-PAGE-001` §31已將其升級為repository-level實作契約，§32完成RD技術主管反例審查與直接修正，§33記錄U0→U4本機實作與54/54 QA/QC收據：

- PostgreSQL使用new forward-only 054同時收斂pre-052／post-052；SQLite以task-owned rebuild runner驗證。舊052與migration history不改寫。
- Global lock order固定為root／formal relation scope → Drawing work／file → exact Part；upload先以現成terminal-receipt helper排除replay，再用read-only root hint、DB transaction外storage stage與locked revalidation解決workId入口，PostgreSQL row lock／SQLite `BEGIN IMMEDIATE`都不跨remote storage I/O，SLDASM helper不開第二transaction。
- Current API／DTO、Part UOM／line UOM、scale-6 exact quantity、review／release v3、legacy dispatcher、async／sync formal writer coverage、fault checkpoints、row-local recovery、exact repository paths與package commands已凍結。
- New QA authority固定54案，歷史30／30、48／48與60／60不計入completion。
- Current local result：U0→U4已完成；`output/qa/dev-109-unified/2026-08-31T20-00-15-154Z/aggregate.json`固定54/54 PASS，provider為task-owned PostgreSQL S0／S1 actual 054 apply＋rerun，repository為task-owned SQLite actual create／save／review／release readback；transaction T01～T08是共用primitive的source-contract evidence；typecheck、affected ESLint與isolated build亦通過；`productionWrites=false`。
- Evidence boundary：外部 storage fault injection、正式 upload rollback／compensation inventory、production migration與existing-data SLDASM promotion未執行，仍由deployment/release gate負責；本機54/54不得延伸解讀為production或外部storage runtime PASS。
- Production boundary：production migration／existing-data promotion／deploy／release仍受獨立gate管制，不能由本ADR或本機收據自動授權。
