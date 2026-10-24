# DEV-123 角色權限設定驗證計畫

建立：2026-10-12；修訂：2026-10-24。Owner：AIPDM/DEV-123。依[唯一SPEC](../specs/DEV-123-role-permission-editor-contract.md)及[本輪精簡](../specs/DEV-123-role-permission-editor-contract.md#dev-123-coo-simplification)；本輪已授權AI-PDM與OrgMaster隔離工作樹協同開發；進度、有效結果與缺口只在§6記錄，非獨立QC或整體PASS。

## 1. 驗證範圍與方式

保留七角色/五作業/20action、九歷史身份/固定alias、必要後端判權與OrgMaster任用分工。驗證實際未授權、資料完整性及錯誤恢復，不另加租戶開通、計費、公開SLA或SaaS規模條件。

| 層級 | 證明的結果／所需證據 |
|---|---|
| L1 契約/單元 | schema/hash/語意映射/evaluator/input正反；測試輸入、斷言及結果即可，不要browser或SQL欄位 |
| L2 API/原生PG | apply原子性/CAS/防重/ACL/真實allow-deny與競爭；用原生DB讀回/HTTP及必要fault證據，不以mock聲稱交易通過 |
| L3 正常UI | 正常導航/真實控制完成設定、matrix/workbench同值、狀態與viewport；同一旅程留代表畫面/操作及必要API/DB對照，不逐case重拍 |
| L4 真實兩端 | 實際PDM producer與OrgMaster reader/正常任用往返；可用一個連續旅程覆蓋29/30/44/52，simulator不能代替 |

可先完成獨立PDM本地slice；缺L4只阻止相關整合/首次切換或whole宣告。10/23起可在兩專案授權隔離工作樹做本機開發／驗證；PDM branch／PR／required CI／既有protected release workflow發布與驗收已授權並須遵守既有要求；10/23人類另已允許jenfu-platform-prod／orgmaster-prod之034–036相容migration與reader部署；不含人員指派改寫、IAM或Secrets。未來如需角色化QC，同一人可依序工作，證據不可稱獨立。只在相關source/角色/fixture/路徑/假設改變時補驗受影響案例；SHA或無關文件更新不自動全量重跑，provider-required CI保持。

## 2. Fixture 與正常旅程

後續runtime遵守AGENTS的task-owned資料/PG/工作目錄與process/port/cleanup限制；先確認原始snapshot的既有資料不變條件再建前置fixture，不碰primary或正式資料。相關主資料/foreign-key/隔離build證據可共用同一次有效preflight，不每case重做。現行contract pair以producer manifest的34欄為欄位基準，資料責任為三資料集；DEV-035 manager fence保留，SQL ACL收斂期間不預先寫新函式簽名。

fixture含核准legacy v5/v6/v7及grouped前置版本、九身份/七profile、合法global human_privileged管理者、rd/manager/qa/pdm/custom及mixed roles；workspace A/B只測既有隔離，不代表新增多租戶；external project P1/P2、有效/到期/撤銷direct/delegated任用、採購/生管不同原scope/priority、另一Principal與workload。業務parent資料為合法Released/draft/review/model/package等，記fixture來源與必要mutation。

fixture只準備前置資料，不能seed受測草稿／角色新增／apply或任用成功結果。L2可用明示app-owned adapter／owner提供的只讀contract，不由PDM建立或修改OrgMaster schema；L4由各owner準備自己相容reader與隔離資料，實際新增／任用／停用／恢復走受測UI/API。不需TEST_ONLY enablement binding或owner mode。

主要旅程：正常首頁→設定/流程/角色與權限→建立草稿→矩陣與工作台混合角色/能力編輯→保存/取消/重開→確認差異→**一次套用權限**→讀回active/異動→原session新業務請求allow/deny→停用/恢復。另測view-only分享與原檔下載拒絕。history恢復建立新draft/apply，不直接切舊指標。

## 3. 保留的52項驗收

QA123-01..52及17AC/CG保留；52是驗收目的數，不是52個環境／旅程／報告。本輪資料／防重／相容機制改按§4的等效oracle判定，不縮業務與安全分母。

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
| QA123-13 | AC06／L2+L3 | 保存草稿、GET差異預覽，再以原RD session做業務請求 | active version/hash不變，preview無持久化/命令副作用，草稿不能授權 |
| QA123-14 | AC06／L2+L3 | 一次apply開啟action，讀command/draft.applied及current；原session新請求 | publication/entries/pointer/draft與成功套用-diff同交易一致且只有一版；下一請求允許，不需重登或另啟用 |
| QA123-15 | AC06／L2+L3 | 同session去勾action後apply，再發新業務請求 | 立即按新版本拒絕，沒有cookie/cache/source artifact補權；已下載檔不宣稱追回 |
| QA123-16 | AC07／L2+L3 | 兩管理者保存同revision不同roleChanges＋changes；混一個非法項 | 一成功一409，loserdirty保留；非法項整批零role/capability mutation，不加revision、不半建role；無silentoverwrite |
| QA123-17 | AC07／L1+L2+L3 | GET確認後改draft revision/base/registry；同bindings不變再確認 | stale內容409、dirty保留、重讀確認，不force；draft revision＋base version/hash精確綁差異，無獨立draft hash/confirmation hash/TTL或consumer revision依賴；當前資格仍驗 |
| QA123-18 | AC07／L2 | 原生雙連接：同draftId建立／同revision保存；apply同request ID同payload等待及不同payload/actor | create同binding取既有草稿、不同binding拒絕；save一成功一衝突且roleBindings可讀回；apply一次結果，不同binding拒絕。fresh讀回，callback無外部副作用；不要求create/save命令ledger |
| QA123-19 | AC07／L2 | apply在commit前斷線及commit後drop HTTP；create/save回應遺失 | apply前者全部rollback、後者只有一ACTIVE版本與成功套用紀錄；create/save由草稿ID/revision/roleBindings讀回，不重播舊patch或產生第二角色；無半套或待啟用版 |
| QA123-20 | AC04/07／L2+L3 | 確認後未送apply即reload；apply送出後reload，有/無storage提示 | 前者只留saved draft，後者查原request或draft.applied/history；無自動寫入，結果不明就明示，不由本地紀錄猜成功 |
| QA123-21 | AC07／L2 | 原生apply各關鍵DML邊界故障/交易abort（identity/header/entries/pointer/command） | 全部old或全部new，沒有半個角色/無紀錄active/半更新draft；成功紀錄與異動由同ledger原子存在 |
| QA123-22 | AC07／L2+L3 | apply commit後drop response/hard reload、command404/503；結果被新版取代；save後已有較新revision | 原request/draft.applied與current分開顯示；save讀回目前saved內容及roleBindings，不自動重送舊patch。無storage仍可恢復saved，未知不換ID重送；同draft唯一publication與CAS兜底 |
| QA123-23 | AC06/07／L2 | 原生雙連接：RD短請求先通過舊判權並暫停其業務write；管理者apply撤權後放行舊請求，再發新請求 | apply不等無關business全域鎖；已授權短請求可完成（原業務衝突仍按原規則），新請求必拒絕。oracle取代舊write先commit屏障，不宣稱撤銷已開始操作 |
| QA123-24 | AC06／L2 | recognition/worker/export啟動後apply撤權，在最終採用或新delivery時檢查 | 新snapshot/current human/grant/policy拒絕採用，不因啟動時allow入庫/配送；任務失敗可追查，不能只驗一般短請求 |
| QA123-25 | AC09／L1+L2 | runtime直接DML publication/entries/pointer/identity/成功套用紀錄與diff；管理寫入越界 | 有效table/column/inherited ACL與immutable拒絕；runtime無owner/DDL。合法narrow apply正例；不要求state表、固定helper/表數或失敗命令ledger |
| QA123-26 | AC09／L1+L2 | JSON重排/Unicode/unsafe integer、identity/status/alias/semantic registry漂移及純私有檔名重排 | canonical確定、legacy byte/hash不變；語意改變破壞正確hash，純route/caller/helper路徑不改外部語意hash但coverage接線須更新；system/frozen false不被解除 |
| QA123-27 | AC09／L2+L3 | verified grouped history建current-base新草稿，確認/單一apply；legacy非法clone | 新版本/命令-diff、舊payload/原任用不改；current status/frozen保留，legacy不OR推核准；不直接回切歷史指標 |
| QA123-28 | AC11／L2+L4 | 首次/契約變更上線以不相容schema/registry/history consumer驗證；已相容契約內A→B時使額外readiness view不存在或不可讀 | 不相容阻止受影響writer上線，不能由marker/mock代真實consumer；正常apply不讀readiness/revision、不新增owner mode或每次發布核准，成功切B。真實grant/DB缺失仍拒絕，不冒稱離線可用 |
| QA123-29 | AC11/13／L4 | 真實legacy→dynamic A→dynamic B及OrgMaster正常任用/代理/特權歷史 | A下指派在B仍按原history驗provenance，不重寫；正常nativeDB/UI，不能只測第一次版本 |
| QA123-30 | AC11/13／L4 | PDM先apply再開OrgMaster任用snapshot，及兩owner交易重疊 | 前者stale expected拒絕；重疊合法舊provenance可完成，但PDM新請求採新policy/status。scope/期限/特權拒絕保留，不宣稱跨owner鎖；可與29/44/52共用旅程 |
| QA123-31 | AC10／L3 | 桌面1440×900及窄版390×844，matrix/workbench/preview/history | 無document橫overflow、遮擋／文字截斷；FMS同模式近viewport核心骨架比較 |
| QA123-32 | AC10／L3 | 僅keyboard：nav/role/mode/toggle/save/cancel/確認 | focus可見、label含role/feature/action、禁重複提交、返回focus合理 |
| QA123-33 | AC10／L3 | 正常loading、依賴失敗、明確emptyfixture、conflict/unknown | 錯誤就地可見、錯誤gate符合預期；baseline有資料卻全空／全零失敗 |
| QA123-34 | AC03/07／L2+L3 | 同Principal重登/reload；另一Principal/同Employee另一Principal、遲到response；storage可得或缺失 | 同身分fresh驗資格後讀server狀態；不同身分不套前人body/dirty/紀錄，late response不套新畫面。storage非authority/必要前提，不能跨Principal洩漏或重送他人操作 |
| QA123-35 | AC03/05/07／L1+L2+L3 | CSRF/Origin/非JSON/duplicate fields/限額；migration後尚未套用；storage unavailable/quota/損壞 | 非法輸入/資格拒絕零domain write；migration不改active/grants且首次writer依相容順序上線，不要求DISABLED/PAUSED開關。storage故障仍可save/apply及讀回 |
| QA123-36 | AC09/11／L2 | v5/v6/v7 legacy、部分priority、未知基線、dynamic後static降級；migration與首份草稿 | 雙reader不改原bytes/hash/grants/pointer；migration不套範本、不新增mode。legacy沿原66，首次apply後才切20；dynamic不能fallback或降為不相容reader。缺priority拒絕、410保持、sys extension不改legacy |
| QA123-37 | AC12／L2+L3 | 正常新增role名稱→本地零權限→同批勾選/save→差異/一次apply；另取消 | 正式ID/code/template/roleBindings由server且唯一；未保存可取消、draft不授權、role-only差異可套用；不新增autosave/第二個啟用步驟 |
| QA123-38 | AC12／L1+L2 | 重名含保留名RD／ID-code／metadata或scope繼承／alias獨立編輯／system停用；64→65及過大payload | 非法整批零domain write；system active、九identity不改，alias不另存action；custom固定workspace且零權限，inactive也計64，history列數不是角色上限；輸入bound按最終受測契約 |
| QA123-39 | AC12／L3+L2 | 現有或custom角色有direct+delegated指派，draft停用後apply，原session再請求 | 草稿不停止授權，active後只該role停止；混有其他active role仍正常，全部inactive為permission deny非contract outage；不寫OrgMastergrants |
| QA123-40 | AC12／L3+L2 | 同ID角色恢復，分仍有效/已撤銷/已到期/錯scope/代理source失效指派 | 恢復前不授權；activate後僅仍合法者重新生效，保留原capabilities與身份；system保護不變 |
| QA123-41 | AC07/12／L2+L3 | mixed save/apply的unknown/並發/重登、較新draft；非法client ref/重複項、兩draft同名套用、失敗及late response | 一次save revision/roleBindings、一次成功apply紀錄；非法整批拒絕、名稱claim與active CAS不半套。無storage不另造角色；失敗命令無須存在，原套用結果與current分開 |
| QA123-42 | AC09/12／L1+L2 | 最終identity/entry/apply紀錄ACL、漏tombstone、custom/profile/status/alias漂移與history clone | 新identity/profile可增但baseline/frozen固定；alias同步且無第二份20entries、system受保護。metadata在publication、成功命令兼diff，沒有state/preview/audit副本同步，不改任用 |
| QA123-43 | AC12/10／L3 | 正常nav兩視圖新增/停用/顯示停用/恢復與勾選混編、取消、keyboard、兩viewport | 同LOCAL_DIRTY及saved revision，一次save/cancel涵蓋角色和能力，不插額外保存提示。停止/恢復影響可辨、inactive可查；FMS骨架對照，無裁切／誤自動套用 |
| QA123-44 | AC13／L4 | custom經PDM新增/套用→OrgMaster正常指派→PDM停用→OrgMaster查/撤→PDM恢復；inactive任用及snapshot race | inactive不新任用/推薦，舊歷史可讀可撤銷；仍合法可恢復、已撤/到期不復活、零grant rewrite。可共用29/30/52同一真實兩端旅程 |
| QA123-45 | AC14/08/12／L1+L2+L3 | 首轉七profile、九身份hash／原scope/priority；planning/procurement各持有及混合指派，停用/恢復canonical；偽alias到system、pdm名稱冒充特權 | 七欄/名稱/順序與SPEC一致，九身份/hash歷史不改；原slot/scope/期間分開，alias新20 entries空且status同步，合併role inactive跳過，pdm管理鎖定與server admission一致；零grant rewrite |
| QA123-46 | AC04/09/15／L1+L2+L3 | legacy QA只有review、部分edit子項/mapped false；migration→草稿/確認/一次apply；dynamic/history | QA不OR成核准、範本不自動生效、mapped false唯讀；首轉diff完整、dynamic不重套。legacy活躍時沿原66，apply後才切20，不以暫少新code中斷原業務 |
| QA123-47 | AC15/02/10／L2+L3 | 圖號或料號同格edit/review開關逐子操作建改送撤、審查核准退回；matrix/workbench單一save及另一action/grp不變 | 一個action同值、所有子caller採同code；審核不含publish，編輯不含review；同格label/keyboard可獨立選，admin只讀，busy/error/data sanity可觀察 |
| QA123-48 | AC15/02／L2 | 僅drawing.edit或part.edit，對相似generic route傳錯entityType/body group；search混合資料/batch跨target／零件model片段 | DB target決定group；另一作業403零write，混合write需全target允許原子，read只合法資料／無未授count/model欄位；unknown parent/type fail closed，old true不補權 |
| QA123-49 | AC16／L2+L3 | view-only正常preview後直接原檔/inline/Range/ZIP/CSV/CAD/BOM/package/URL；download有無view組合；export在撤權前後建立、final配送；share到期/撤權 | safe-preview可看、原bytes無download拒絕；沒安全預覽不fallback；download單獨無view仍拒絕。任務與每次配送fresh policy，無長效URL繞過；原session下一GET/Range拒絕。完整bytes manifest、HTTP evidence及UI screenshot，不宣稱追回已下載 |
| QA123-50 | AC17／L2+L3 | model.view/edit/review/publish分別有/無parent action；BOM快照、shared model、關聯、多模型包、worker最終採用，引用已發布快照及未支援model kind | 只view不下載，不靠part.view取完整model欄位；單純model.edit不改parent時可獨立；同時改parent及模型review/publish依實際target驗對應parent action AND，edit不造review/publish流程，引用快照不假裝重發布；撤權fresh拒絕、未知原流程保持拒絕，全部live model bindings有實際正例 |
| QA123-51 | AC16/17/08／L2+L3 | 正常share建立API從Released project_code綁project_scope_key（不得seed結果），body偽binding拒絕/欄位ACL/舊NULL；external P1只view登入後從分享連結回原入口，P2/改project_code/未交付/到期/撤權及多group包 | 僅P1有效已交付共享資料允許metadata/safe-preview，不取原檔。對workspace或其他action拒絕；mixed package逐檔全部group view/download，不能用transfer.download覆蓋未授CAD或默默漏檔 |
| QA123-52 | AC14/11/13／L4 | OrgMaster正常選七canonical/custom新任用，兩類legacy採購/生管history／代理/撤銷/到期、A→B停用恢復；system原特權入口、snapshot overlap及current/schema/version/hash不符 | 日常名稱/順序與PDM一致；新指派procurement，舊planning仍原identity/provenance且可撤銷，scope/期間/priority不合併；inactive不新任用、已撤不復活、protected資格不外洩；zero grant rewrite及兩端真實UI/DB/source/current讀回 |

## 4. 覆蓋與案例對照

CG123-01覆蓋20action/custom的實際caller allow/deny、scope、業務guard、inactive及長任務最終採用；可用參數化測試，不逐route重走UI。401、Principal依賴失敗、404、空資料或藏按鈕不算permission deny證據；先證明合法登入，再驗預期拒絕及零效果。

CG123-02覆蓋原66key及全部live route/caller/bytes去向，檢查server canonical target、必要actions AND及原guard。共用中央測試須證明接線等價，分支不同另驗；實際file/Range/export/share配送不能只靠靜態字串。unsupported-retired保留原拒絕，不能刪路徑或新增業務求PASS。

| 可共用的一次測試／旅程 | 案例範圍 |
|---|---|
| schema／evaluator／guard參數化 | 03、07–12、26、36、38、42、45、46、48與CG |
| 原生PG／API競爭與故障 | 13–23、25、27、28、41 |
| 正常UI編輯／套用／重登 | 01、02、04–06、20、22、31–35、37、43、47 |
| 原session業務／worker／bytes | 14、15、23、24、39、40、48–51與CG |
| 真實OrgMaster連續往返 | 28–30、44、52 |

與 OrgMaster DEV-058 共用三類選驗：契約／資格、原生 PG／ACL／交易、一次正常雙端旅程；上表是覆蓋索引。CG、OM-C、H1～H5 不另設 runner、簽核或逐案截圖；同失效機制、owner 與判定條件的有效證據直接引用，不因新 SHA／文件重跑。不同 owner／guard／bytes、長任務最終採用與 commit 後丟 HTTP 回應仍保留各自斷言；API 不冒充 UI，simulator 不冒充真 consumer，52 QA／17 AC／CG 的目的及未通過事實不變。

| 受影響案例 | 本輪適用oracle |
|---|---|
| 13/14/17/25/36/42 | active version/hash及draft revision為唯一binding；無額外state/mode/generation、draft/confirmation hash或副本同步 |
| 18–22/41 | create以draft ID、save以revision防重並讀草稿；apply才有成功命令ledger，unknown先讀回，不補REJECTED/PENDING狀態機 |
| 28–30/35/44/52 | 真實consumer相容是首次／契約變更上線相依；一般A→B套用不查readiness view/revision或管理UI在線 |
| 23/24/49 | 沿10/19決策：已判權短請求可完成，新請求／長任務最終採用／新配送用新policy |
| 20/22/34/35/41 | 沿10/19決策：browser可選，saved及CAS由server保證；跨Principal隔離不變 |

這些是明示替換尚未實作的技術oracle；52項業務／安全目的、17AC與CG沒有刪除，不把刪掉的技術機制另列待補。

## 5. 選測與最小證據

優先沿用既有適用test/PG/browser/integration工具，只有缺必要驗證能力才加入口；不固定套件／runner命名，不另做重複完整報告。

| 改變的責任面 | 必要驗證 |
|---|---|
| evaluator／registry／API | 受影響正反、scope/合併action/自授權及實際caller接線 |
| SQL／DB privilege／apply | 原生PG的ACL/CAS/故障／unknown，及`npm run check:db-boundary` |
| UI／復原 | 正常操作、dirty/unknown、storage故障與相關keyboard／兩viewport，可用代表畫面 |
| app/package/build輸入 | 適用typecheck／isolated build及AGENTS隔離要求；純文件不重建app |
| 外部contract／首次writer上線 | 真實OrgMaster相容與部署版本readback；沒有該repo執行範圍就只標相關缺口 |
| release本身 | 既有required CI/release執行器，不新增DEV-123日常簽核 |

沿既有QA產物一次記run的來源／dirty boundary、環境／fixture、實際命令與必要cleanup；各case只記ID、斷言／實際結果、status及證據引用，actor/scope/版本／transaction／viewport等只補與判定有關的內容。可直接引用同一原始結果支援多案，不能只記組別PASS或新增不具證據的N/A。

只刷新受影響案例與依賴；有效source/fixture/角色/路徑/假設未變的證據可重用，SHA或無關文件不觸發全量重跑，provider required CI照常。失敗＝未通過、必要層缺證據＝未充分驗證、外部條件缺少＝相關部分阻塞；whole完成仍須52項必要目的、CG與真實兩端支持，不改DEV-121/122分母。

## 6. 2026-10-23 本機 implementation evidence

本節是結果的唯一入口；保留既有標題供連結。下列證據各自只支持實際來源、身分、環境與斷言。原始首敗保留在相同 output 目錄，不因後續通過而覆寫；本機結果不是獨立 QC 或正式驗收。

| 證據 | 已驗結果／限制 |
|---|---|
| [PR #474 CI 39972128497](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/39972128497)，head `5aee8dd44b72ae7ea991996973919123aab14cc6` | provider readback：DEV-012 Isolated PostgreSQL Cutover、Production Slice QC 均 SUCCESS；支持該來源的產品及發布實作；後續本節forward-prefix相容修正須刷新CI，不等同正式 migration／部署或真實使用者驗收 |
| `output/qa/dev-123/dev123-contracts-final-20261023-1792763201613.log`、`typecheck-app-final-20261023-1792763201613.log` | pure contracts：Node 8＋Vitest 520 PASS；registry 九身份／20 action／66 legacy binding；typecheck PASS。單元／source 接線證據，未驗正常 SSO |
| `output/qa/dev-123/ci-cutover-native-replay-r6.log`；OrgMaster completion 的 `output/qa/dev-058/native-policy-20261023-final-r5.log` | 前者 2 tests／22 native assertions PASS；後者 12 native cases PASS：real SQL／ACL、原子 rollback、CAS／replay、actual Org reader／history、inactive／alias、pagination、Platform epoch 與等待鎖期間撤權；cluster／port／temp 清理 PASS。身分為 synthetic-local-only，非 IdP 登入 |
| OrgMaster completion 的 `output/qa/dev-058/native-org-journey-20261023-r12.log` | 7 cases PASS：真 HTTP commit 後丟回應／查回／重播、實際指派與發布後 PDM guard 允許、D1/D2 stale 與真雙連線停用競爭、未發布草稿中間版 history、Org writer 等待時撤銷 session 零效果；source bytes／cleanup PASS。synthetic issuance＋real cookie auth／DB，非正常 SSO 或正式 L4；其後 r13 失敗保留，未執行的 QA12 擴充不認列 |
| `output/playwright/dev123-20261023/report.json`／`request-log.json`＋`report-r2.json`／`screenshots/r2-style/` | R1實際 component 的 mock `/applications` POST一次及dirty／復原子斷言可沿未變source重用；R2補 tokens／globals／responsive CSS／app shell，在 1440×900 與 390×844 查核 matrix／workbench、dirty／save／cancel、一次 apply、history、409／503／unknown、停用恢復與焦點；document 無橫向 overflow，source bytes 不變，runtime 已清理。mock API／actor，僅 L3 局部證據 |
| `output/qa/dev-123/app-ci-local-01..08.log`、`output/qa/dev-117/` | application 初跑 773 中 772 PASS；補原 fixture 的 drawing resourceGroup 後 focused 16 PASS。continuous 初跑 472 中 471、QC 523 中 521 PASS；修正歷史 closed35 fixture／舊 current35 預期後，診斷 13＋worker owner 42 PASS，abort 6 PASS。歷史負例保留，現行 38 仍被 closed35 live diagnostic 拒絕，不聲稱該 probe 可讀 current38 ledger |
| `output/qa/dev-123/build-isolated-20261023.log`、`lint-20261023-r1.log` | 隔離 build 的 artifact／primary invariant／cleanup PASS（primary database absent）；該 build 早於最後服務修正，不作 final artifact 證據。lint 0 errors／9 warnings（含本功能 hook warning）；final source 以以上 provider CI 為準 |
| 既有 `unit9`／preview 43／route 6、bilateral Node 1＋Vitest 1、release 14＋31＋107 | 保留可重用的實際子項，不另作新 gate 或重複完整旅程；bilateral 是 contract 層，不能代替正常雙端操作 |

後續共享證據（來源仍為5aee產品snapshot，release接線修改未變這些app輸入）：

| 證據 | 已驗結果／限制 |
|---|---|
| Org `native-org-journey-20261023-r15.log`、`delegation-inactive-regression-20261023-r1.log` | 8 native cases＋41 focused tests及typecheck PASS；補 direct/delegated inactive Deny、active sibling Allow與歷史delegation可讀可撤；r14真產品失敗保留。非正常SSO |
| Org `native-manager-acl-20261023-r1.log`、`native-catalog-integrity-20261023-r2.log`、`schema-first-20261023-r3.log` | 真PG ACL／current-history malformed拒絕／schema-first安裝順序 PASS。086–088先安裝時Org035 helpers尚不存在、v1九列19欄及舊pointer/publication/read grants不變；之後034–036與runtime contract可讀。非provider發布或GO |
| `output/qa/dev-123/dev123-native-byte-authority-oneoff.json`、`dev123-native-preview-adopt-oneoff.json` | 真PG actual worker source delivery 39bytes/hash相符，真apply撤權後下次配送拒絕；`completePreviewJobAsync`正例accepted／1 derivative、2581bytes/hash讀回，另一先claim的job撤權後accepted=false／零derivative。既有合法PNG payload，未啟cloud/CAD worker；不冒稱Range／recognition formalization |
| Org `output/qa/dev-123/reviewer-principal-isolation-native-r19-run.log` | 9 native cases PASS：B經實際selector成為reviewer且HTTP200完成，合法A/C通過part review判權後由非指定reviewer fence回404且pending不改；這是authenticated business concealment，不是permission-deny或獨立no-self branch證據。A apply成功、C於service讀／重用command得MANAGER_REQUIRED且ledger仍1；不稱C HTTP403已驗。r1–r18為loader／fixture前提失敗保留 |
| `output/qa/dev-123/release-preparation/normal-sso-entry-readback.json` | 正式現serving入口正常PDM→Platform Google-only login，未提交帳密、未取得session；只證入口，不證DEV123／L4／SSO成功。瀏覽器／PID／lease已清理 |
| `output/qa/dev-123/release-compatibility-final-r1.log`；前置 `release-prefix-routing-r5.log`、`release-owner-compatibility-r1.log` | 最終337 PASS：35-prefix→38 forward、prefix/runner SQL漂移拒絕、historical reuse限定、closed35拒current38，以及full-owner精確daily-entry沿用sealed special prepare／migration-admission；缺證據與錯誤workflow先拒絕。前置48／286結果保留；新版provider CI另驗 |
| Org `native-org-journey-20261023-r19.log`；PDM `nullable-submission-focused-20261023-r1.log` | 9 native cases PASS，包含真GET /api/submissions非空200→停止Org HTTP並證ECONNREFUSED→同PDM資料200→恢復Org；grants／audit不變，PG／port／temp清理PASS。r18真PG42P08由共用nullable submissionId加text CAST修正，既有兩測試檔10 PASS及DB boundary PASS；synthetic session，非正常SSO |

最後唯讀審查另找出第二個normalize daily gate與另一proof caller未適配歷史prefix；修正共用readback boundary、補installed bundle join及受限daily admission後，`release-compatibility-second-boundary-r1.log` 228 PASS。正例通過第二normalize gate再由缺native proof拒絕，sealed prepare bytes與物件數不變；錯workflow、LOCAL_TEST、source、deadline、混用special均有拒絕斷言。`release-final-affected-r1.log` 的planner／release-core／database／authorization四組PASS支持cc79版本，後續改動仍由新版CI驗證。

新增受影響驗證：2026-10-23人類確認沿用現有公司Google管理員登入政策後，service／post-lock既有兩檔29 tests PASS，涵蓋aal1合法manager及session強度不一致／非法值、revoked／epoch／profile與不合資格actor拒絕。未部署087與release source/applied pins同步；`assurance-policy-release-contract-r1.log` 30 PASS、typecheck PASS。`dev123-native-aal1-role-policy-current-r1.json` 真PG以簽發／驗證且registered為aal1的合法direct global manager完成create/save/apply，session撤銷後下一write拒絕且零domainmutation；首敗為fixture用runtime讀core計數被ACL拒絕，改用task owner唯讀計數，未新增grant。仍非正常SSO；新版required CI另驗。`release-preparation/existing-browser-session-readback.json`只證現serving正常既有session與單因素UI，非fresh SSO或新版matrix套用。

`dev123-native-recognition-authority-current-r1.json`：真PG durable initiator→claim→completeJob正例review_ready／1 candidate；真apply停用RD後，另一已claim job的completeJob拒絕且canonical/history計數不變，所有task資源清理完成。只支持worker採用，未驗recognition正式化HTTP；其首敗fixture修正記錄保留。

同型nullable query查核：新增fileId／sourceId兩helper改明確text CAST；`nullable-source-file-focused-r1.log` 12 PASS。`dev123-native-capability-helper-current-r1.json`真PG驗sourceId未指定／指定合法來源允許，真apply停用RD後同source拒絕403；submission helper未有現成合法fixture，標NOT_RUN，未冒稱整段下載已驗。兩次runner前提失敗保留；所有資源清理完成。靜態檢查本PR新增／修改SQL已無相同首用IS NULL／IS NOT NULL的未定型參數。

CI `39983011836` 的0c3來源：Production Slice QC SUCCESS；DEV012在npm ci遇ECONNRESET，尚未進產品測試，保留該失敗。以上兩行query後來源須刷新兩個required checks，不把舊QC或網路失敗改判為新來源PASS。DB boundary的staged對branch前一commit檢查曾拒087改寫；以既有`--base=origin/main`驗整個未合併slice PASS，086–088均為新增、無main migration改刪，檢查器未變（`assurance-db-boundary-source-scope.json`）。

補充實際HTTP限制：`dev123-native-http-byte-range-oneoff.json`只證無session的完整／Range請求401與recognition PDF Range416；未有合法HTTP principal正例，不認列bytes／Range撤權旅程PASS。其task-owned Next runtime、port及生成的next-env差異已清理；既有native delivery/adopt bytes證據仍有效。

發布相容首敗保留：`release-prefix-regression-r1.log`為current38誤用舊profile，r2為舊probe profile邊界；修正明確投影後r3通過。r4為舊workflow測試仍期待寬條件，更新相同權威契約後r5通過。沒有執行失敗producer或provider寫入。

首敗與修正：PR 首輪 DEV012 fixture 缺 v2 projection／project 分享欄位；087 CRLF source hash 與 Git LF 不符，已統一 LF，SQL 語意及 applied hash 未改，`release-lf-final-r2.log` 51 PASS。`contracts-20261023-r1..r3.log`、早期 typecheck、native r1..r11、UI R1 及原 CI 失敗均保留。UI R1 缺 app CSS；R2 已補齊，產品採 plain CSS，無 Tailwind。上述 final CI 驗最終來源，不將舊失敗改為 PASS。

覆蓋採§4共用映射：contracts 支持 schema／hash／20 action／舊 66 key、scope／資格與實際 caller 子項；native PG 支持交易／ACL／history／撤權與競爭；UI 支持實際列舉的操作與 viewport。每案的其餘必要斷言仍未自動關閉。52 QA／17 AC／CG 是目的及覆蓋索引，不是固定測試檔數、52 次旅程或額外簽核；與 OrgMaster 的 24 目的／OM-C／H 索引可引用同一有效結果。

### 2026-10-24 更新：最終來源、實際 schema 與發布中止

以下為截至2026-10-23 18:04 UTC（Asia/Taipei 10/24）的結果，補足以上歷史快照，沒有把首敗改判為PASS。PDM正式發布來源凍結在merged main `1a3f067cb2f36ff1a6e646152718782df67ad1f9`；結果補記使用獨立文件工作樹，不更換該次release capsule的來源。原始本機證據位於PDM completion工作樹的`output/qa/dev-123/`；正式收據另由provider原物件讀回並核對hash。

| 證據／範圍 | 實際結果與判定邊界 |
|---|---|
| [PR #474](https://github.com/jedchang0308-jenfu/AI-PDM/pull/474)，[merged-main CI 39986601842](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/39986601842) | 來源`1a3f067…`的DEV-012 Isolated PostgreSQL Cutover、Production Slice QC均SUCCESS；最終PR head的55 files／532 contracts與隔離build artifact／primary invariant／cleanup PASS。這取代以上「新版CI待刷新」狀態，不把source CI視為正式部署或SSO證據。 |
| `dev123-native-submission-http-current-r2.json`／`.mjs` | 真PG、signed registered AAL1 fixture、實際loopback HTTP bridge呼叫原GET route：原檔200／45 bytes與SHA-256相符；Range為200完整內容（非206）。真apply僅關閉RD的drawing.download，view／edit及其他分組能力仍在；同session完整與Range皆403且無原檔bytes，StorageAccessed計數不增。不是完整Next runtime、browser、正常SSO或正式環境。r1僅direct handler，bootstrap／governor／permission前提首敗及cleanup-order初版均保留；PG／bridge／port已清理。 |
| `dev123-qa123-50-51-native.json`／`-r6.log`；`dev123-qa123-50-51-route-diagnosis-r3.json`／`.log` | 真PG正常repository建立Released P1/P2 share後，P1 external metadata原handler 200；P1下載因缺download回403、P2因scope不符回403。真apply撤掉model.view後metadata及package皆403；part＋model要求共同成立，沒有傳回原檔bytes。r6的wrapper 503由fixture缺Firebase project／issuer前提造成，診斷原件保留；僅修ignored runner，r3驗guard及原handler，未改產品來掩蓋失敗。direct handler非網路Next／browser／SSO；PG／port／temp已清理。 |
| [PDM schema workflow 39988578179](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/39988578179) | SUCCESS；release `DEV122-RD-WIF-39988578179-1`、capsule SHA-256 `9f1b265f538037943cd2b71a617bca4547c56216744da625d1b616c78d47763a`。native migrate receipt `f2c71b5888b89b2462a5e42b98edf3748d4fb5210dca8ee8dd9a510165710430`：ledger38／applied3／replayed35，execution `ai-pdm-prod-migration-runner-7jzmp`。migration-admission `8341623db29ce19cdd5c9ac6d22e626acad6bf1d39186630cf69db60ada40e55`為FORWARD_APPLIED；candidate／entrypoint／activate／finalize確實SKIPPED，不是writer上線。 |
| PDM build／provider readback；`release-preparation/schema-{build,provenance,sbom,scan}.json` | 同capsule已產出immutable app image `sha256:b80b08a63cc8e9a67d38d4a3b33181301e0762bcab52c972d3858fb29d828e29`，provenance／SBOM／scan原收據hash讀回相符，HIGH／CRITICAL與blocking均0。此artifact尚未承接正式app traffic。 |
| OrgMaster [PR #151](https://github.com/jedchang0308-jenfu/OrgMaster/pull/151)／[PR #152](https://github.com/jedchang0308-jenfu/OrgMaster/pull/152) | 已修正受限DEV058 forward＋tool-rotation guard及已驗證rotation來源重用；required CI／master CI通過。首個run39990780793在DDL前TOOL_JOB_READBACK_REQUIRED失敗，次個prepare在dispatch前DEV013_MIGRATION_INFRA_RECEIPT_INVALID失敗，均保留，不誤稱migration成功；原digest／scope／liveJob／ordinary-forward限制未放寬。 |
| [OrgMaster workflow 39994814094](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/39994814094)，`release-preparation/org-native-migrate.json` | 來源`66e8bfc0e87ba251b4a1eccd7c409c952862de3f`；release `ORGMASTER-REL-20261023172420327-66E8BFC`。native receipt SHA-256 `5b62d06a5a2ec53cf53a4e4cdf568ec8d69dca912a9b9b08eac377f9485d2ebc`為PASS：ledger34／applied3／replayed31，execution `orgmaster-prod-migration-runner-ccxfj`。034–036正式schema已套用；workflow整體仍FAILURE。 |
| 同Org run verify／terminal；`org-candidate-smoke-safe-readback-r2.json`、`org-failed-release-terminal.json`、`org-after-failure-service-safe.json` | 候選驗證在Workflows execution `738aeffb-b0ab-444b-b0e7-144ab67604b6`的`platform_session`先回401／auth_token_invalid，未到Org callback。terminal receipt `41b51c81ccde73953239bac055f605a477f1dee56f2f37f2524af22f3ec29f2a`記PRE_ACTIVATION_ABORTED／FORWARD_APPLIED；其PASS只表示既定恢復成功。17:46:45 UTC服務讀回：舊revision `orgmaster-prod-e44ff9eaaac4`承接100%、tags空；candidate `orgmaster-prod-ffc16ebcf707`未啟用。沒有down migration或盲目重試。 |
| `release-preparation/post-schema-existing-ui-readback.json` | 舊PDM serving版在schema後，以瀏覽器既有公司session讀到九legacy角色及原RD能力；只證schema相容及既有session。未提交帳密、未套用矩陣、未改任用；不是新版UI或fresh SSO驗收。 |
| development-only SSO adapters：[PDM #479](https://github.com/jedchang0308-jenfu/AI-PDM/pull/479)、[OrgMaster #153](https://github.com/jedchang0308-jenfu/OrgMaster/pull/153)、[Platform #140](https://github.com/jedchang0308-jenfu/Jenfu-Platform/pull/140) | 各自獨立草稿及required CI通過，未合併／未納入上述production來源。local runtimes已停止；正常Google旅程因現行IdP未允許localhost而未執行，暫加localhost問題仍待人類答覆。source CI不能關閉fresh SSO／三端正常UI旅程。 |


本輪source修正與驗證增補（2026-10-24；尚未發布）：

| 證據／範圍 | 實際結果與判定邊界 |
|---|---|
| PR #480產品caller修正；`c676b68…`的五個檔案 | PG JSONB manifest原生object與SQLite string共用同一嚴格membership／schema／hash檢查；兩個CSV caller把PG Date轉ISO字串再escaping。partner focused36項及typecheck通過，僅採納這五檔，未納入development-only SSO adapter。最終source required CI仍待本PR刷新。 |
| `dev123-native-package-http-20261024-r6.json`／`.log` | 19／19 PASS：正常repository建立PDF／model／BOM三檔混合ZIP與CSV200，核對實際bytes／hash；真apply撤download後403、混合member／Range deny、scope、有效正向後corruption503、share撤銷／到期404及拒絕無StorageAccessed。r1–r5保留；是native PG＋原route loopback HTTP，非完整Next／fresh SSO／production actor驗收。 |
| `dev123-native-recognition-formalize-http-20261024-r8.json`／`.log` | 原POST formalize200建立mm canonical unit；同session真apply停用RD後第二次403，14個canonical／history／command／outbox／audit表全列hash不變。r7已驗200／403但額外fixture teardown違反FK而FAIL；r8移除無必要teardown後整段PASS。前期503為fixture company code與numbering resolver不一致，未放寬產品guard。 |
| `dev123-native-file-asset-http-20261024-r7.json`／`.log` | 原canonical route original／preview200核對hash；撤download後original／Range403但安全preview200；無ready derivative202且不回退原檔；撤view後404隱藏資源。StorageAccessed恰3次，denies不增加；r1–r6前提／oracle／cleanup失敗保留。 |
| 上列native資料及清理 | 各run來源before／after相符；task PG／HTTP bridge／port／temp已清理。只支持已列的bytes、撤權、正式化及scope斷言，不代表正常Google旅程或正式consumer／writer已通過。 |
| `dev-123-forward-continuation/provider-native38-read-r1..r4.json` | r1顯示舊observer錯將retained worker來源當成當前app；r2為歷史archive解析錯用過期寫入deadline；r3為prepare未顯式載入。修正後r4唯讀PASS：native ledger38／applied3／replayed35／38 entries，provider build/image來源核對成立；productionWrites=false、currentDatabaseReadPerformed=false、databaseLiveState=UNKNOWN、releaseAuthority=false。原失敗全保留。 |
| `dev-123-forward-continuation/focused-r3.log`／`focused-r4.log`／`focused-r5.log` | r3發布／opaque source proof七檔275／275 PASS；最後審查補prepare／deployment／source hash join、prior admission flag與歷史native fence之後，r4為276／277 PASS，唯一失敗是新增測試把既有固定檔名migrate-submission-intent誤寫為migration-submission-intent。修正oracle、加fresh index與unknown-read案例後，受影響兩檔r5為24／24 PASS；完整continuous-r1為389／391 PASS：另一失敗是sparse工作樹尚未展開qa fixture；真實回歸為畸形ref在fetch前未拒絕，已補入口結構檢查，相關兩檔r6為218／218 PASS。continuous-r2為495／497 PASS，僅native-history兩例因完整source fixture讀取未展開的既有.playwright-cli追蹤檔而ENOENT。已驗非output所有追蹤檔齊全，只重跑受影響兩例continuous-r3，2／2 PASS，保留原失敗；其餘495項沒有輸入漂移可重用，合計覆蓋本次497項斷言。這是分段有效結果，不把r2原整批改為PASS。required CI待更新。 |

- 最後guard版本的`provider-native38-read-r5.json`在程式來源`2b1068873a078ada22f888ef0ce1e72af67fe104`再次唯讀PASS，讀到同一native38原件；不賦予舊capsule新deadline或release authority。之後malformed-ref入口檢查只影響無效輸入，正常graph證據可重用。
- `abort-r1.log`為6／6 PASS；`db-boundary-r1.log`為DEV010_DB_RULESET_V1 PASS。本地`qc:dev-117:continuous`包含isolated build，25GiB容量保留要求被governor判BLOCKED，因此未啟動，不記PASS；既有required CI依planner執行受影響契約、資料庫及isolated build，不改gate或放寬保護。


新增caller來源已收斂於`813bd297e`（承接partner `f5d4a1397`，沒有local SSO或DDL）。新增與上一輪package／file-asset／formalize原件均留在`C:/VIBE CODING/.worktrees/AI_PDM/dev123-local-sso-20261024/output/qa/dev-123/`；本PR自身release回歸及來源等價核對留在rollout-evidence工作樹的`output/qa/dev-123-forward-continuation/`。

| 追加證據 | 有效結果與保留範圍 |
|---|---|
| `dev123-native-export-delivery-http-20261024-r5.json`／`.log` | PASS：原POST201／completed、detail200；真apply撤download後detail及新增POST403，job IDs/count、audit、command/outbox不增；raw download=true但view=false時effective download=false；audit綁實際Principal／company／profile。PG error／async error皆0，cleanup PASS。r1為實際legacy principal入口503；r3/r4為reports list／effective-download測試oracle錯誤，原件保留。 |
| `dev123-native-share-preview-http-20261024-r5.json`／`.log`及cases／child | 16／16 PASS：真share POST／PATCH後P1安全PNG70 bytes與hash相符；P2、原檔／ZIP、view撤權、scope／project漂移、到期／撤share皆拒絕；無derivative、hash變動、unsafe MIME及未交付檔404，無原檔fallback／StorageAccessed。r1–r4的fixture／oracle／parent PATCH／immutable ACL首敗保留。到期使用明示owner time fixture，不聲稱自然TTL／正常SSO；已有share r6 elapsed結果按未變輸入重用。 |
| `dev123-native-model-live-http-20261024-r1.json`／`.log` | PASS_WITH_NOT_RUN：實際shared-model GET／POST、純模型Draft編輯／撤權、new Released先publish deny再允許、既有已發布reuse不重發布、part與model view撤權、foreign owner／asset、未知category／status均按原規則通過；denies下完整models／audits不變。review／multipleBindings／baseline明確NOT_RUN，QA123-50仍PARTIAL，沒有新增模型審核流程。 |
| `native-source-equivalence-r2.json`、`final-contracts-r1.log`、`final-typecheck-r1.log` | 本工作樹核對上述native實際app inputs分別24／36／13份全部相同或僅canonical LF差異；每份另3個Org輸入hash未變，harness在原證據位置hash相符，沒有把缺少本地harness誤作app source漂移。合併來源Node契約通過、Vitest 60 files／577 tests PASS、typecheck PASS。最終database boundary亦PASS；兩輪Luna caller唯讀增量審查最後固定24檔diff無P1/P2 blocker；是工程自查／來源審查，不是獨立產品QC或正式驗收。 |

正式收據根目錄為`gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-RD-WIF-39988578179-1/`與`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/ORGMASTER-REL-20261023172420327-66E8BFC/`；stage收據位於各自capsule hash子目錄。本次PDM capsule deadline為`2026-10-23T18:40:19.356Z`，現已過期，不再dispatch或延長原capsule。[PR #480](https://github.com/jedchang0308-jenfu/AI-PDM/pull/480)正補齊fresh continuation：驗既有native38／source／provider收據後，新attempt只封存輸入等價關聯，明記沒有新Job、沒有當前DB讀取且live state UNKNOWN；schema-only workflow仍停止於migration，不提前啟用writer。該修正尚未通過最終required CI／合併／發布，不將工作碼唯讀PASS當成release GO。086–088與034–036已套用，後續SQL修正只能新增forward migration。

401的現有證據只能定位到Platform session邊界：refresh與operator Firebase驗證成功，不足以證明正式runtime verifier或Principal revokedBefore通過。尚無可用的既有特定Principal epoch唯讀入口，未執行任意SQL／Job、新session、Secret輪替或IAM變更。Platform正式修改不在本輪授權內；不得把這個authentication失敗記作Org業務permission deny或已證根因。

剩餘交付：釐清上述401並完成OrgMaster相容reader正式發布／真實consumer讀回，再續接PDM writer；完成正常Google／SSO、真實管理者／任用往返及尚未覆蓋的子斷言與正式驗收。現有schema成功及上述HTTP bridge／native結果只關閉其實際斷言，不自動關閉整案。10/23人類已允許jenfu-platform-prod／orgmaster-prod的034–036相容migration與reader部署；不含人員指派改寫、IAM或Secrets。依schema→consumer→writer順序沿既有受保護workflow交付。沒有宣稱52 QA／17 AC／CG整體PASS，也未自動套用新矩陣或改人員指派。

不記帳密、token、cookie；只清本任務已驗明的 runtime／port／temp。後續僅刷新改變的責任面；required CI 與既有正式執行器仍有效。

本次補記封存於2026-10-23 19:40 UTC前；新source required CI／合併狀態以[PR #480 checks](https://github.com/jedchang0308-jenfu/AI-PDM/pull/480/checks)及provider綁定的實際head為準，舊40a文件-only CI不支持本輪source。這是結果索引的live provider引用；沒有把先前待驗狀態改成正式發布或整體驗收。

### PR #480 合併後的來源與QA50核對

[PR #480](https://github.com/jedchang0308-jenfu/AI-PDM/pull/480)以head `a796e3e162b424621de5b45f2cc7ebe0a0a2d1fb`完成required CI [40013187741](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/40013187741)：DEV-012 Isolated PostgreSQL Cutover與Production Slice QC均SUCCESS，isolated build `artifact=true; primary=true; cleanup=true`。provider讀回main ruleset24077878為active、零bypass、PR required／零人工核准及兩個required checks；同head經GitHub merge為官方main `20290a9028035807280176c6e10f53c0dbb1dc1b`，app tree相同。該main的[CI 40014459702](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/40014459702)兩項required checks亦由provider讀回SUCCESS；沒有發布新capsule或改正式runtime／traffic。

QA123-50剩餘範圍經有界來源核對：model.review是Principal LIVE，需父項目review與model.review AND；多binding須區分review package內多個canonical附件（LIVE）與多個MA package綁同model的model-basis舊入口（Principal仍拒絕）。baseline只有resolve read是Principal LIVE；create／release仍為舊入口，維持拒絕。mock contract結果不算native，正補既有LIVE入口的合法fixture；未支援入口不創造新流程。52 QA／17 AC／CG目的不變。

QA50後續有界native補證：`dev123-native-model-review-http-20261024-r2.json`／`.log`為PASS_WITH_NOT_RUN。授權J來源A0029-M01.SLDDRW與A0029.SLDPRT原bytes經正常numbering201／upload200／submit200，實際selector選出role-rd-manager的canonical Principal reviewer；正常dynamic apply單獨關閉model.review及drawing.review各得approve403，每次168張ai_pdm_core全表row count／digest（含audit／command／outbox）完全不變；恢復兩者後approve200、pending刪除且唯一completed receipt綁精確Principal／profile。baseline resolve同公司**空合法part**200、foreign owner403且168表不變；這只證read入口與scope，不是已發布baseline快照／create／release證據。

來源34項直接inputs前後未變，root再以`native-model-review-source-equivalence-r1.json`核對28個tracked產品輸入與官方main20290 canonical bytes一致，其餘原harness／Org及授權CAD來源hash相符。PG ERROR/FATAL=0、asyncErrors=0，cluster／bridge／port／temp已清；使用registered synthetic AAL2 session，非fresh SSO／完整Next／native CAD語意驗收。r1在HTTP前因runner自行加入未受契約支持的universal SolidWorks magic斷言而失敗，原件保留；r2移除該假設，改核對授權實檔bytes／hash，未改產品。

雙model binding仍BLOCKED：正常upload同一CAD role會取代；需要合法CAD＋intermediate兩個role，但原授權資料夾只有SLDPRT／SLDASM／SLDDRW，未找到STEP／STP／IGES。待補合法中間格式來源，不造檔或轉檔來強行通過。model-basis及baseline create／release為既有非Principal入口，維持拒絕／未驗。QA123-50仍PARTIAL；正常Google／兩端正式actor旅程及reader→writer發布也未完成，不縮減52目的／17AC／CG。

CG01／custom reviewer與lifecycle補證：同一證據根的`dev123-native-custom-reviewer-http-20261024-r2.json`／`.log`及cases／child為PASS。實際service producer create／save／apply（非role editor HTTP／UI）生成server stable role ID／code，只給drawing與model的view／review四格，其餘含publish及fixed role沒有補權；typed Employee/workspace任用作合法前置，未冒稱新Org正常L4。授權實檔完成numbering／upload／submit後，actual selector選出custom Principal；實際停用角色後使用同一runner-issued reviewer token得approve403、168表count／digest不變，Org v4原assignment ID／roleCode／catalog version／scope／期間及persistence authority均保留；恢復相同stable ID及能力後，selector仍選原profile，同pending approve200、唯一completed receipt綁精確Principal／profile。九次HTTP，沒有為測試改產品程式。

此run的35項直接inputs前後未變；root追加不可覆寫的`native-custom-reviewer-source-equivalence-r2.json`，明記官方main20290完整commit／tree、PR480及native r2原件SHA-256，核對29個tracked產品inputs與該canonical blob相同，其餘原件hash相符。PG ERROR/FATAL=0、asyncErrors=0，cluster／bridge／port／temp已清。r1因fixture client ref缺必要client-前綴而在角色建立前被正確拒絕，原首敗保留；r2只修輸入，不放寬產品guard。同測試token由caller來源及Principal／profile對應支持，未另作獨立session ID／epoch讀回。此結果補足custom reviewer及停用停止授權／保留指派／恢復生效的工程子目的，不代fresh SSO／UI或正式兩端驗收。尚缺合法intermediate的雙binding仍BLOCKED，QA50保持PARTIAL。

### 2026-10-24 正常 SSO 續接與驗收收斂

本輪人類要求繼續正常 SSO 與可行 QA，並在驗證結束後移除本次新增的 localhost；**本輪禁止正式 migration、部署及正式資料寫入**，優先於上文歷史發布授權。本節由同一開發執行者核對既有證據，不宣稱獨立 QC，亦不縮減52 QA／17 AC／CG。

| 範圍 | 本輪已核對結果 | 尚未完成 |
|---|---|---|
| 產品來源與工程檢查 | 本輪固定核對的已合併來源`63a36ec182b2fb2931ee707858d67bffd1a7195e`；PR480來源／required CI與577 tests等原件沿用，PR481及合併main required CI亦SUCCESS。後續main511e1eda僅6個DEV122 runner／test變動，未改本輪DEV123產品輸入；見`latest-main-scope-readback-r1.json`。新文件不改app輸入 | 不以CI或本節文件當作正常登入／正式啟用 |
| 可重用native子目的 | `output/qa/dev-123-sso-acceptance/evidence-reuse-audit-r2.json`重新讀回8個最終原件。formalize、file-asset、export、safe-share-preview、shared-model、model-review及custom-reviewer七份共193個宣告輸入仍吻合，其中155個產品輸入與本輪main canonical bytes一致 | 兩份PASS_WITH_NOT_RUN維持原限制；不是重跑、fresh SSO或整案PASS |
| package／bytes | r6的19／19歷史結果及首敗保留；其後3檔source差異已在本輪以原19案例重播為r7，19／19 PASS。40宣告inputs前後一致，其中34個產品輸入與main511吻合；PG49911、bridge62944及PID4236停／port釋放、runtime目錄移除、lease釋放均讀回 | r7使用registered synthetic sessions與loopback route，非正常SSO／完整Next／正式驗收；未把r6原件改寫為新版結果 |
| 正常Google／SSO | OrgMaster以原Chrome公司登入讀Firebase Console，恢復失去控制的分頁；控制台登入仍有效。IdP原8域→9域→8域，僅新增再移除localhost，重新載入後原8域全保留。人類完成Google驗證後，私有ADC已刷新，r9 getUser唯讀前置PASS，同scope／原quota project、Email已驗證／未停用且Google身分相符 | 三端r9曾實際listening；Chrome於三個本機origin顯示ERR_CERT_AUTHORITY_INVALID，必要的人類安全頁交接未完成，正常SSO仍未執行。本輪已安全停止三端與PG、沒有正常session。原r7 app/invalid-credential／400及invalid_grant前置失敗保留，不能由r9前置通過推定正式Platform401根因或SSO成功 |
| 雙端任用／UI | OrgMaster DEV-058原24目的的21 PASS／2 PARTIAL／1 BLOCKED維持，按其既有唯一QA入口重用適用結果 | QA123-28–30／44／52的正常雙端連續旅程及相關完整UI仍待登入後實證；fixture任用不替代正常UI |
| 模型及正式發布 | model.review／resolver等已驗子項保持；086–088／034–036只引用歷史已套用收據 | QA123-50雙binding仍缺合法STEP／STP／IGES；正式Org reader受Platform401阻擋、PDM writer未啟用，且本輪禁止正式操作 |

IdP新增與前置失敗的原件位於OrgMaster `dev058-doc-readback-20261024/output/qa/dev-058/`：`company-idp-localhost-20261024-r4-baseline.json`、`r5-added.json`／`.png`、`local-sso-credential-precondition-20261024-r7.json`。末端`company-idp-localhost-20261024-r5-cleanup.json`／`.png`於2026-10-24 11:17（Asia/Taipei）重新載入讀回：`removedByThisTask=[localhost]`、`otherDomainsRemoved=[]`、`originalDomainsPreserved=true`、`cleanupPending=false`。這只證本輪設定已還原，不能當作SSO通過；原新增與失敗收據保留。 隨後為r9續接依同一授權再次新增localhost，`company-idp-localhost-20261024-r6-added.json`／`.png`重新讀回原8域加localhost，r6新增時cleanupPending=true，沒有把r5結果沿用為r6已清。末端已由OrgMaster唯一owner精確移除localhost並fresh reload，`company-idp-localhost-20261024-r6-cleanup.json`／`.png`於2026-10-24 11:37（Asia/Taipei）確認原8域完整保留、otherDomainsRemoved=[]、cleanupPending=false。

人類操作位置曾為Chrome「JED－鉦富」profile的Google Auth Library「驗證您的身分」分頁。11:17時仍在密碼頁、ADC未更新的讀回保留，沒有把口頭完成當作成功；後續人類實際通過Google驗證。指定ACCOUNT搭配單cloud-platform scope的r7 CLI因id_token不存在而exit1，屬本機參數組合，不是密碼錯誤；r8改標準不帶ACCOUNT、仍在Google頁選同身分、同scope，私有ADC刷新成功。恢復該副本原有quota_project後，`local-sso-credential-precondition-20261024-r9.json` getUser前置實際PASS。兩次callback PID31276／12340及保留auth頁已由owner釋放，不需要人類再登入。 r9三端隔離服務為Platform PID19868／11000、OrgMaster PID24344／15000、PDM PID33716／13000，PG62982；依`local-sso-runtime-20261024-r9.jsonl`均實際ready。當時正常入口為https://localhost:11000/login、https://127.0.0.1:15000/、https://localhost:13000/login；本輪等待結束後已由OrgMaster owner停其task-owned程序並確認port釋放，這些入口現在沒有本輪listener，不能再引導人類操作已回收的分頁。原失敗、缺quota metadata前置失敗及後續成功各自保留；不記錄或提交credential、token、cookie、驗證碼與含驗證參數的URL。

本輪證據audit r1未涵蓋巢狀path／sha256格式，原件保留；r2修正解析並明示package三檔差異，不改舊測試結果。額外replay最初以未定義action名稱落入25GiB預設而在啟動前BLOCKED；改用政策既有的integration_test正確類別後，新operation以10GiB有效保留獲WARNING允許，沒有capacity-risk override或刪除其他資源。r7第一次launcher把Windows路徑直接作ESM loader而在runtime前失敗，保留`package-r7.log`，改file URL後同一19案例成功於`package-r7-retry1.log`；沒有改產品或案例斷言。原件與來源核對為本工作樹`output/qa/dev-123-sso-acceptance/dev123-native-package-http-20261024-r7.json`及`native-package-r7-source-equivalence-r1.json`。後續只補正常SSO後可行旅程及其直接缺口；續接時依既有人類授權按需暫加localhost並於末端再次移除，更新實際旅程與資源清理結果。


本輪末端清理原件為OrgMaster同證據根的`local-sso-runtime-20261024-r9-cleanup.json`（2026-10-24 11:43 Asia/Taipei）：Platform sessions=0、PDM accounts=0、appsStopped/postgresStopped/postgresTempRemoved=true、activeRuntimes=0、lease已釋放。root另唯讀核對8085／11000／13000／15000／62982均無listener；owner回報只關閉本任務5個分頁，未動其他頁面。任務私有ADC／TLS仍刻意保留同受限temp供續接，ACL無繼承且僅current user可讀，不能宣稱所有暫存均刪除。原10491個直接source inputs在停止後／cleanup修正前穩定。OrgMaster僅修本機harness關閉時的Next tsconfig bytes fence，3個focused Node cases及syntax／diff PASS，保留外部改動／刪除，不因這項cleanup變更重跑PDM產品驗證。

上述r9封存判定為BLOCKED_ON_BROWSER_TLS_HANDOFF／未執行；r9末端localhost已還原。這是該次歷史結果，後續r11的登入與設定狀態以下節為準，不把r9未執行改判PASS。

### r11正常SSO與開發續接（2026-10-24）

人類完成本機HTTPS安全頁交接並明確要求AI自行登入後，由OrgMaster唯一owner沿原公司Google身分操作三端；root處理獨立PDM PR與驗收索引，沒有第二套browser／runtime。只修改隔離資料，正式migration、部署與正式資料寫入持續禁止。

| 範圍／原件 | 結果與邊界 |
|---|---|
| 正常SSO／`local-sso-three-side-session-readback-20261024-r11.json` | 04:58 UTC讀回Platform／OrgMaster／PDM同Principal、Employee、authenticatedAt與epoch0；PDM首次建帳、active／human_privileged／AAL1。normalSessionsSeeded=false，瀏覽器工作台有實際登入者。是隔離三端正常Google旅程，不是正式環境或整案PASS。 |
| PDM首敗／`local-sso-pdm-callback-failure-20261024-r11.json`、`local-sso-pdm-service-identity-20261024-r11-fixed.json` | 先前fresh callback的service_identity失敗，causeCode=invalid_grant。實際PDM google-auth-library 10.6.2忽略CLOUDSDK_CONFIG，外部Org 10.9.1取票成功不代表PDM實際SDK成功。僅既有development＋exact loopback impersonation分支明確指定私有ADC絕對路徑；相對路徑及讀取失敗拒絕。兩檔28 tests PASS，PDM實際SDK驗audience／subject／email全相符，移除臨時取證碼後新的正常SSO成功；沒有預植成功session、改共用ADC、升依賴、改IAM／Secret或放寬權限。 |
| 來源／[PR #479](https://github.com/jedchang0308-jenfu/AI-PDM/pull/479) | r11產品來源`102f40c81935243e5da7d6819f51b2f07b1f8806`。root僅採納該兩檔修正至原adapter PR，正常merge最新main `780de042134051cca53dce88d51c322d492d2546`，head `b015f7606def6afefe19691c5ad4b4f18fe36ea9`相對main僅兩檔，且兩檔與r11完全相同。[CI 40064627215](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/40064627215)兩項required checks均由provider讀回SUCCESS，維持draft。未將local SSO branch其他caller提交重複採納。root採納用的小型sparse工作樹已確認clean／remote同head／無runtime與links後ordinary remove；r11 live樹未受影響。 |
| 矩陣／OrgMaster任用／`local-sso-matrix-environment-failure-20261024-r11.json` | 正常工作台已開啟；矩陣GET /api/settings回principal_dependency_unavailable。PG FATAL實證為reserved_connection_slots，隔離PG max_connections=8／superuser_reserved=3，三端多bundle連線超出可用額度；不是業務permission deny，不能記PG error0。r11首敗保留，僅three-app journey改隔離cluster為32、原fixture預設8不變，17項focused tests PASS；r12重啟後自行沿原Google身分重登並重驗受影響UI／任用。不能僅由r11 SSO成功關閉QA123-28–30／44／52。 |

原件位於OrgMaster `C:/VIBE CODING/.worktrees/OrgMaster/dev058-doc-readback-20261024/output/qa/dev-058/`。r11為續接再次增加localhost；驗完由同一owner精確移除並fresh reload確認原8域保留，再停止本任務runtime／PG與釋放ports。目前清理未完成，不能沿用r9或r6清理收據。私有ADC／TLS的保留或移除依末端實際讀回記錄，不把正常登入權限擴張為credential或正式變更。

r11 runtime已於`local-sso-runtime-20261024-r11-cleanup.json`實讀三端exit0、app ports釋放、PG停止與port／temp清理；localhost明示保留供同任務續接，不能宣稱IdP已還原。r12的`local-sso-runtime-prelogin-20261024-r12.json`確認max_connections=32、三端sessions／PDM accounts皆0且normalSessionsSeeded=false；必須新的正常登入成功才能認列r12，不借r11填PASS。

最新main相較前述511e1eda另改`principal-published-release-package.ts`：相同Released時間以ID決定唯一最新版；這是package真正輸入變動。[DEV-122 PR #478](https://github.com/jedchang0308-jenfu/AI-PDM/pull/478)獨立記錄native前置1項＋實際Next HTTP 4項，包括等時間舊package404、有效ZIP bytes及deny；root已由provider核對其head `d0f7ab1ef843dd9db6bded81e6e93ec5aa1105fd`的[required CI 40057934966](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/40057934966)兩項SUCCESS。該slice結果按原限制引用，未在本輪重跑，不宣稱r7已驗新增排序；r7的19／19仍支持其原來源及不變機制。正式Platform 401未由本機ADC根因推定解決，Org reader／PDM writer未啟用；QA50合法STEP／STP／IGES雙binding缺口及52 QA／17 AC／CG分母保留。
