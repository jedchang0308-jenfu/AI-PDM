# DEV-123 角色權限設定驗證計畫

建立：2026-10-12；修訂：2026-10-21。Owner：`AIPDM/DEV-123`。依[唯一契約](../specs/DEV-123-role-permission-editor-contract.md)及[自用五點精簡](../specs/DEV-123-role-permission-editor-contract.md#dev-123-self-use-simplification)設計。2026-10-21已取得本機L1／應用建置、真實雙邊schema/vector與部分mock-API browser證據；實作仍進行中；原生PG18 schema/ACL smoke見§7，atomic apply、正常browser、完整L4、52案whole、required CI及正式啟用仍`NOT_RUN`。RD自查不稱獨立QC。

## 1. 驗證範圍與方式

保留七角色/五作業/20action、九歷史身份/固定alias、必要後端判權與OrgMaster任用分工。驗證實際未授權、資料完整性及錯誤恢復，不另加租戶開通、計費、公開SLA或SaaS規模條件。

| 層級 | 證明的結果／所需證據 |
|---|---|
| L1 契約/單元 | schema/hash/語意映射/evaluator/input正反；測試輸入、斷言及結果即可，不要browser或SQL欄位 |
| L2 API/原生PG | apply原子性/CAS/防重/ACL/真實allow-deny與競爭；用原生DB讀回/HTTP及必要fault證據，不以mock聲稱交易通過 |
| L3 正常UI | 正常導航/真實控制完成設定、matrix/workbench同值、狀態與viewport；同一旅程留代表畫面/操作及必要API/DB對照，不逐case重拍 |
| L4 真實兩端 | 實際PDM producer與OrgMaster reader/正常任用往返；可用一個連續旅程覆蓋29/30/44/52，simulator不能代替 |

可先完成獨立PDM本地slice；缺L4只阻止相關整合/首次切換或whole宣告。2026-10-21使用者已授權AI-PDM及OrgMaster隔離工作樹的本機協同實作與測試，但未授權正式環境、migration或部署。未來如需角色化QC，同一人可依序工作，證據不可稱獨立。只在相關source/角色/fixture/路徑/假設改變時補驗受影響案例；SHA或無關文件更新不自動全量重跑，provider-required CI保持。

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
| QA123-26 | AC09／L1+L2 | JSON重排/Unicode/unsafe integer、identity/status/alias/semantic registry漂移及純私有檔名重排 | canonical確定、legacy byte/hash不變；語意改變破壞正確hash，純route/caller/helper路徑不改外部語意hash但coverage接線須更新；system/frozen false不被解除 |
| QA123-27 | AC09／L2+L3 | verified grouped history建current-base新草稿，確認/單一apply；legacy非法clone | 新版本/命令-diff、舊payload/原任用不改；current status/frozen保留，legacy不OR推核准；不直接回切歷史指標 |
| QA123-28 | AC11／L2 | compatibility_v2缺失/多列/NOT_READY、僅v1 READY、schema/語意registry/hash/revision漂移 | simulator明示；apply拒絕且原active/grants不變，不存取sibling core；READY或本地mock不能代真實consumer，無需每次勾選新人工核准 |
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

固定本機入口為`npm run test:dev-123:contracts`，它先檢查registry產物，再執行schema/雙邊契約及受影響Vitest；執行雙邊檢查時需將`ORGMASTER_DEV058_ROOT`指向實際DEV-058工作樹。原生PG/browser/integration仍沿用既有適用runner，必要時才補targeted入口；不新增五套框架。須有可重現的case→實際命令/步驟/結果映射；aggregate可支援多案，各層missing/Blocked不冒充whole PASS。

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

完成或交接前只清本任務已驗明的runtime/UI/process/port/temporary資料，保留證據且不碰他人資源。**本輪固定契約／單元、型別、路由地圖、DB boundary及隔離build已執行；52案whole、CG、完整原生PG案例、正常browser、完整L4、required CI及正式啟用仍NOT_RUN。**本機結果不是獨立QC或Production證據。

## 7. 2026-10-21 本機執行結果

| 命令 | 結果 | 可對應目的 | 不涵蓋 |
|---|---|---|---|
| `npm run test:dev-123:contracts`＋真實`ORGMASTER_DEV058_ROOT` | PASS；registry 9 roles／20 actions／66 bindings，Node 6/6，Vitest 48檔401/401 | QA01–16、25–28、31–33、36、38、43、45–48、50–51的部分L1/API斷言；QA29/30/44/52的schema/vector前置 | 原生DB交易、正常UI與完整兩端旅程 |
| `npm run typecheck:app` | PASS | app DTO/API/UI型別 | runtime行為 |
| `node scripts/dev121-build-principal-route-map-v2.mjs --check` | PASS；149 files／171 methods／181 entries | DEV-121 route policy來源未漂移 | dynamic多資源target resolver完整語意 |
| `npm run check:db-boundary` | PASS | migration owner schema與跨app versioned read邊界 | migration實際套用、ACL readback |
| `npm run build:isolated` | PASS：本輪0227，126 pages，artifact/primary/cleanup=true；主SQLite保持不存在 | production build可成立、任務runtime清理 | 真實browser、provider、L4 |

### 較早本機快照（HISTORY_ONLY）

以下保留各輪source、失敗與當時待驗狀態；目前結果見本節最後「本輪續接」。

已保留的未完成條件：SPEC§15.3的fresh manager fence、剩餘generic caller/worker/配送、完整兩端旅程，均屬同一DEV-123/058可繼續處理的範圍。DEV121/122最新source已在基線，不把adapter推成外部阻塞。正式migration/required CI/啟用未執行，初始DISABLED/NOT_READY；52案whole/CG與全部QA目的保留。

本輪actual component + mock API Playwright harness：10 checks PASS、27 screenshots（1440/1024/390），涵蓋OPEN/APPLIED、歷史version、diff、busy、lost-response原ID查詢/exact body重試、dirty切換、DISABLED readonly及不可套用的中性disabled樣式。證據=output/qa/dev-123/ui-targeted-20261021/report.json與runtime.json，只支持QA04/06/20/22/31/33/35/43/47部分UI行為，非正常登入或L4。browser/server已關且port釋放，harness前次失敗與修前畫面保留。native PG18新035/087 schema/ACL smoke PASS；最後app/CSS隔離build PASS。

歷史來源（01:09前版035/087，source hash見原報告）：2026-10-21 forward-only修正：staged DB boundary首次拒絕修改已提交034/086（即使未正式套用），原始失敗保留；未放寬checker。034/086已恢復HEAD原文，新增OrgMaster 035_dev058_ai_pdm_compatibility_definer_read.sql與PDM 087_dev123_role_policy_candidate_validation.sql。035只授PDM受控apply owner唯讀contract權；087補候選DB驗證及source profiles，僅在DISABLED/generation0且無dynamic publication時，以table lock復原086導入的衍生project_scope_key，pre-087分享保持NULL，tokens/packages/其他業務欄位不變，新分享仍由DB綁定且不可修改。正式執行仍在本任務排除範圍。新序列staged boundary已PASS（OrgMaster25／PDM24 governed files），原生PG18重驗已PASS（下段）。先前只改034/086的native PASS是舊source實驗證據，不移用成新序列PASS。


2026-10-21新035/087原生PG18 fresh replay PASS：schema/ACL、雙邊contract read、候選內容正反、DISABLED拒絕及share binding/immutable均通過，維持NOT_READY/DISABLED。原始logs、fixtures、source hashes與cleanup統一引用OrgMaster QA§7及實作工作樹 output/qa/dev-058/native-pg-forward-only-20261021-010919/report.json，不重建多份證據台帳；非PG17 release、enabled atomic apply、正常登入UI、L4或production驗收。原始失敗及舊source結果保留。

### 鎖後管理授權修正（2026-10-21，原生競爭待驗）

OrgMaster035新增 ai-pdm.role-policy-manager.v1 manifest 與兩個contract函式；PDM087新增受控apply鎖定helper。apply專用READ COMMITTED，所有等待後另一statement重新驗account、session、epoch、exact Principal/direct/global system_admin及identity-link/grant/session期限。一般business request不新增policy鎖，create/save維持原隔離，沒有人工簽核。

新source固定入口：PDM Node4/4＋Vitest25檔227/227 PASS；OrgMaster5檔29 PASS/1 SKIP；typecheck、route map及雙邊staged DB boundary PASS。本次fresh-fence app隔離build PASS（126頁、artifact/primary/cleanup=true）；新source原生schema/ACL/validator smoke PASS（下段）；manager正向與鎖等待撤權/到期競爭仍NOT_RUN，不把01:09舊source證據移用成fresh fence PASS；whole52/24與正式環境維持未完成。

新source原生PG18兩段smoke已PASS：034/035、086/087、雙邊runtime SELECT、owner SELECT與foreign core/UPDATE拒絕、真builder候選與4個竄改負例、runtime helper拒絕、DISABLED apply拒絕及share binding/immutable。035 SHA=80ae5123812f9909ca17b2581fe2638576cf182905bc11761f937595ec9271ee；087 SHA=8ce23faf5e6bc3ca05d7e497ba9d3da5d1ca1394467d4e124c22e6b744750012。首次resume未使用PDM cwd/alias loader而ERR_MODULE_NOT_FOUND，原log保留；改用既有loader重跑，沒有為此改產品。證據統一在OrgMaster實作工作樹 output/qa/dev-058/native-pg-manager-schema-20261021-0133/report.json；包括4份原始logs與runner。PID41724/port61062及首次PID46188/port55237均已停止/釋放，task cluster已刪。

這是schema/ACL/validator smoke，不是新manager資格正例或鎖等待撤權/identity-link到期競爭，也未執行positive ENABLED apply、正常雙端browser或正式L4。NOT_READY/revision0、DISABLED/generation0不變；首次失敗與01:09舊source證據未改寫。


### 本輪續接（2026-10-21，0254）

本輪本機可整合實作目標已達成；DEV-058／DEV-123整案仍 In Progress／正式 rollout disabled。

| 現行入口 | 實際結果與證據範圍 |
|---|---|
| OrgMaster test:dev-058:contracts | 7檔37 PASS／1 SKIP；包含三類發布入口、JSONB roundtrip、legacy／未知hash格式及減權／舊draft回歸。SKIP是未帶獨立PG環境的原案例；另有下列native實證，不改其原SKIP旗標 |
| AI-PDM test:dev-123:contracts | 48檔401 PASS＋Node6 PASS；typecheck／route map亦PASS，真實v7 vector及35／14欄契約一致 |
| Build／DB boundary | PDM0227 isolated build PASS（126頁、artifact/primary/cleanup=true，主SQLite原本不存在且仍不存在、容量lease已釋放）；OrgMaster final audit-id build PASS；另有受影響governance store/API/command三檔32 PASS；最終staged DB boundary PASS（OrgMaster25／AI-PDM26 governed files），diff/cached diff check均PASS |
| 隔離PG18 | actual PDM service create/save/preview/apply、同ID併發／重播、draft CAS、stale base與末端audit故障rollback PASS；actual OrgMaster decoder／v2-fenced指派與發布／PDM evaluator完整角色生命週期PASS |
| Targeted browser | OrgMaster actual GovernanceCenter＋adapter/mock API：8 checks、9 screenshots（自訂角色、普通配人隔離system_admin、expectedCatalog tuple、inactive可撤銷、390唯讀與1440/390無overflow）；PDM role editor：10 checks、27 screenshots，share page：4 cases、4 screenshots。正常登入／HTTP全旅程不在此主張內 |

OrgMaster畫面直接證據：實作工作樹 output/qa/dev-058/ui-targeted-20261021/ui-targeted-results.json，使用actual consumer驗證frozen v7與domain-builder inactive fixture；原harness失敗log保留。

Native直接證據：OrgMaster實作工作樹 output/qa/dev-058/native-pg-bilateral-audit-id-20261021/report.json（最新共用append guard與最新PDM主線後重驗）。正常domain命令完成PDM新增角色→OrgMaster任用→PDM停用且立即不授權（Org任用歷史保留）→Org撤銷→PDM恢復且不復活任用→Org明確恢復，PDM才重新允許；最後generation=3。任用寫入走actual applyDraftCommand／publishGovernance與identity-fenced v2 writer，沒有用owner DML直接改測試中的任用。初始化workspace／governance／READY／ENABLED是明示owner fixture，Platform auth-state是stub、session為合成；不是正常HTTP／登入browser／Platform／PG17 release／production proof。先前八次執行保留於 native-pg-bilateral-20261021-final/report.json；最新第9次因harness缺PDM_DATA_DIR而失敗，第10次只補task-owned資料目錄後PASS，沒有為此改產品。原始log、實際來源hash及兩個PID/start token／port／task root清理readback均已保存。

這輪實證找到並修正JSONB key重排造成的歷史來源誤拒。新V3 publication與audit使用optional hashFormat=orgmaster.sorted-json.v1，先JSON value roundtrip再排序object keys，array順序保留；三類TS publisher均在同交易補綁版本ID／snapshotHash的audit；版本綁定使用獨立UUID commandId，原business commandId／auditReference／receipt不改。共用append在同一write lock／transaction拒絕任何已存在commandId；實際FMS重用內部publication ID回COMMAND_ID_REUSED且零寫入，原命令重送仍回原receipt。無marker的舊版本及audit沿原exact hash，unknown marker拒絕；commandHash／舊commands.canonicalJson、已套migration與舊receipt未改。部署前須唯讀確認既有未標記V3 audit是否含巢狀detail.scope等資料且仍能通過原exact chain驗證；若JSONB排序已失去原preimage，需先另行處理相容性，不以新marker補算或放寬舊驗證；本輪未讀正式資料，不能假稱已確認無此舊資料；既有bootstrap／rekey producer保持legacy且未執行。Legacy catalog metadata只忽略object key順序，欄位集合／值及array順序仍須完全相同。

純減權發布依actual isGovernanceReduction與owner-bound歷史驗證，不把舊stored generation當live catalog CAS；新增／恢復仍驗current tuple、fresh actor及revision。切換active version時，舊draft只能用可信owner歷史證明可讀；authority仍取已發布版本，draft不能自行授權。

PDM已補submission list/detail/search的canonical group與分頁前過濾、原檔／ZIP逐成員view+download及storage前後重驗、numbering export讀取的實際內容群組、Preview／recognition完整verified initiator及worker當前Principal/session/grant／實際來源重驗。088保留舊job NULL且提醒重試；089將transfer metadata綁定新registry hash。Org035與PDM086～089只套於task-owned PG18，正式migration／資料／部署／traffic／IAM／Secret均未操作；source初始仍NOT_READY/revision0及DISABLED/generation0。

尚未關閉：正常登入HTTP/browser旅程、20action全部caller與CG01/02逐案驗收、QA24/52完整case closure、required CI及另行授權的正式首次切換。上述局部PASS只支持實際層級；不以mock browser或native synthetic session冒充正式L4。DEV121/122最新遠端main=02239aaeaac82702bbc8c4d58b38d47fca051afe已合入PDM分支540a0013b3bc8dbb6f4751f15d87494c159126f5；這次主線差異只有兩個release-recovery程式／測試，app／worker／SQL未變。任務120條path在合併未改，0227 build的app輸入維持，無須重建；先前77檔raw SHA保存紀錄仍是歷史證據。同範圍待驗不推成外部任務阻塞。
