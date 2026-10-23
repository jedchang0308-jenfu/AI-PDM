# DEV-123 角色權限設定驗證計畫

建立：2026-10-12；修訂：2026-10-23。Owner：AIPDM/DEV-123。依[唯一SPEC](../specs/DEV-123-role-permission-editor-contract.md)及[本輪精簡](../specs/DEV-123-role-permission-editor-contract.md#dev-123-coo-simplification)；本輪已授權AI-PDM與OrgMaster隔離工作樹協同開發；進度、有效結果與缺口只在§6記錄，非獨立QC或整體PASS。

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
| QA123-50 | AC17／L2+L3 | model.view/edit/review/publish分別有/無parent action；BOM快照、shared model、關聯、多模型包、worker最終採用，引用已發布快照及未支援model kind | 只view不下載，不靠part.view取完整model欄位；model與parent需AND，edit不造review/publish流程，引用快照不假裝重發布；撤權fresh拒絕、未知原流程保持拒絕，全部live model bindings有實際正例 |
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

補充實際HTTP限制：`dev123-native-http-byte-range-oneoff.json`只證無session的完整／Range請求401與recognition PDF Range416；未有合法HTTP principal正例，不認列bytes／Range撤權旅程PASS。其task-owned Next runtime、port及生成的next-env差異已清理；既有native delivery/adopt bytes證據仍有效。

發布相容首敗保留：`release-prefix-regression-r1.log`為current38誤用舊profile，r2為舊probe profile邊界；修正明確投影後r3通過。r4為舊workflow測試仍期待寬條件，更新相同權威契約後r5通過。沒有執行失敗producer或provider寫入。

首敗與修正：PR 首輪 DEV012 fixture 缺 v2 projection／project 分享欄位；087 CRLF source hash 與 Git LF 不符，已統一 LF，SQL 語意及 applied hash 未改，`release-lf-final-r2.log` 51 PASS。`contracts-20261023-r1..r3.log`、早期 typecheck、native r1..r11、UI R1 及原 CI 失敗均保留。UI R1 缺 app CSS；R2 已補齊，產品採 plain CSS，無 Tailwind。上述 final CI 驗最終來源，不將舊失敗改為 PASS。

覆蓋採§4共用映射：contracts 支持 schema／hash／20 action／舊 66 key、scope／資格與實際 caller 子項；native PG 支持交易／ACL／history／撤權與競爭；UI 支持實際列舉的操作與 viewport。每案的其餘必要斷言仍未自動關閉。52 QA／17 AC／CG 是目的及覆蓋索引，不是固定測試檔數、52 次旅程或額外簽核；與 OrgMaster 的 24 目的／OM-C／H 索引可引用同一有效結果。

剩餘交付：正常 IdP／SSO 與真實管理者／任用往返、需要實際 bytes／長任務採用的未覆蓋子項，以及 schema／consumer／writer 正式 rollout 與正式驗收仍未完成。10/23人類已允許 jenfu-platform-prod／orgmaster-prod 的034–036相容migration與reader部署；不含人員指派改寫、IAM或Secrets。依schema→consumer→writer順序沿既有受保護workflow交付。沒有宣稱 52 QA／17 AC／CG 整體 PASS，也未自動套用新矩陣或改人員指派。

不記帳密、token、cookie；只清本任務已驗明的 runtime／port／temp。後續僅刷新改變的責任面；required CI 與既有正式執行器仍有效。
