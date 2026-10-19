# DEV-123 角色權限設定驗證計畫

建立：2026-10-12；修訂：2026-10-19。Owner：`AIPDM/DEV-123`。依[唯一契約](../specs/DEV-123-role-permission-editor-contract.md)及[自用五點精簡](../specs/DEV-123-role-permission-editor-contract.md#dev-123-self-use-simplification)設計。OrgMaster既有九身份任用相容／撤權阻擋切片 `Local Slice Verified`；這不是DEV-123完整editor實作。DEV-123產品及52案整體仍 `NOT_IMPLEMENTED / NOT_RUN`，本輪局部結果見§7實際驗證紀錄；文件自查不稱獨立QC。

## 1. 驗證範圍與方式

保留七角色/五作業/20action、九歷史身份/固定alias、必要後端判權與OrgMaster任用分工。驗證實際未授權、資料完整性及錯誤恢復，不另加租戶開通、計費、公開SLA或SaaS規模條件。

| 層級 | 證明的結果／所需證據 |
|---|---|
| L1 契約/單元 | schema/hash/語意映射/evaluator/input正反；測試輸入、斷言及結果即可，不要browser或SQL欄位 |
| L2 API/原生PG | apply原子性/CAS/防重/ACL/真實allow-deny與競爭；用原生DB讀回/HTTP及必要fault證據，不以mock聲稱交易通過 |
| L3 正常UI | 正常導航/真實控制完成設定、matrix/workbench同值、狀態與viewport；同一旅程留代表畫面/操作及必要API/DB對照，不逐case重拍 |
| L4 真實兩端 | 實際PDM producer與OrgMaster reader/正常任用往返；可用一個連續旅程覆蓋29/30/44/52，simulator不能代替 |

可先完成獨立PDM本地slice；缺L4只阻止相關整合/首次切換或whole宣告。本輪明確進行的是OrgMaster既有九身份相容／撤權阻擋局部切片，可在其授權本機範圍取證；不代表DEV-123 editor、雙端L4或正式環境已完成。未來如需角色化QC，同一人可依序工作，證據不可稱獨立。只在相關source/角色/fixture/路徑/假設改變時補驗受影響案例；SHA或無關文件更新不自動全量重跑，provider-required CI保持。

## 2. Fixture 與正常旅程

後續runtime遵守AGENTS的task-owned資料/PG/工作目錄與process/port/cleanup限制；先確認原始snapshot的既有資料不變條件再建前置fixture，不碰primary或正式資料。相關主資料/foreign-key/隔離build證據可共用同一次有效preflight，不每case重做。

fixture含核准legacy v5/v6/v7及grouped前置版本、九身份/七profile、合法global human_privileged管理者、rd/manager/qa/pdm/custom及mixed roles；workspace A/B只測既有隔離，不代表新增多租戶；external project P1/P2、有效/到期/撤銷direct/delegated任用、採購/生管不同原scope/priority、另一Principal與workload。業務parent資料為合法Released/draft/review/model/package等，記fixture來源與必要mutation。

fixture只能準備條件，不能seed本案欲驗的草稿/角色新增/apply成功或業務結果。L2相容simulator需明示，使用app-owned測試fixture/adapter或owner提供的只讀contract，不由PDM建立/修改OrgMaster schema；隔離L4可由各owner準備自己的TEST_ONLY rollout開始條件，actual publication/任用/停止/恢復仍走受測UI/API；測試binding不能帶正式環境。

主要旅程：正常首頁→設定/流程/角色與權限→建立草稿→矩陣與工作台混合角色/能力編輯→保存/取消/重開→確認差異→**一次套用權限**→讀回active/異動→原session新業務請求allow/deny→停用/恢復。另測view-only分享與原檔下載拒絕。history恢復建立新draft/apply，不直接切舊指標。

## 3. 保留的52項驗收

QA123-01..52及17AC/CG仍保留。使用者2026-10-19已同意五點精簡：舊兩階段、全域business鎖、storage硬門檻的oracle明確改為新行為，並非刪除案例或縮分母。52是驗收目的數，不是必須52個瀏覽器旅程/環境/報告；一個測試可映射多案，各必要層級仍有結果。

| ID | AC／層級 | 條件與操作 | 預期／必要證據 |
|---|---|---|---|
| QA123-01 | AC01／L3 | 合格system_admin正常設定導航進入 | 七日常profile及active custom、五作業、active tuple與DB一致；九完整身份仍可只讀查，alias/system不多出日常欄；legacy/mixed真值不可冒充範本；navigation/screenshot/API/DB |
| QA123-02 | AC01/05／L3+L2 | pdm_admin及普通rd存取頁面／直接POST與history/audit | pdm_admin依baseline只讀、server裁掉不具資格的actor/reason及跨公司人員；rd無read不得洩漏；所有寫入403零domainwrite |
| QA123-03 | AC02／L1+L3 | matrix/workbench逐七profile／五row／action核對 | 業務20code與66legacy分類共86（20editable/57reference/9protected）；admin查看/管理鎖定；每role/group/action一control，同格獨立checkbox，精確server code一致，legacy明細不另勾 |
| QA123-04 | AC03／L3+L2 | matrix勾選＋本地新增/停用/恢復→workbench→matrix→單一保存→重新開 | 全部同LOCAL_DIRTY，view切換無save；一save transaction／revision及server roleBindings，不能偷偷另發roles autosave；dirty／saved／server一致 |
| QA123-05 | AC03／L3+L2 | 勾選＋未保存新增/狀態dirty取消、離開、換draft，分別save/discard/stay | 取消整份未保存修改，clientRoleId不落server；已saved角色不能刪。save只一POST，不因角色操作先提示另存；active不變、navigation保護 |
| QA123-06 | AC04／L3+L2 | 草稿、套用後active/retired與角色inactive、首轉diff/history切換 | 狀態/差異可辨，未套用不授權，不出現DEV123待啟用版本；公司統計不冒充全scope，資料與UI一致 |
| QA123-07 | AC05／L1+L2 | 偽actor/admin cookie、另一Principal、delegated system/workload逐一呼叫create/save/apply | 當前資格拒絕且零domain write；合法direct global管理者正例，原schema/session guard保留 |
| QA123-08 | AC05／L1+L2 | save/preview後撤銷global資格或換Principal再apply；已套用ID的低資格replay | apply/receipt各自重驗當前資格，不以曾可編輯/確認作token；不新增只編輯/只發布人員模式或靠synthetic身份冒充整合 |
| QA123-09 | AC02/05／L1+L2 | 改system/alias/profile metadata、protected/legacy key／未知group/action、body code或scope；合法群組拼成另一target | 422/409零domain mutation；payload不能改alias/disposition/presentation或創任意code；漏欄不清凍結內容；typed group/action映射唯一 |
| QA123-10 | AC08／L1+L2 | role absent與其他allow、higher priority mapped false；部分legacy序列、已指派缺code、custom追加及planning alias原slot | absent跳過、false deny，不union/DEFAULT補權；只驗實際原指派code coverage，alias不改priority或scope；new allowed不能覆蓋任一profile成員mapped舊false |
| QA123-11 | AC08／L2 | workspace A/B、project P1/P2、expired/withdrawn/delegation；管理row-lock等待跨session/grant期限 | 鎖等待後以當前時點驗資格，已到期拒絕；external只合法project共享交付view，workspace/下載/edit拒絕，不擴scope或期間 |
| QA123-12 | AC08／L2+L3 | 開啟合併review後實際審查、核准、退回；申請者自審、非指定reviewer、未支援kind | 同code涵蓋合併動作，但no-self/reviewer/state/type拒絕仍成立；review不允許publish或protected管理 |
| QA123-13 | AC06／L2+L3 | 保存草稿、GET差異預覽，再以原RD session做業務請求 | active/generation不變，preview無持久化/命令副作用，草稿不能授權 |
| QA123-14 | AC06／L2+L3 | 一次apply開啟action，讀command/draft引用及current；原session新請求 | publication/entries/pointer/generation/command-diff同交易一致且只有一版；下一請求允許，不需重登或另啟用 |
| QA123-15 | AC06／L2+L3 | 同session去勾action後apply，再發新業務請求 | 立即按新版本拒絕，沒有cookie/cache/source artifact補權；已下載檔不宣稱追回 |
| QA123-16 | AC07／L2+L3 | 兩管理者保存同revision不同roleChanges＋changes；混一個非法項 | 一成功一409，loserdirty保留；非法項整批零role/capability mutation，不加revision、不半建role；無silentoverwrite |
| QA123-17 | AC07／L1+L2+L3 | GET確認後改draft/base/registry/compatibility；不變bindings再確認 | stale內容409、dirty保留、重讀確認，不force/rebase已套用內容。沒有preview row/10分鐘TTL依賴；當前session/grant期間仍驗 |
| QA123-18 | AC07／L2 | 原生雙連接同ID同payload等待與不同payload/actor，覆蓋create/save/apply | 一次mutation/結果/roleBindings；舊snapshot不能猜不存在，新snapshot查回或安全重試；request ID reuse拒絕，callback無外部副作用，不強制新重試框架或attempt數 |
| QA123-19 | AC07／L2 | apply在commit前斷線及commit後drop HTTP | 前者全部rollback，後者只有一個ACTIVE版本與同一命令紀錄；以server讀回確認，不產生半套或待啟用版本 |
| QA123-20 | AC04/07／L2+L3 | 確認後尚未送apply時reload；apply送出後reload，有/無storage提示 | 前者只留saved draft，後者查command或draft套用引用/current，無自動發送/啟用；結果不明就明示，不由本地紀錄猜成功 |
| QA123-21 | AC07／L2 | 原生apply各關鍵DML邊界故障/交易abort（identity/header/entries/pointer/command） | 全部old或全部new，沒有半個角色/無紀錄active/半更新draft；成功紀錄與異動由同ledger原子存在 |
| QA123-22 | AC07／L2+L3 | apply commit後drop response/hard reload、command404/503；原結果已被後續版本取代 | 查原ID或server已套用引用，原命令與current分別顯示；無storage仍可恢復saved狀態，未知不自動換ID重送，後端同draft唯一套用/CAS兜底 |
| QA123-23 | AC06/07／L2 | 原生雙連接：RD短請求先通過舊判權並暫停其業務write；管理者apply撤權後放行舊請求，再發新請求 | apply不等無關business全域鎖；已授權短請求可完成（原業務衝突仍按原規則），新請求必拒絕。oracle取代舊write先commit屏障，不宣稱撤銷已開始操作 |
| QA123-24 | AC06／L2 | recognition/worker/export啟動後apply撤權，在最終採用或新delivery時檢查 | 新snapshot/current human/grant/policy拒絕採用，不因啟動時allow入庫/配送；任務失敗可追查，不能只驗一般短請求 |
| QA123-25 | AC09／L1+L2 | 依最終schema，以runtime直接DML publication格式/entries/status/pointer/state/identity/command結果與diff；helper越界 | 有效table/column/inherited ACL及immutable拒絕；無state UPDATE/owner/DDL補授。narrow管理寫入正例，command兼異動，不能按固定helper/表數冒充安全證據 |
| QA123-26 | AC09／L1+L2 | JSON重排/Unicode/unsafe integer、identity/status/alias/semantic registry漂移、合法能力更新及純私有檔名重排 | canonical確定、legacy byte/hash不變；未授權語意改動或錯hash拒絕，合法能力更新由PDM重算registryHash/contentHash並經自身source validation/confirmation；完整contentHash仍可變，但不要求OrgMaster逐版核可／更新compat row。純route/caller/helper路徑不改外部語意hash但coverage接線須更新；system/frozen false不被解除 |
| QA123-27 | AC09／L2+L3 | verified grouped history建current-base新草稿，確認/單一apply；legacy非法clone | 新版本/命令-diff、舊payload/原任用不改；current status/frozen保留，legacy不OR推核准；不直接回切歷史指標 |
| QA123-28 | AC11／L2 | compatibility_v2缺失/多列/NOT_READY、僅v1 READY、消費schema/source/identity/scope/protected邊界不符或compatibilityRevision競爭 | simulator明示；不相容契約或真正revision衝突時apply拒絕且原active/grants不變，不存取sibling core。正確重算的registryHash/contentHash或一般能力變更本身不是compatibility drift，不能要求OrgMaster逐版核可；READY或本地mock不能代真實consumer |
| QA123-29 | AC11/13／L4 | 真實legacy→dynamic A→dynamic B及OrgMaster正常任用/代理/特權歷史 | A下指派在B仍按原history驗provenance，不重寫；正常nativeDB/UI，不能只測第一次版本 |
| QA123-30 | AC11/13／L4 | PDM先apply再開OrgMaster任用snapshot，及兩owner交易重疊 | 前者stale expected拒絕；重疊合法舊provenance可完成，但PDM新請求採新policy/status。scope/期限/特權拒絕保留，不宣稱跨owner鎖；可與29/44/52共用旅程 |
| QA123-31 | AC10／L3 | 桌面1440×900及窄版390×844，matrix/workbench/preview/history | 無document橫overflow、遮擋／文字截斷；FMS同模式近viewport核心骨架比較 |
| QA123-32 | AC10／L3 | 僅keyboard：nav/role/mode/toggle/save/cancel/確認 | focus可見、label含role/feature/action、禁重複提交、返回focus合理 |
| QA123-33 | AC10／L3 | 正常loading、依賴失敗、明確emptyfixture、conflict/unknown | 錯誤就地可見、錯誤gate符合預期；baseline有資料卻全空／全零失敗 |
| QA123-34 | AC03/07／L2+L3 | 同Principal重登/reload；另一Principal/同Employee另一Principal、遲到response；storage可得或缺失 | 同身分fresh驗資格後讀server狀態；不同身分不套前人body/dirty/紀錄，late response不套新畫面。storage非authority/必要前提，不能跨Principal洩漏或重送他人操作 |
| QA123-35 | AC03/05/07／L1+L2+L3 | CSRF/Origin/非JSON/duplicate fields/限額、DISABLED/PAUSED；storage unavailable/quota/損壞 | 非法輸入/資格拒絕零domain write；DISABLED只讀、PAUSED可save/preview不可新apply。storage故障仍可save/apply及查server結果，不以成功持久化checkpoint當門檻 |
| QA123-36 | AC09/11／L2 | v5/v6/v7 legacy、部分priority、未知基線、grouped後static降級；先DISABLED migration再draft/template | 合法legacy雙reader不改原byte/hash/grants/pointer；migration不套矩陣範本、部署仍legacy active沿原66不因缺20中斷；動態啟用才切20，dynamic缺v2/profile不能fallback。已指派priority缺項仍拒絕，410保持；sys固定extension綁新hash不改legacy |
| QA123-37 | AC12／L2+L3 | 正常新增role名稱→本地零權限→同批勾選/save→差異/一次apply；另取消 | 正式ID/code/template/roleBindings由server且唯一；未保存可取消、draft不授權、role-only差異可套用；不新增autosave/第二個啟用步驟 |
| QA123-38 | AC12／L1+L2 | 重名（含presentation保留名RD）/ID-code/metadata/global/principal/protected繼承/alias獨立編輯/system停用；64→65、changes1240及roleChanges62限額 | 422/409零domain write；system active，九identity不變，alias不能另存action；custom只workspace/零權限且停用也計64；history列數不是角色上限 |
| QA123-39 | AC12／L3+L2 | 現有或custom角色有direct+delegated指派，draft停用後apply，原session再請求 | 草稿不停止授權，active後只該role停止；混有其他active role仍正常，全部inactive為permission deny非contract outage；不寫OrgMastergrants |
| QA123-40 | AC12／L3+L2 | 同ID角色恢復，分仍有效/已撤銷/已到期/錯scope/代理source失效指派 | 恢復前不授權；activate後僅仍合法者重新生效，保留原capabilities與身份；system保護不變 |
| QA123-41 | AC07/12／L2+L3 | mixed save/apply的unknown/並發/重登、較新draft；非法client ref/重複項、兩draft同名套用、REJECTED及late response | 一commit/revision/roleBindings，server引用及current可查；非法整批拒絕、名字claim/active CAS不半套。無storage不另造角色，REJECTED不要求不存在target GET成功，原結果與最新版本分開 |
| QA123-42 | AC09/12／L1+L2 | 最終identity/entry/命令diff ACL、漏tombstone、custom/profile/status/alias漂移與history clone | 全identity/profile可增但baseline/frozen固定；alias status同步、alias新20 entries空、system extension受保護；metadata隨publication，無獨立preview/audit同步需求，不改任用 |
| QA123-43 | AC12/10／L3 | 正常nav兩視圖新增/停用/顯示停用/恢復與勾選混編、取消、keyboard、兩viewport | 同LOCAL_DIRTY及saved revision，一次save/cancel涵蓋角色和能力，不插額外保存提示。停止/恢復影響可辨、inactive可查；FMS骨架對照，無裁切／誤自動套用 |
| QA123-44 | AC13／L4 | custom經PDM新增/套用→OrgMaster正常指派→PDM停用→OrgMaster查/撤→PDM恢復；inactive任用及snapshot race | inactive不新任用/推薦，舊歷史可讀可撤銷；仍合法可恢復、已撤/到期不復活、零grant rewrite。可共用29/30/52同一真實兩端旅程 |
| QA123-45 | AC14/08/12／L1+L2+L3 | 首轉七profile、九身份hash／原scope/priority；planning/procurement各持有及混合指派，停用/恢復canonical；偽alias到system、pdm名稱冒充特權 | 七欄/名稱/順序與SPEC一致，九身份/hash歷史不改；原slot/scope/期間分開，alias新20 entries空且status同步，合併role inactive跳過，pdm管理鎖定與server admission一致；零grant rewrite |
| QA123-46 | AC04/09/15／L1+L2+L3 | legacy QA只有review、部分edit子項/mapped false；migration→草稿/確認/一次apply；dynamic/history | QA不OR成核准、範本不自動生效、mapped false唯讀；首轉diff完整、dynamic不重套。legacy活躍時沿原66，apply後才切20，不以暫少新code中斷原業務 |
| QA123-47 | AC15/02/10／L2+L3 | 圖號或料號同格edit/review開關逐子操作建改送撤、審查核准退回；matrix/workbench單一save及另一action/grp不變 | 一個action同值、所有子caller採同code；審核不含publish，編輯不含review；同格label/keyboard可獨立選，admin只讀，busy/error/data sanity可觀察 |
| QA123-48 | AC15/02／L2 | 僅drawing.edit或part.edit，對相似generic route傳錯entityType/body group；search混合資料/batch跨target／零件model片段 | DB target決定group；另一作業403零write，混合write需全target允許原子，read只合法資料／無未授count/model欄位；unknown parent/type fail closed，old true不補權 |
| QA123-49 | AC16／L2+L3 | view-only正常preview後直接原檔/inline/Range/ZIP/CSV/CAD/BOM/package/URL；download有無view組合；export在撤權前後建立、final配送；share到期/撤權 | safe-preview可看、原bytes無download拒絕；沒安全預覽不fallback；download單獨無view仍拒絕。任務與每次配送fresh policy，無長效URL繞過；原session下一GET/Range拒絕。完整bytes manifest、HTTP evidence及UI screenshot，不宣稱追回已下載 |
| QA123-50 | AC17／L2+L3 | model.view/edit/review/publish分別有/無parent action；BOM快照、shared model、關聯、多模型包、worker最終採用，引用已發布快照及未支援model kind | 只view不下載，不靠part.view取完整model欄位；model與parent需AND，edit不造review/publish流程，引用快照不假裝重發布；撤權fresh拒絕、未知原流程保持拒絕，全部live model bindings有實際正例 |
| QA123-51 | AC16/17/08／L2+L3 | 正常share建立API從Released project_code綁project_scope_key（不得seed結果），body偽binding拒絕/欄位ACL/舊NULL；external P1只view登入後從分享連結回原入口，P2/改project_code/未交付/到期/撤權及多group包 | 僅P1有效已交付共享資料允許metadata/safe-preview，不取原檔。對workspace或其他action拒絕；mixed package逐檔全部group view/download，不能用transfer.download覆蓋未授CAD或默默漏檔 |
| QA123-52 | AC14/11/13／L4 | OrgMaster正常選七canonical/custom新任用，兩類legacy採購/生管history／代理/撤銷/到期、A→B停用恢復；system原特權入口、snapshot overlap及ready版本不符 | 日常名稱/順序與PDM一致；新指派procurement，舊planning仍原identity/provenance且可撤銷，scope/期間/priority不合併；inactive不新任用、已撤不復活、protected資格不外洩；zero grant rewrite及兩端真實UI/DB/source/current讀回 |

## 4. 覆蓋、共用與本輪oracle對照

CG123-01覆蓋20action及custom：每個實際可用method/caller有allow/deny、scope與相關業務guard，另驗inactive與長任務最終採用。可以一次套用一組fixture後，以參數化API/DB測試覆蓋全部相同policy的caller，再一次撤權驗下次請求，不要求逐route重走整套UI/套用流程。custom reviewer由正常指定reviewer流程產生，不綁builtin enum。401/session或Principal依賴失敗、404/無資料/隱藏UI不等於能力permission deny；撤權/下載拒絕案例先證明登入有效，再核對預期授權拒絕及零效果。

CG123-02為原66key/全部live route/caller與byte delivery去向：mapped-business/special-protected/unsupported-retired，檢查canonical target、required-actions AND及既有domain guards。每個live binding要有適用證據；可共用中央guard單元、route分類靜態檢查與必要targeted HTTP負例。若多route共用證據，須能證明共同guard接線與discriminator等價；不同資料/guard分支另驗。file/Range/export/share實際配送不可只靠字串搜尋。unsupported保留原拒絕證據，不刪路徑求PASS。

| 共用測試/旅程 | 可對應案例 | 保留的主要失敗風險 |
|---|---|---|
| schema/語意/資格參數化 | 03/07–12/26/36/38/42/45/46/48及CG | 誤授審核、scope/alias擴權、static補權、假actor、hash漂移 |
| 原生PG/API原子套用與故障 | 13–23/25/27/28/41 | 半套/重複套用、stale確認、回應遺失猜成功、直接SQL改policy |
| 一次UI編輯/取消/套用/重登 | 01/02/04–06/20/22/31–35/37/43/47 | 無正常入口、dirty丟失、跨Principal/late response洩漏、storage故障卡頁 |
| 原session業務/worker/配送 | 14/15/23/24/39/40/48–51及CG | 新請求沿舊allow、長任務繞撤權、view偷原檔、圖號/料號/model越權 |
| 真實OrgMaster連續往返 | 29/30/44/52 | 舊任用失效、inactive仍新指派、alias改scope、已撤/到期被恢復 |

這是實作可選的分組，不能以組PASS省略其中有不同guard的斷言。跨層的共用紀錄要指向實際步驟，不以API PASS冒充UI或native consumer。

| 原要求／案例 | 已同意的新oracle |
|---|---|
| 17/20：持久化preview、10分鐘TTL、待啟用版本 | preview即時計算，confirmation綁saved/base/consumer；只有apply會生效，reload不另走啟用 |
| 18–22：publish與activate兩次命令 | create/save/apply三mutation；apply全old或全new，drop-response查server結果，不出現新pending publication |
| 23：舊write必須先於新版完成 | 已通過判權短請求可完成，apply不等待無關business鎖；commit後新請求採新policy，長任務見24 |
| 34/35/41：storage寫後讀回失敗必禁止POST | storage輔助且可失效，仍可save/apply；server CAS/唯一套用/紀錄承擔正確性，跨Principal不讀前人資料 |
| 每case整包metadata／固定專用runner | run層共用來源/環境，case只留相關斷言與證據；重用適用工具，52/17AC/CG不縮減 |

## 5. 驗證入口與選測

未來優先沿用既有適用test/PG/browser/integration runner，必要時才加targeted入口；`test:dev-123:contracts`、`qc:dev-123:postgres/browser/integration`可作方便別名，**不是必須新增五套框架或固定名稱才能驗收**。須有可重現的case→實際命令/步驟/結果映射；aggregate可在同一次結果中列出52案/CG，各層missing/Blocked不冒充whole PASS。

| 改變的責任面 | 必要驗證／可重用範圍 |
|---|---|
| registry/evaluator/API | 受影響正反/自授權/原角色scope及合併action，適用typecheck與route分類 |
| SQL/DB privilege/原子套用 | 原生PG/ACL/CAS/fault、`npm run check:db-boundary`；主資料隔離及foreign-key等適用preflight |
| UI/導航/復原 | 真實正常旅程、dirty/unknown/存儲故障、相關兩viewport/keyboard；共用代表畫面，不逐案全拍 |
| app/package/build輸入 | 適用`npm run typecheck:app`及`npm run build:isolated`，按專案隔離要求；純文件不重建app |
| consumer/版本契約 | 受影響OrgMaster真實L4與首次rollout readback；無該repo執行範圍不啟動跨repo |
| release adapter | 只在實際改到時走AGENTS既有required gate，不為權限頁另起release流程 |

既有provider required CI不可由此plan跳過。無關歷史證據缺漏不新增阻擋，相關來源/角色/fixture/route/假設仍有效時可重用；只刷新受影響案例與依賴，不以新SHA要求整包重跑。

## 6. 最小證據與狀態

沿用repo QA產物慣例（可用output/qa/dev-123/<runId>，不要求新台帳）。run層一次記source/dirty boundary、環境與fixture、實際命令/工具及必要cleanup；case層只記caseId、斷言/實際結果、status及證據引用。actor/scope/版本是授權案例才補；transaction/receipt/DB讀回是L2才補；browser/viewport/代表畫面是L3才補；兩端reader/source是L4才補。未知與未執行如實標示，不填假N/A證據或記token/cookie/密碼。

同一有效實證可支援多case/AC，保留對應即可。必要案例失敗＝未通過、必要層缺證據＝未充分驗證、外部條件缺少＝相關部分阻塞。local slice可完成，whole仍須52項必要目的與CG及真實L4支持；不改DEV121/122原分母。預期拒絕/空值依案例判斷，unexpected error或應有資料被誤顯全空不能用build綠燈蓋掉。

完成或交接前只清本任務已驗明的runtime/UI/process/port/temporary資料，保留證據且不碰他人資源。**DEV-123完整52案、CG、editor DB/API/UI、L4與正式啟用仍NOT_RUN；OrgMaster局部切片結果見§7，不把局部結果升格為DEV-123或L4 PASS。**

## 7. 2026-10-19既有九身份相容／撤權局部結果

本輪以可獨立交付切片先解除OrgMaster的撤權及能力目錄版本耦合，不冒充完整DEV-123動態editor產品。

- AI-PDM新增`assignment-compatible-role-catalog.mjs` owner artifact builder與7／7通過的單元測試。它只產生既有九身份的新能力內容版本；任用metadata、scope、受保護deny與system_admin不變，並重算role/catalog hash。它不是runtime writer、API、migration或動態editor。
- 既有v7產物檢查通過；fixture、085與正式SQL未改。OrgMaster reader接受符合身份相容及來源/hash保護的新版本；日常能力內容不再要求OrgMaster逐版修改source或重新部署。schema、身份／scope或protected變更仍需真正相容處理。
- OrgMaster最終聚合18檔：133 PASS／1 SKIP；SKIP是未設定連線時的原生PG案例。同一原生案例另以此builder產生兩版、真正PostgreSQL JSONB view及SELECT-only consumer執行9／9 PASS；不與聚合重複加總。直接core及DELETE均拒絕，這是隔離契約／ACL驗證，不是正式或雙端UI L4。
- Owner snapshot/audit可信來源下，PDM current失敗仍可HTTP撤權、移除及純減權發布，合法重送回原結果；新增／恢復／混合擴權仍拒絕。相關DOM元件、既有catalog／actor／continuity回歸、TypeScript、OrgMaster前後端隔離build及兩repo DB boundary通過。
- Luna唯讀源碼審查未發現P1/P2；未自行執行測試，不稱獨立QC。首輪JSONB順序、HTTP重送CAS與PG拒絕碼oracle問題已修正並保留回歸；未放寬身份、資料權限或required gate。

臨時PG及port已清理，舊工作樹／既有資料保留。未執行正式migration、deploy、traffic、provider驗證、真實browser或required CI；完整七角色/custom/editor DB/API、QA52／CG與真正L4仍未完成。DEV-121／122歷史與分母未變。
